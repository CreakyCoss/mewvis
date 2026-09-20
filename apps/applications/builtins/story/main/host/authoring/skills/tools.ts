import { defineTool } from "@isle/app-sdk";
import { output } from "../../tools/shared.js";
import { STORY_AUTHORING_SKILL } from "./definition.js";

const { definitions: storySkillDefinitions, resources: storySkillResources } =
  STORY_AUTHORING_SKILL;
const skillResource = defineTool({
  risk: "low",
  name: "isle_story_skill_resource",
  description: "读取内置故事技能引用的参考资料或检查脚本。",
  parameters: {
    type: "object",
    properties: {
      skillName: { type: "string", minLength: 1 },
      path: { type: "string", minLength: 1 },
    },
    required: ["skillName", "path"],
    additionalProperties: false,
  },
  output,
  execute(args) {
    const input = args as { skillName: string; path: string };
    const parts = `${input.skillName}/${input.path}`
      .replaceAll("\\", "/")
      .split("/");
    const normalized: string[] = [];
    for (const part of parts) {
      if (!part || part === ".") continue;
      if (part === "..") {
        if (!normalized.pop()) throw new Error("技能资源路径越界");
      } else normalized.push(part);
    }
    const key = normalized.join("/");
    const content = storySkillResources[key];
    if (content === undefined) throw new Error(`故事技能资源不存在：${key}`);
    return { skillName: input.skillName, path: input.path, content };
  },
});
const storySkill = defineTool({
  risk: "low",
  name: "isle_story_skill",
  description:
    "列出或加载故事助手的专属工作流技能。开始故事创作任务时先加载 story-assistant，再按其路由加载一个子技能。",
  parameters: {
    type: "object",
    properties: { name: { type: "string" } },
    additionalProperties: false,
  },
  output,
  execute(args) {
    const input = args as { name?: string };
    if (!input.name)
      return {
        skills: storySkillDefinitions.map(({ name, description }) => ({
          name,
          description,
        })),
      };
    const skill = storySkillDefinitions.find(
      (item) => item.name === input.name,
    );
    if (!skill) throw new Error(`故事专属技能不存在：${input.name}`);
    return skill;
  },
});

export const skillTools = [storySkill, skillResource];
