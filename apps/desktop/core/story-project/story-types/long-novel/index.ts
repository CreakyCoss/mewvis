import { ASSISTANT_DOCUMENTS, ASSISTANT_OBJECTS } from "../../definitions/assistant.js";
import { CORE_DOCUMENTS, CORE_OBJECTS } from "../../definitions/core.js";
import { defineStoryType } from "../../definitions/definition.js";
import { INTERACTIVE_DOCUMENTS, INTERACTIVE_OBJECTS } from "../../definitions/interactive.js";
import { bindDocumentModels } from "../../definitions/model.js";
import { OUTLINE_DOCUMENTS, OUTLINE_OBJECTS } from "../../definitions/outline.js";
import { PEOPLE_DOCUMENTS, PEOPLE_OBJECTS } from "../../definitions/people.js";
import { TRACKING_DOCUMENTS, TRACKING_OBJECTS } from "../../definitions/tracking.js";
import {
  LONG_NOVEL_CONTEXTS,
  LONG_NOVEL_PATHS,
  LONG_NOVEL_ROLES,
  LONG_NOVEL_RULES,
  LONG_NOVEL_VALIDATION_MODES,
} from "./settings.js";

const objects = [
  ...CORE_OBJECTS,
  ...PEOPLE_OBJECTS,
  ...OUTLINE_OBJECTS,
  ...TRACKING_OBJECTS,
  ...INTERACTIVE_OBJECTS,
  ...ASSISTANT_OBJECTS,
];

const documentModels = [
  ...CORE_DOCUMENTS,
  ...PEOPLE_DOCUMENTS,
  ...OUTLINE_DOCUMENTS,
  ...TRACKING_DOCUMENTS,
  ...INTERACTIVE_DOCUMENTS,
  ...ASSISTANT_DOCUMENTS,
];

export const LONG_NOVEL_STORY_TYPE = defineStoryType({
  $format: "novel-claw.story-project",
  formatVersion: 1,
  id: "long-novel",
  version: 2,
  label: "长篇小说",
  description: "按全书大纲、分卷、章节细纲、角色状态和伏笔连续维护的长篇故事。",
  rootPath: "story",
  manifestKind: "story-manifest",
  primaryKind: "story-book",
  roles: LONG_NOVEL_ROLES,
  objects,
  documents: bindDocumentModels(documentModels, LONG_NOVEL_PATHS),
  contexts: LONG_NOVEL_CONTEXTS,
  validationModes: LONG_NOVEL_VALIDATION_MODES,
  rules: LONG_NOVEL_RULES,
});
