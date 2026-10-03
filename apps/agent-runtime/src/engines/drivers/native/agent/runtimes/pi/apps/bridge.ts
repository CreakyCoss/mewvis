import { productId } from "@mewvis/product-config";
import {
  createSyntheticSourceInfo,
  type ExtensionAPI,
  type Skill,
} from "@earendil-works/pi-coding-agent";
import type { TextContent, TSchema } from "@earendil-works/pi-ai";
import type { RiskLevel } from "@mewvis/chat-contracts";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { ApplicationHost, type RuntimeApplication } from "@mewvis/app-host";
import type { AgentRuntimeApplication } from "../../../../../../protocol/wire.js";
import type { RuntimeAgentCommand } from "../../types.js";
import { runtimeResourcesFor } from "../../resources.js";

const requiredValue = (value: string, label: string) => {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label}不能为空。`);
  return normalized;
};

const skillFileContent = (skill: {
  name: string;
  description: string;
  content: string;
}) =>
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

const contentAsPiText = (
  content: readonly unknown[],
  fallback: unknown,
): TextContent[] => {
  const blocks = content.flatMap((block): TextContent[] => {
    if (
      block &&
      typeof block === "object" &&
      "text" in block &&
      typeof block.text === "string"
    ) {
      return [{ type: "text", text: block.text }];
    }
    return [{ type: "text", text: jsonText(block) }];
  });
  if (blocks.length > 0) return blocks;
  return [{ type: "text", text: jsonText(fallback) }];
};

export class ApplicationRuntimeBridge {
  private disposed = false;

  private constructor(
    private readonly host: ApplicationHost,
    readonly skills: readonly Skill[],
    private readonly temporarySkillRoot: string | null,
  ) {}

  static async create(
    applications: readonly AgentRuntimeApplication[],
    cwd: string,
    settingsPath?: string | null,
  ) {
    const host = await ApplicationHost.create({
      settingsPath: settingsPath
        ? runtimeApplicationSpecifier(settingsPath, cwd)
        : undefined,
    });
    let temporarySkillRoot: string | null = null;
    try {
      for (const application of applications) {
        const id = requiredValue(application.id, "应用 ID");
        const runtimeApplication: RuntimeApplication = {
          kind: application.kind,
          id,
          packageRoot: runtimeApplicationSpecifier(
            application.packageRoot,
            cwd,
          ),
          entry: application.entry
            ? runtimeApplicationSpecifier(application.entry, cwd)
            : "",
          patchPath: application.patchPath
            ? runtimeApplicationSpecifier(application.patchPath, cwd)
            : undefined,
          config: application.config ?? undefined,
        };
        await host.load(runtimeApplication);
      }

      const materialized = await materializeApplicationSkills(host, cwd);
      temporarySkillRoot = materialized.temporaryRoot;
      return new ApplicationRuntimeBridge(
        host,
        Object.freeze(materialized.skills),
        temporarySkillRoot,
      );
    } catch (error) {
      await host.dispose();
      if (temporarySkillRoot)
        await rm(temporarySkillRoot, { recursive: true, force: true });
      throw error;
    }
  }

  registerTools(
    pi: Pick<ExtensionAPI, "registerTool">,
  ): ReadonlyMap<string, RiskLevel> {
    this.assertActive();
    const risks = new Map<string, RiskLevel>();
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
      if (schema.risk !== undefined) risks.set(schema.name, schema.risk);
    }
    return risks;
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
    if (this.disposed) throw new Error("应用运行时桥已经关闭。");
  }
}

export const createApplicationRuntimeBridge = async (
  command: RuntimeAgentCommand,
) => {
  const applicationResources = runtimeResourcesFor(command).applications;
  const applications = applicationResources?.items ?? [];
  return applications.length > 0
    ? ApplicationRuntimeBridge.create(
        applications,
        command.workspacePath,
        applicationResources?.settingsPath,
      )
    : null;
};

const materializeApplicationSkills = async (
  host: ApplicationHost,
  cwd: string,
) => {
  const summaries = await host.listSkills({ cwd });
  const skills: Skill[] = [];
  let temporaryRoot: string | null = null;

  try {
    for (const summary of summaries) {
      const definition = await host.getSkill(summary.name, { cwd });
      if (!definition) continue;

      let filePath =
        definition.path && existsSync(definition.path) ? definition.path : null;
      if (!filePath) {
        temporaryRoot ??= await mkdtemp(
          join(tmpdir(), productId("-app-skills-")),
        );
        const skillDir = join(temporaryRoot, definition.name);
        await mkdir(skillDir, { recursive: true });
        filePath = join(skillDir, "SKILL.md");
        await writeFile(filePath, skillFileContent(definition), "utf8");
      }

      const resourceBase = definition.resourceBase;
      const baseDir =
        resourceBase?.kind === "directory"
          ? resourceBase.path
          : dirname(filePath);
      skills.push({
        name: definition.name,
        description: definition.description,
        filePath,
        baseDir,
        sourceInfo: createSyntheticSourceInfo(filePath, {
          source: `application:${definition.provider}`,
          scope: "temporary",
          baseDir,
        }),
        disableModelInvocation: !definition.invocation.modelInvocable,
      });
    }

    return { skills, temporaryRoot };
  } catch (error) {
    if (temporaryRoot)
      await rm(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
};

const runtimeApplicationSpecifier = (specifier: string, cwd: string) =>
  ["./", "../", ".\\", "..\\"].some((prefix) => specifier.startsWith(prefix))
    ? resolve(cwd, specifier)
    : specifier;
