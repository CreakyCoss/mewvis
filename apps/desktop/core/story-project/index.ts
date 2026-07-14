import { createStoryProjectWorkspace, openStoryProjectWorkspace } from "./project/session.js";
import {
  inspectStructuredJsonDocument,
  isJsonObject,
  replaceStructuredDocumentData,
  storyDocumentData,
  storyDocumentLabel,
} from "./documents/model.js";
import { normalizeStoryDocumentPath } from "./documents/repository.js";
import { listStoryProjectTypes } from "./story-types/index.js";

/**
 * 桌面端故事项目的唯一公共入口。
 *
 * 页面只选择故事类型并打开或创建项目；Profile、Layout、Compiler 和文件路径
 * 都由 Story Project 内部维护。技能与工具应依赖 api.ts 中的稳定能力接口。
 */
export const StoryProjects = Object.freeze({
  listTypes: listStoryProjectTypes,
  create: createStoryProjectWorkspace,
  open: openStoryProjectWorkspace,
});

/** 通用故事编辑器使用的纯文档能力，不暴露 Profile/Layout 实现。 */
export const StoryProjectDocuments = Object.freeze({
  inspect: inspectStructuredJsonDocument,
  isObject: isJsonObject,
  data: storyDocumentData,
  label: storyDocumentLabel,
  replaceData: replaceStructuredDocumentData,
  normalizePath: normalizeStoryDocumentPath,
});

export type { StoryProjectApi, StoryProjectCompilerRegistry } from "./api.js";
export type { StoryProjectOverview, StoryProjectWorkspaceApi } from "./project/session.js";
export type {
  JsonFieldMetadata,
  JsonObject,
  JsonObjectDefinition,
  JsonValue,
  StoryProjectDocument,
  StructuredJsonDocument,
} from "./documents/types.js";
export type { StoryContextBundle } from "./types.js";
export type { StoryProjectTypeSummary } from "./story-types/types.js";
