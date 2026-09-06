import { createSyntheticSourceInfo, type ExtensionAPI, type Skill } from "@earendil-works/pi-coding-agent";
import type { TextContent, TSchema } from "@earendil-works/pi-ai";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  PluginHost,
  type PluginToolSchema,
  type RuntimePlugin,
} from "../../../../../../../../../plugin-host/src/index.js";
import type { AgentRuntimePlugin } from "../../../../../../protocol/wire.js";
import type { RuntimeAgentCommand } from "../../types.js";
import { runtimeResourcesFor } from "../../resources.js";

const requiredValue = (value: string, label: string) => {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label}不能为空。`);
  return normalized;
};

const skillFileContent = (skill: { name: string; description: string; content: string }) =>
  [
    "---",
    `name: ${JSON.stringify(skill.name)}`,
    `description: ${JSON.stringify(skill.description)}`,
    "---",
    "",
    skill.content,
    "",
  ].join("\n");

const jsonText = (value: unknown) => JSON.stringify(value) ?? String(value);

const contentAsPiText = (content: readonly unknown[], fallback: unknown): TextContent[] => {
  const blocks = content.flatMap((block): TextContent[] => {
    if (block && typeof block === "object" && "text" in block && typeof block.text === "string") {
      return [{ type: "text", text: block.text }];
    }
    return [{ type: "text", text: jsonText(block) }];
  });
  if (blocks.length > 0) return blocks;
  return [{ type: "text", text: jsonText(fallback) }];
};

export class PluginRuntimeBridge {
  private disposed = false;

  private constructor(
    private readonly host: PluginHost,
    readonly skills: readonly Skill[],
    private readonly temporarySkillRoot: string | null,
  ) {}

  static async create(plugins: readonly AgentRuntimePlugin[], cwd: string, settingsPath?: string | null) {
    const host = await PluginHost.create({
      settingsPath: settingsPath ? runtimePluginSpecifier(settingsPath, cwd) : undefined,
    });
    let temporarySkillRoot: string | null = null;
    try {
      for (const plugin of plugins) {
        const id = requiredValue(plugin.id, "插件 ID");
        const runtimePlugin: RuntimePlugin = {
          kind: plugin.kind,
          id,
          packageRoot: runtimePluginSpecifier(plugin.packageRoot, cwd),
          entry: plugin.entry ? runtimePluginSpecifier(plugin.entry, cwd) : "",
          patchPath: plugin.patchPath ? runtimePluginSpecifier(plugin.patchPath, cwd) : undefined,
          config: plugin.config ?? undefined,
        };
        await host.load(runtimePlugin);
      }

      const materialized = await materializePluginSkills(host, cwd);
      temporarySkillRoot = materialized.temporaryRoot;
      return new PluginRuntimeBridge(host, Object.freeze(materialized.skills), temporarySkillRoot);
    } catch (error) {
      await host.dispose();
      if (temporarySkillRoot) await rm(temporarySkillRoot, { recursive: true, force: true });
      throw error;
    }
  }

  toolSchemas(): PluginToolSchema[] {
    this.assertActive();
    return this.host.toolSchemas();
  }

  registerSkills(pi: ExtensionAPI, resolvedSkills: readonly Skill[]) {
    this.assertActive();
    const resolvedPaths = new Set(resolvedSkills.map((skill) => skill.filePath));
    const skills = this.skills.filter((skill) => !skill.disableModelInvocation && resolvedPaths.has(skill.filePath));
    pi.on("before_agent_start", async (event) => {
      this.assertActive();
      // Pi only advertises file-backed skills when read is enabled. Plugin-only
      // chats still need the loaded definitions, without granting filesystem tools.
      if (pi.getActiveTools().includes("read")) return;
      if (!skills.length) return;
      const content = await Promise.all(skills.map((skill) => readFile(skill.filePath, "utf8")));
      return {
        systemPrompt: [
          event.systemPrompt,
          "以下是已加载的插件技能，只在与当前请求相关时使用；使用工具仍受本轮可用工具范围限制。",
          ...content,
        ].join("\n\n"),
      };
    });
  }

  registerTools(pi: ExtensionAPI) {
    this.assertActive();
    for (const schema of this.host.toolSchemas()) {
      pi.registerTool({
        name: schema.name,
        label: schema.name,
        description: schema.description,
        parameters: schema.parameters as TSchema,
        execute: async (toolCallId, params, signal) => {
          const result = await this.host.executeTool({
            callId: toolCallId,
            name: schema.name,
            arguments: params,
            signal,
          });
          if (result.isError) throw new Error(result.error.message);
          return {
            content: contentAsPiText(result.content, result.value),
            details: {
              value: result.value,
              meta: result.meta ?? null,
              additionalContexts: result.additionalContexts ?? null,
            },
            ...(result.concludesTurn ? { terminate: true } : {}),
          };
        },
      });
    }
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    try {
      await this.host.dispose();
    } finally {
      if (this.temporarySkillRoot) {
        await rm(this.temporarySkillRoot, { recursive: true, force: true });
      }
    }
  }

  private assertActive() {
    if (this.disposed) throw new Error("插件运行时桥已经关闭。");
  }
}

export const createPluginRuntimeBridge = async (command: RuntimeAgentCommand) => {
  const pluginResources = runtimeResourcesFor(command).plugins;
  const plugins = pluginResources?.items ?? [];
  return plugins.length > 0
    ? PluginRuntimeBridge.create(plugins, command.workspacePath, pluginResources?.settingsPath)
    : null;
};

const materializePluginSkills = async (host: PluginHost, cwd: string) => {
  const summaries = await host.listSkills({ cwd });
  const skills: Skill[] = [];
  let temporaryRoot: string | null = null;

  try {
    for (const summary of summaries) {
      const definition = await host.getSkill(summary.name, { cwd });
      if (!definition) continue;

      let filePath = definition.path && existsSync(definition.path) ? definition.path : null;
      if (!filePath) {
        temporaryRoot ??= await mkdtemp(join(tmpdir(), "isle-plugin-skills-"));
        const skillDir = join(temporaryRoot, definition.name);
        await mkdir(skillDir, { recursive: true });
        filePath = join(skillDir, "SKILL.md");
        await writeFile(filePath, skillFileContent(definition), "utf8");
      }

      const resourceBase = definition.resourceBase;
      const baseDir = resourceBase?.kind === "directory" ? resourceBase.path : dirname(filePath);
      skills.push({
        name: definition.name,
        description: definition.description,
        filePath,
        baseDir,
        sourceInfo: createSyntheticSourceInfo(filePath, {
          source: `plugin:${definition.provider}`,
          scope: "temporary",
          baseDir,
        }),
        disableModelInvocation: !definition.invocation.modelInvocable,
      });
    }

    return { skills, temporaryRoot };
  } catch (error) {
    if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
};

const runtimePluginSpecifier = (specifier: string, cwd: string) =>
  ["./", "../", ".\\", "..\\"].some((prefix) => specifier.startsWith(prefix)) ? resolve(cwd, specifier) : specifier;
