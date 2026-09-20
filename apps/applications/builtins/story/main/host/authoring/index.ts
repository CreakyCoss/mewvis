import { STORY_AUTHORING_SKILL } from "./skills/definition.js";
import { STORY_TOOL } from "./tool/definition.js";

// The capability package declares its skills and protocol tools together.
export const STORY_AUTHORING = Object.freeze({
  id: "story",
  skill: STORY_AUTHORING_SKILL,
  tools: [STORY_TOOL],
});
