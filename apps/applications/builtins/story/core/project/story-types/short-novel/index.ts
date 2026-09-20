import { StoryDefinition } from "../../definitions/index.js";
import { ASSISTANT_DOCUMENTS, ASSISTANT_OBJECTS } from "../../definitions/documents/assistant.js";
import { CORE_DOCUMENTS, CORE_OBJECTS } from "../../definitions/documents/core.js";
import { OUTLINE_DOCUMENTS, OUTLINE_OBJECTS } from "../../definitions/documents/outline.js";
import { PEOPLE_DOCUMENTS, PEOPLE_OBJECTS } from "../../definitions/documents/people.js";
import { TRACKING_DOCUMENTS, TRACKING_OBJECTS } from "../../definitions/documents/tracking.js";
import type { StoryTypeOptions } from "../types.js";
import { SHORT_NOVEL_FILE_LAYOUT } from "./file-layout.js";
import {
  SHORT_NOVEL_CONTEXTS,
  SHORT_NOVEL_ROLES,
  SHORT_NOVEL_RULES,
  SHORT_NOVEL_VALIDATION_MODES,
} from "./settings.js";

const objects = [...CORE_OBJECTS, ...PEOPLE_OBJECTS, ...OUTLINE_OBJECTS, ...TRACKING_OBJECTS, ...ASSISTANT_OBJECTS];

const documents = [
  ...CORE_DOCUMENTS,
  ...PEOPLE_DOCUMENTS,
  ...OUTLINE_DOCUMENTS,
  ...TRACKING_DOCUMENTS,
  ...ASSISTANT_DOCUMENTS,
].map((document) =>
  document.kind === SHORT_NOVEL_ROLES.positioning
    ? {
        ...document,
        fields: document.fields.map((field) => (field.key === "lengthType" ? { ...field, default: "short" } : field)),
      }
    : document,
);

const definition = StoryDefinition.define({
  $format: StoryDefinition.format,
  formatVersion: StoryDefinition.formatVersion,
  id: "short-novel",
  version: 1,
  label: "短篇小说",
  description: "面向紧凑篇幅、快速起势和集中回收的短篇故事。",
  manifestKind: "story-manifest",
  primaryKind: "story-book",
  roles: SHORT_NOVEL_ROLES,
  objects,
  documents,
  contexts: SHORT_NOVEL_CONTEXTS,
  validationModes: SHORT_NOVEL_VALIDATION_MODES,
  rules: SHORT_NOVEL_RULES,
});

export const SHORT_NOVEL_STORY_TYPE: StoryTypeOptions = Object.freeze({
  definition,
  storage: Object.freeze({
    file: Object.freeze({ layout: SHORT_NOVEL_FILE_LAYOUT }),
  }),
});
