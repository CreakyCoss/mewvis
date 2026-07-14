import { z } from "zod";
import type { StoryProjectApi } from "../api.js";
import type { AppliedStoryChanges, StoryCompiledProject, StoryValidationIssue } from "../types.js";
import { DeclarativeStoryValidationError, storyValidationIssue } from "./issues.js";
import { projectInfo, rebuildManifest } from "./project.js";
import { storyProfileDocumentFields, type StoryProfile } from "./profile.js";
import { validateProject } from "./validation.js";

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const canonicalPath = (value: string) =>
  value
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");

export const STORY_CHANGE_SET_MAX_OPERATIONS = 16;
export const STORY_CHANGE_SET_MAX_BYTES = 192 * 1024;

const storyChangeSetBatchSchema = z
  .object({
    workflowId: z.string().trim().min(1),
    index: z.number().int().positive(),
    total: z.number().int().positive().optional(),
    label: z.string().trim().min(1),
    final: z.boolean(),
  })
  .strict();

const storyChangeSetOperationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("upsert"), path: z.string().trim().min(1), value: z.unknown() }).strict(),
  z.object({ type: z.literal("delete"), path: z.string().trim().min(1) }).strict(),
  z
    .object({ type: z.literal("patch"), path: z.string().trim().min(1), value: z.record(z.string(), z.unknown()) })
    .strict(),
  z
    .object({
      type: z.literal("upsert-items"),
      path: z.string().trim().min(1),
      field: z.string().trim().min(1),
      items: z.array(z.record(z.string(), z.unknown())).min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("remove-items"),
      path: z.string().trim().min(1),
      field: z.string().trim().min(1),
      ids: z.array(z.string().trim().min(1)).min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("add-values"),
      path: z.string().trim().min(1),
      field: z.string().trim().min(1),
      values: z.array(z.string()).min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("remove-values"),
      path: z.string().trim().min(1),
      field: z.string().trim().min(1),
      values: z.array(z.string()).min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("append-text"),
      path: z.string().trim().min(1),
      field: z.string().trim().min(1),
      value: z.string().min(1),
      separator: z.string().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("replace-text"),
      path: z.string().trim().min(1),
      field: z.string().trim().min(1),
      oldText: z.string().min(1),
      newText: z.string(),
    })
    .strict(),
]);

export const storyChangeSetSchema = z
  .object({
    profileId: z.string().trim().min(1),
    profileVersion: z.number().int().positive(),
    storyId: z.string().trim().min(1),
    baseRevision: z.number().int().nonnegative(),
    validationProfile: z.string().trim().min(1),
    batch: storyChangeSetBatchSchema.optional(),
    operations: z.array(storyChangeSetOperationSchema).min(1).max(STORY_CHANGE_SET_MAX_OPERATIONS),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.batch?.total !== undefined && value.batch.index > value.batch.total) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["batch", "index"],
        message: "批次 index 不能大于 total。",
      });
    }
    const bytes = new TextEncoder().encode(JSON.stringify(value)).byteLength;
    if (bytes > STORY_CHANGE_SET_MAX_BYTES) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["operations"],
        message: `ChangeSet 不能超过 ${STORY_CHANGE_SET_MAX_BYTES} 字节，当前为 ${bytes} 字节；请拆成多个批次。`,
      });
    }
  });

export type StoryChangeSet = z.infer<typeof storyChangeSetSchema>;

const deepMerge = (current: unknown, patch: JsonObject): JsonObject => {
  const result = isObject(current) ? { ...current } : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete result[key];
    else if (isObject(value)) result[key] = deepMerge(result[key], value);
    else result[key] = value;
  }
  return result;
};

const assertPatchFields = (profile: StoryProfile, kind: string, patch: JsonObject) => {
  const fields = storyProfileDocumentFields(profile, kind);
  for (const key of Object.keys(patch)) {
    const field = fields[`/${key}`];
    if (!field) throw new Error(`${kind} 未声明字段：${key}`);
    if (field.readOnly || field.immutable || field.generated || field.const !== undefined) {
      throw new Error(`patch 不允许修改受保护字段：${key}`);
    }
  }
};

const requireObjectDocument = (files: Map<string, unknown>, path: string) => {
  const value = files.get(path);
  if (!isObject(value)) throw new Error(`增量操作要求 JSON 文件已存在：${path}`);
  return value;
};

