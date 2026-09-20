import { posix } from "node:path";
import type { IsleSkillDefinition, IsleToolDefinition } from "@isle/app-sdk";
import {
  assertProtocolImplementation,
  protocolSatisfies,
  protocolKey,
  type AnyProtocolDefinition,
} from "../../../core/protocol.js";

export type StorySkillRequirement = {
  name: string;
  tools: readonly string[];
  skills: readonly string[];
  resources: readonly string[];
  resourceDirectories: readonly string[];
  actions: readonly string[];
};
export type StoryRegistryInput = {
  tools: readonly IsleToolDefinition[];
  skills: readonly IsleSkillDefinition[];
  resources: Readonly<Record<string, string>>;
  requirements: readonly StorySkillRequirement[];
  requiredContract: AnyProtocolDefinition;
  providedContract: AnyProtocolDefinition;
  implementation: object;
};

function uniqueNames(items: readonly { name: string }[], label: string) {
  const names = new Set<string>();
  for (const item of items) {
    if (!item.name || names.has(item.name))
      throw new Error(`${label}名称无效或重复：${item.name}`);
    names.add(item.name);
  }
  return names;
}

/** Application policy only. The host receives ordinary SDK tools and skills. */
export function validateStoryRegistry(input: StoryRegistryInput) {
  const toolNames = uniqueNames(input.tools, "工具");
  const skillNames = uniqueNames(input.skills, "技能");
  const requirementNames = uniqueNames(input.requirements, "技能依赖");
  for (const skill of input.skills) {
    if (!skill.description.trim() || !skill.content.trim())
      throw new Error(`技能内容为空：${skill.name}`);
    if (!requirementNames.has(skill.name))
      throw new Error(`技能未声明依赖：${skill.name}`);
  }
  if (!skillNames.has("story-assistant"))
    throw new Error("缺少故事入口技能 story-assistant");
  if (!protocolSatisfies(input.providedContract, input.requiredContract)) {
    throw new Error(
      `故事技能协议不兼容：需要 ${protocolKey(input.requiredContract)}，实际 ${protocolKey(input.providedContract)}`,
    );
  }
  assertProtocolImplementation(input.requiredContract, input.implementation);
  const story = input.tools.find((tool) => tool.name === "story");
  if (!story) throw new Error("缺少故事工具 story");
  const properties = story.parameters.properties as
    | Record<string, { type?: string; anyOf?: { const?: unknown }[] }>
    | undefined;
  const required = story.parameters.required as string[] | undefined;
  for (const key of ["workspaceId", "action"]) {
    if (!properties?.[key] || !required?.includes(key))
      throw new Error(`story 缺少必填参数 ${key}`);
  }
  if (properties?.workspaceId.type !== "string")
    throw new Error("story.workspaceId 必须是字符串");
  const actions = new Set(properties?.action.anyOf?.map((item) => item.const));
  // These are the parameter names the skill adapter actually calls.
  const parameterRequirements = {
    story: {
      storyId: "string",
      title: "string",
      targetId: "string",
      documentKinds: "array",
      changeSet: "object",
    },
    isle_story_skill: { name: "string" },
    isle_story_skill_resource: { skillName: "string", path: "string" },
  };
  for (const [name, parameters] of Object.entries(parameterRequirements)) {
    const tool = input.tools.find((item) => item.name === name);
    const fields = tool?.parameters.properties as
      Record<string, { type?: string }> | undefined;
    for (const [field, type] of Object.entries(parameters)) {
      if (fields?.[field]?.type !== type)
        throw new Error(`技能工具参数不兼容：${name}.${field} 需要 ${type}`);
    }
  }
  for (const tool of input.tools) {
    if (typeof tool.execute !== "function")
      throw new Error(`工具缺少实现：${tool.name}`);
  }
  for (const requirement of input.requirements) {
    if (!skillNames.has(requirement.name))
      throw new Error(`技能依赖没有对应定义：${requirement.name}`);
    for (const tool of requirement.tools) {
      if (!toolNames.has(tool))
        throw new Error(`${requirement.name} 缺少工具 ${tool}`);
    }
    for (const skill of requirement.skills) {
      if (!skillNames.has(skill))
        throw new Error(`${requirement.name} 引用了不存在的技能 ${skill}`);
    }
    for (const action of requirement.actions) {
      if (!actions.has(action))
        throw new Error(
          `${requirement.name} 引用了不支持的 story action：${action}`,
        );
    }
    const resourceKey = (path: string) => {
      const key = posix.normalize(`${requirement.name}/${path}`);
      if (
        key.startsWith("../") ||
        key === ".." ||
        posix.isAbsolute(path) ||
        path.includes("\\")
      ) {
        throw new Error(`${requirement.name} 技能资源路径越界：${path}`);
      }
      return key;
    };
    for (const path of requirement.resources) {
      if (!Object.hasOwn(input.resources, resourceKey(path)))
        throw new Error(`${requirement.name} 缺少技能资源 ${path}`);
    }
    for (const path of requirement.resourceDirectories) {
      const prefix = `${resourceKey(path).replace(/\/$/, "")}/`;
      if (!Object.keys(input.resources).some((key) => key.startsWith(prefix))) {
        throw new Error(`${requirement.name} 缺少技能资源目录 ${path}`);
      }
    }
  }
}
