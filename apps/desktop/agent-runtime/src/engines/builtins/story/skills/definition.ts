import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { BuiltinSkillDefinition } from "../../types.js";
import contract from "../contract.json" with { type: "json" };

const resolveStoryAuthoringResourcePath = () => {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const overridePath = process.env.AGENT_RUNTIME_BUILTIN_SKILLS_DIR?.trim();
  const candidates = [
    ...(overridePath ? [overridePath] : []),
    moduleDir,
    join(moduleDir, "builtins", "story", "skills"),
  ];
  const path = candidates.find((candidate) => existsSync(join(candidate, "story-assistant", "SKILL.md")));
  if (!path) {
    throw new Error(`内置故事技能资源不存在：${candidates.join(" | ")}`);
  }
  return path;
};

export const STORY_AUTHORING_ENTRY_SKILL_NAME = "story-assistant" as const;
export const STORY_AUTHORING_SKILL_NAMES = Object.freeze([
  STORY_AUTHORING_ENTRY_SKILL_NAME,
  "story-assistant-long-write",
  "story-assistant-long-analyze",
  "story-assistant-short-write",
  "story-assistant-short-analyze",
  "story-assistant-deslop",
  "story-assistant-import",
  "story-assistant-review",
] as const);

const contractSkillNames = Object.keys(contract.skillBindings).sort();
const builtinSkillNames = [...STORY_AUTHORING_SKILL_NAMES].sort();
if (JSON.stringify(contractSkillNames) !== JSON.stringify(builtinSkillNames)) {
  throw new Error("story-authoring 的技能注册与 contract.skillBindings 不一致。");
}

export const STORY_AUTHORING_SKILL = Object.freeze({
  id: "story-authoring",
  referenceName: STORY_AUTHORING_ENTRY_SKILL_NAME,
  skills: Object.freeze({
    names: STORY_AUTHORING_SKILL_NAMES,
    resolveSourcePath: resolveStoryAuthoringResourcePath,
  }),
  requiredToolCapabilities: Object.freeze([contract.capability]),
  requiredExternalTools: Object.freeze(["read", "ls", "find", "grep", "ask_user"]),
}) satisfies BuiltinSkillDefinition;
