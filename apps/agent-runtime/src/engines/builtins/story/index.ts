import { defineBuiltin } from "../definition.js";
import { STORY_AUTHORING_SKILL } from "./skills/definition.js";
import { STORY_TOOL } from "./tool/definition.js";

export const STORY_BUILTIN = defineBuiltin({
  id: "story",
  skill: STORY_AUTHORING_SKILL,
  tools: [STORY_TOOL],
});
