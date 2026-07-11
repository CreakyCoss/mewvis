import { STORY_AUTHORING_SKILL } from "./story/skills/definition.js";
import { STORY_TOOL } from "./story/tool/definition.js";
import type { BuiltinCombinationDefinition } from "./types.js";

export const BUILTIN_COMBINATIONS = Object.freeze([
  {
    skill: STORY_AUTHORING_SKILL,
    tools: Object.freeze([STORY_TOOL]),
  },
] as const satisfies readonly BuiltinCombinationDefinition[]);
