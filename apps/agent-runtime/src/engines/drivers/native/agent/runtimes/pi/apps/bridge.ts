import { productId } from "@mewvis/product-config";
import {
  createSyntheticSourceInfo,
  type ExtensionAPI,
  type Skill,
} from "@earendil-works/pi-coding-agent";
import type { TextContent, TSchema } from "@earendil-works/pi-ai";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { AgentRuntimeApplicationTool } from "../../../../../../protocol/wire.js";
import type {
  AgentRuntimeCallbacks,
  RuntimeAgentCommand,
} from "../../types.js";

type PiTool = Parameters<ExtensionAPI["registerTool"]>[0];
export type ApplicationTool = PiTool &
  Pick<AgentRuntimeApplicationTool, "risk">;

const textContent = (
  content: readonly unknown[],
  fallback: unknown,
): TextContent[] => {
  const blocks = content.map((block): TextContent => ({
    type: "text",
    text:
      block &&
      typeof block === "object" &&
      "text" in block &&
      typeof block.text === "string"
        ? block.text
        : (JSON.stringify(block) ?? String(block)),
  }));
  return blocks.length
    ? blocks
    : [{ type: "text", text: JSON.stringify(fallback) ?? String(fallback) }];
};

/** Adapt host declarations to Pi. Application modules and settings are never loaded in Agent. */
export async function createPiApplicationResources(
  command: RuntimeAgentCommand,
  callbacks: AgentRuntimeCallbacks,
) {
  const applications = command.resources?.applications?.items ?? [];
  const tools: ApplicationTool[] = [];
  const skillContents: { skill: Skill; content: string }[] = [];
  let temporaryRoot: string | undefined;
  try {
    for (const application of applications) {
      for (const schema of application.tools) {
        if (!callbacks.executeApplicationTool)
          throw new Error("当前运行环境未连接应用宿主工具服务");
        tools.push({
          name: schema.name,
          label: schema.name,
          description: schema.description,
          parameters: schema.parameters as TSchema,
          ...(schema.risk ? { risk: schema.risk } : {}),
          execute: async (callId, args, signal) => {
            signal?.throwIfAborted();
            const result = await callbacks.executeApplicationTool!(
              {
                taskId: command.taskId,
                applicationId: application.id,
                callId,
                toolName: schema.name,
                arguments: args as Record<string, unknown>,
              },
              signal,
            );
            return {
              content: textContent(result.content, result.value),
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
      for (const definition of application.skills) {
        temporaryRoot ??= await mkdtemp(
          join(tmpdir(), productId("-app-skills-")),
        );
        // Names are display data, never directory paths.
        const directory = join(temporaryRoot, String(skillContents.length));
        await mkdir(directory);
        const filePath = join(directory, "SKILL.md");
        const content = [
          "---",
          `name: ${JSON.stringify(definition.name)}`,
          `description: ${JSON.stringify(definition.description)}`,
          "---",
          "",
          definition.content,
          "",
        ].join("\n");
        await writeFile(filePath, content, "utf8");
        const baseDir = definition.baseDir ?? dirname(filePath);
        skillContents.push({
          content,
          skill: {
            name: definition.name,
            description: definition.description,
            filePath,
            baseDir,
            sourceInfo: createSyntheticSourceInfo(filePath, {
              source: `application:${application.id}`,
              scope: "temporary",
              baseDir,
            }),
            disableModelInvocation: !definition.modelInvocable,
          },
        });
      }
    }
    return {
      tools,
      skills: skillContents.map(({ skill }) => skill),
      registerSkills(pi: ExtensionAPI, resolvedSkills: readonly Skill[]) {
        const paths = new Set(resolvedSkills.map((skill) => skill.filePath));
        const selected = skillContents.filter(
          ({ skill }) =>
            !skill.disableModelInvocation && paths.has(skill.filePath),
        );
        if (selected.length)
          pi.on("before_agent_start", (event) => ({
            systemPrompt: [
              event.systemPrompt,
              "已加载应用技能；执行仍遵守当前权限配置。",
              ...selected.map(({ content }) => content),
            ].join("\n\n"),
          }));
      },
      async dispose() {
        if (temporaryRoot)
          await rm(temporaryRoot, { recursive: true, force: true });
      },
    };
  } catch (error) {
    if (temporaryRoot)
      await rm(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
}
