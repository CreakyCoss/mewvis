import { APP_DATA_DIR_NAME, productId } from "@mewvis/product-config";
import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { defineTool } from "@mewvis/app-sdk";
import { storyProjectApi } from "../adapters/project-file.js";
import { storyDocumentIdentityKey } from "../../../core/project/index.js";
import type {
  StoryDocumentIdentity,
  StoryValue,
} from "../../../core/project/types.js";
import {
  workspaceFields,
  workspaceRequired,
  output,
  projectPath,
  type WorkspaceArgs,
} from "./shared.js";

const snapshot = async (path: string) => {
  const workspace = await storyProjectApi.open(path);
  const [overview, documents, structure, projectContext] = await Promise.all([
    workspace.overview(),
    workspace.listDocuments(),
    workspace.describe(),
    workspace.readContext({ scope: "project" }),
  ]);
  return {
    status: "ready",
    overview,
    structure,
    revision: projectContext.revision,
    documents: documents.map(({ ref, displayName, updatedAt }) => ({
      ref,
      displayName,
      updatedAt,
    })),
  };
};

const storyTypes = defineTool({
  risk: "low",
  name: productId("_story_types"),
  description: "列出可创建的故事项目类型。",
  parameters: { type: "object", properties: {}, additionalProperties: false },
  output,
  execute: () => ({ types: storyProjectApi.listStoryTypes() }),
});
const inspect = defineTool({
  risk: "low",
  name: productId("_story_inspect"),
  description: "检查故事工作区兼容性，读取概览、文档和结构。",
  parameters: {
    type: "object",
    properties: workspaceFields,
    required: workspaceRequired,
    additionalProperties: false,
  },
  output,
  async execute(args) {
    const path = await projectPath(args as WorkspaceArgs);
    const compatibility = await storyProjectApi.checkCompatibility(path);
    if (!compatibility.current) {
      const hasDefinition = await lstat(
        join(path, "story", APP_DATA_DIR_NAME, "project.json"),
      ).then(
        () => true,
        () => false,
      );
      return {
        status: hasDefinition ? "incompatible" : "empty",
        compatibility,
      };
    }
    if (compatibility.status !== "compatible")
      return { status: compatibility.status, compatibility };
    return { ...(await snapshot(path)), compatibility };
  },
});
const create = defineTool({
  risk: "medium",
  name: productId("_story_create"),
  description: "在已登记的应用工作区中创建标准故事项目。",
  parameters: {
    type: "object",
    properties: {
      ...workspaceFields,
      title: { type: "string", minLength: 1, maxLength: 200 },
      storyTypeId: { type: "string", minLength: 1 },
    },
    required: [...workspaceRequired, "title", "storyTypeId"],
    additionalProperties: false,
  },
  output,
  async execute(args) {
    const input = args as WorkspaceArgs & {
      title: string;
      storyTypeId: string;
    };
    const path = await projectPath(input);
    const compatibility = await storyProjectApi.checkCompatibility(path);
    if (
      compatibility.current ||
      (await lstat(join(path, "story", APP_DATA_DIR_NAME, "project.json")).then(
        () => true,
        () => false,
      ))
    )
      throw new Error("该工作区已有故事项目");
    await storyProjectApi.create(path, {
      storyTypeId: input.storyTypeId,
      storyId: input.workspaceId,
      title: input.title.trim(),
    });
    return snapshot(path);
  },
});
const save = defineTool({
  risk: "medium",
  name: productId("_story_save_document"),
  description: "保存故事项目文档并返回更新后的项目快照。",
  parameters: {
    type: "object",
    properties: { ...workspaceFields, ref: { type: "object" }, value: {} },
    required: [...workspaceRequired, "ref", "value"],
    additionalProperties: false,
  },
  output,
  async execute(args) {
    const input = args as WorkspaceArgs & {
      ref: StoryDocumentIdentity;
      value: StoryValue;
    };
    const path = await projectPath(input);
    const workspace = await storyProjectApi.open(path);
    await workspace.saveDocument({ ref: input.ref, value: input.value });
    return snapshot(path);
  },
});
const getDocument = defineTool({
  risk: "low",
  name: productId("_story_get_document"),
  description: "读取指定故事文档的完整内容与字段定义。",
  parameters: {
    type: "object",
    properties: { ...workspaceFields, ref: { type: "object" } },
    required: [...workspaceRequired, "ref"],
    additionalProperties: false,
  },
  output,
  async execute(args) {
    const input = args as WorkspaceArgs & { ref: StoryDocumentIdentity };
    const path = await projectPath(input);
    const document = (
      await (await storyProjectApi.open(path)).listDocuments()
    ).find(
      (item) =>
        storyDocumentIdentityKey(item.ref) ===
        storyDocumentIdentityKey(input.ref),
    );
    if (!document) throw new Error("故事文档不存在");
    return { document };
  },
});
const remove = defineTool({
  risk: "medium",
  name: productId("_story_remove_document"),
  description: "移除故事项目中的一份文档。",
  parameters: {
    type: "object",
    properties: { ...workspaceFields, ref: { type: "object" } },
    required: [...workspaceRequired, "ref"],
    additionalProperties: false,
  },
  output,
  async execute(args) {
    const input = args as WorkspaceArgs & { ref: StoryDocumentIdentity };
    const path = await projectPath(input);
    const workspace = await storyProjectApi.open(path);
    await workspace.removeDocument(input.ref);
    return snapshot(path);
  },
});
const upgrade = defineTool({
  risk: "medium",
  name: productId("_story_upgrade"),
  description: "将已登记故事项目升级到当前格式。",
  parameters: {
    type: "object",
    properties: workspaceFields,
    required: workspaceRequired,
    additionalProperties: false,
  },
  output,
  async execute(args) {
    const path = await projectPath(args as WorkspaceArgs);
    const result = await storyProjectApi.upgrade(path);
    return {
      result,
      ...(result.compatibility.status === "compatible"
        ? await snapshot(path)
        : {}),
    };
  },
});
const context = defineTool({
  risk: "low",
  name: productId("_story_read_context"),
  description: "按项目或章节读取标准故事上下文，供创作助手使用。",
  parameters: {
    type: "object",
    properties: {
      ...workspaceFields,
      scope: { type: "string", enum: ["project", "chapter"] },
      targetId: { type: "string" },
    },
    required: [...workspaceRequired, "scope"],
    additionalProperties: false,
  },
  output,
  async execute(args) {
    const input = args as WorkspaceArgs & {
      scope: "project" | "chapter";
      targetId?: string;
    };
    const path = await projectPath(input);
    return {
      context: await (
        await storyProjectApi.open(path)
      ).readContext({ scope: input.scope, targetId: input.targetId }),
    };
  },
});
const validateChanges = defineTool({
  risk: "low",
  name: productId("_story_validate_changes"),
  description: "按原故事协议校验带修订版本的变更集，不写入文件。",
  parameters: {
    type: "object",
    properties: { ...workspaceFields, changeSet: {} },
    required: [...workspaceRequired, "changeSet"],
    additionalProperties: false,
  },
  output,
  async execute(args) {
    const input = args as WorkspaceArgs & { changeSet: unknown };
    const path = await projectPath(input);
    return {
      validation: await (
        await storyProjectApi.open(path)
      ).validateChanges(input.changeSet),
    };
  },
});
const commitChanges = defineTool({
  risk: "medium",
  name: productId("_story_commit_changes"),
  description: "按原故事协议原子提交已校验的变更集。",
  parameters: {
    type: "object",
    properties: { ...workspaceFields, changeSet: {} },
    required: [...workspaceRequired, "changeSet"],
    additionalProperties: false,
  },
  output,
  async execute(args) {
    const input = args as WorkspaceArgs & { changeSet: unknown };
    const path = await projectPath(input);
    const workspace = await storyProjectApi.open(path);
    const result = await workspace.commitChanges(input.changeSet);
    return { result, ...(result.committed ? await snapshot(path) : {}) };
  },
});

export const projectTools = [
  storyTypes,
  inspect,
  create,
  getDocument,
  save,
  remove,
  upgrade,
  context,
  validateChanges,
  commitChanges,
];