export const applyChangeSet = (
  current: StoryCompiledProject,
  input: unknown,
  api: StoryProjectApi,
  profile: StoryProfile,
): AppliedStoryChanges => {
  const changeSet = storyChangeSetSchema.parse(input);
  if (changeSet.profileId !== api.identity.profileId || changeSet.profileVersion !== api.identity.profileVersion) {
    throw new Error(
      `ChangeSet Profile 与工作区不一致：期望 ${api.identity.profileId}@${api.identity.profileVersion}。`,
    );
  }
  const info = projectInfo(current);
  if (changeSet.storyId !== info.storyId) throw new Error("ChangeSet storyId 与当前故事不一致。");
  if (changeSet.baseRevision !== info.revision) {
    throw new Error(`故事已被更新：期望 revision ${changeSet.baseRevision}，当前为 ${info.revision}。`);
  }
  if (!profile.validationProfiles[changeSet.validationProfile]) {
    throw new Error(`Profile 不支持校验模式：${changeSet.validationProfile}`);
  }
  const manifestPath = api.projectManifestPath();
  const files = new Map(current.documents.map((entry) => [entry.path, clone(entry.value)]));
  const timestamp = Date.now();
  const operationIssues: StoryValidationIssue[] = [];
  for (const [operationIndex, operation] of changeSet.operations.entries()) {
    try {
      const path = canonicalPath(operation.path);
      if (path === manifestPath) throw new Error("Manifest 只能由故事运行时生成，不能直接修改。");
      const kind = api.kindForPath(path);
      const definition = api.document(kind);
      switch (operation.type) {
        case "delete":
          if (definition.cardinality === "one") throw new Error(`${definition.label} 必须保留一份，不能删除。`);
          files.delete(path);
          break;
        case "upsert":
          files.set(path, api.materializeDocument(operation.value, path, timestamp));
          break;
        case "patch": {
          if (definition.contentType === "markdown") throw new Error("Markdown 文档不支持 patch，请使用文本操作。");
          assertPatchFields(profile, kind, operation.value);
          files.set(
            path,
            api.materializeDocument(deepMerge(requireObjectDocument(files, path), operation.value), path, timestamp),
          );
          break;
        }
        case "upsert-items": {
          const file = requireObjectDocument(files, path);
          assertPatchFields(profile, kind, { [operation.field]: operation.items });
          const currentItems = file[operation.field];
          if (!Array.isArray(currentItems)) throw new Error(`${path}.${operation.field} 必须是数组。`);
          const next = [...currentItems];
          for (const item of operation.items) {
            if (typeof item.id !== "string") throw new Error("upsert-items 的每个对象必须包含字符串 id。");
            const index = next.findIndex((candidate) => isObject(candidate) && candidate.id === item.id);
            if (index >= 0) next[index] = deepMerge(next[index], item);
            else next.push(item);
          }
          files.set(path, api.materializeDocument({ ...file, [operation.field]: next }, path, timestamp));
          break;
        }
        case "remove-items": {
          const file = requireObjectDocument(files, path);
          assertPatchFields(profile, kind, { [operation.field]: [] });
          const currentItems = file[operation.field];
          if (!Array.isArray(currentItems)) throw new Error(`${path}.${operation.field} 必须是数组。`);
          files.set(
            path,
            api.materializeDocument(
              {
                ...file,
                [operation.field]: currentItems.filter(
                  (item) => !isObject(item) || typeof item.id !== "string" || !operation.ids.includes(item.id),
                ),
              },
              path,
              timestamp,
            ),
          );
          break;
        }
        case "add-values":
        case "remove-values": {
          const file = requireObjectDocument(files, path);
          assertPatchFields(profile, kind, { [operation.field]: operation.values });
          const currentValues = file[operation.field];
          if (!Array.isArray(currentValues) || currentValues.some((item) => typeof item !== "string")) {
            throw new Error(`${path}.${operation.field} 必须是字符串数组。`);
          }
          const next =
            operation.type === "add-values"
              ? [...new Set([...currentValues, ...operation.values])]
              : currentValues.filter((item) => !operation.values.includes(item));
          files.set(path, api.materializeDocument({ ...file, [operation.field]: next }, path, timestamp));
          break;
        }
        case "append-text":
        case "replace-text": {
          const file = requireObjectDocument(files, path);
          const field = operation.field;
          if (definition.contentType !== "markdown") assertPatchFields(profile, kind, { [field]: "" });
          if (typeof file[field] !== "string") throw new Error(`${path}.${field} 必须是字符串。`);
          const next =
            operation.type === "append-text"
              ? `${file[field]}${file[field] ? (operation.separator ?? "\n") : ""}${operation.value}`
              : (() => {
                  if (!file[field].includes(operation.oldText)) throw new Error(`${path}.${field} 未找到待替换文本。`);
                  return file[field].replace(operation.oldText, operation.newText);
                })();
          files.set(path, api.materializeDocument({ ...file, [field]: next }, path, timestamp));
          break;
        }
      }
    } catch (error) {
      if (error instanceof DeclarativeStoryValidationError) operationIssues.push(...error.issues);
      else {
        operationIssues.push(
          storyValidationIssue(
            "changeset.operation.invalid",
            `changeSet.operations[${operationIndex}]`,
            error instanceof Error ? error.message : String(error),
          ),
        );
      }
    }
  }
  if (operationIssues.length > 0) throw new DeclarativeStoryValidationError(operationIssues);
  const nextBase: StoryCompiledProject = {
    manifest: current.manifest,
    documents: [...files].map(([path, value]) => ({ path, value })),
  };
  const next = rebuildManifest(nextBase, profile, info.revision + 1, timestamp);
  const validation = validateProject(next, profile, changeSet.validationProfile);
  if (!validation.valid) throw new DeclarativeStoryValidationError(validation.issues);
  return {
    project: next,
    nextRevision: info.revision + 1,
    validation,
    batch: changeSet.batch ?? null,
    operationTypes: [...new Set(changeSet.operations.map((item) => item.type))],
    changedPaths: [...new Set(changeSet.operations.map((item) => canonicalPath(item.path)))],
  };
};
