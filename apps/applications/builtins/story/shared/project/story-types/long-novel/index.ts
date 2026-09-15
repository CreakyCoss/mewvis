import { StoryDefinition } from "../../definitions/index.js";
import { ASSISTANT_DOCUMENTS, ASSISTANT_OBJECTS } from "../../definitions/documents/assistant.js";
import { CORE_DOCUMENTS, CORE_OBJECTS } from "../../definitions/documents/core.js";
import { OUTLINE_DOCUMENTS, OUTLINE_OBJECTS } from "../../definitions/documents/outline.js";
import { PEOPLE_DOCUMENTS, PEOPLE_OBJECTS } from "../../definitions/documents/people.js";
import { TRACKING_DOCUMENTS, TRACKING_OBJECTS } from "../../definitions/documents/tracking.js";
import type { StoryTypeOptions } from "../types.js";
import { LONG_NOVEL_FILE_LAYOUT } from "./file-layout.js";
import { LONG_NOVEL_CONTEXTS, LONG_NOVEL_ROLES, LONG_NOVEL_RULES, LONG_NOVEL_VALIDATION_MODES } from "./settings.js";

const objects = [...CORE_OBJECTS, ...PEOPLE_OBJECTS, ...OUTLINE_OBJECTS, ...TRACKING_OBJECTS, ...ASSISTANT_OBJECTS];

const documentModels = [
  ...CORE_DOCUMENTS,
  ...PEOPLE_DOCUMENTS,
  ...OUTLINE_DOCUMENTS,
  ...TRACKING_DOCUMENTS,
  ...ASSISTANT_DOCUMENTS,
];

const definition = StoryDefinition.define({
  $format: StoryDefinition.format,
  formatVersion: StoryDefinition.formatVersion,
  id: "long-novel",
  version: 4,
  label: "长篇小说",
  description: "按全书大纲、分卷、章节细纲、角色状态和伏笔连续维护的长篇故事。",
  manifestKind: "story-manifest",
  primaryKind: "story-book",
  roles: LONG_NOVEL_ROLES,
  objects,
  documents: documentModels,
  contexts: LONG_NOVEL_CONTEXTS,
  validationModes: LONG_NOVEL_VALIDATION_MODES,
  rules: LONG_NOVEL_RULES,
});

export const LONG_NOVEL_STORY_TYPE: StoryTypeOptions = Object.freeze({
  definition,
  storage: Object.freeze({
    file: Object.freeze({ layout: LONG_NOVEL_FILE_LAYOUT }),
  }),
});
