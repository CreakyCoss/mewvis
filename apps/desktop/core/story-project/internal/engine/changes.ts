import { z } from "zod";
import type { StoryProjectAppliedChanges, StoryProjectState, StoryValidationIssue } from "../../types.js";
import { StoryProjectValidationError, storyValidationIssue } from "./issues.js";
import { projectInfo, rebuildManifest } from "./project.js";
import {
  resolveStoryTypePath,
  storyTypeDocument,
  storyTypeFields,
  storyTypeKindForPath,
} from "../../definitions/definition.js";
import type { StoryTypeDefinition } from "../../definitions/types.js";
import { materializeStoryDocument } from "./document.js";
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
    storyTypeId: z.string().trim().min(1),
    storyTypeVersion: z.number().int().positive(),
    storyId: z.string().trim().min(1),
    baseRevision: z.number().int().nonnegative(),
    validationMode: z.string().trim().min(1),
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

const assertPatchFields = (definition: StoryTypeDefinition, kind: string, patch: JsonObject) => {
  const fields = storyTypeFields(definition, kind);
  for (const key of Object.keys(patch)) {
    const field = fields[key];
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
  current: StoryProjectState,
  input: unknown,
  definition: StoryTypeDefinition,
): StoryProjectAppliedChanges => {
  const changeSet = storyChangeSetSchema.parse(input);
  if (changeSet.storyTypeId !== definition.id || changeSet.storyTypeVersion !== definition.version) {
    throw new Error(`ChangeSet 故事类型与工作区不一致：期望 ${definition.id}@${definition.version}。`);
  }
  const info = projectInfo(current);
  if (changeSet.storyId !== info.storyId) throw new Error("ChangeSet storyId 与当前故事不一致。");
  if (changeSet.baseRevision !== info.revision) {
    throw new Error(`故事已被更新：期望 revision ${changeSet.baseRevision}，当前为 ${info.revision}。`);
  }
  if (!definition.validationModes[changeSet.validationMode]) {
    throw new Error(`故事类型不支持校验模式：${changeSet.validationMode}`);
  }
  const manifestPath = resolveStoryTypePath(definition, definition.manifestKind);
  const files = new Map(current.documents.map((entry) => [entry.path, clone(entry.value)]));
  const timestamp = Date.now();
  const operationIssues: StoryValidationIssue[] = [];
  for (const [operationIndex, operation] of changeSet.operations.entries()) {
    try {
      const path = canonicalPath(operation.path);
      if (path === manifestPath) throw new Error("Manifest 只能由故事运行时生成，不能直接修改。");
      const kind = storyTypeKindForPath(definition, path);
      const document = storyTypeDocument(definition, kind);
      switch (operation.type) {
        case "delete":
          if (document.cardinality === "one") throw new Error(`${document.label} 必须保留一份，不能删除。`);
          files.delete(path);
          break;
        case "upsert":
          files.set(path, materializeStoryDocument(definition, operation.value, kind, timestamp, { coerce: true }));
          break;
        case "patch": {
          if (document.contentType === "markdown") throw new Error("Markdown 文档不支持 patch，请使用文本操作。");
          assertPatchFields(definition, kind, operation.value);
          files.set(
            path,
            materializeStoryDocument(
              definition,
              deepMerge(requireObjectDocument(files, path), operation.value),
              kind,
              timestamp,
              { coerce: true },
            ),
          );
          break;
        }
        case "upsert-items": {
          const file = requireObjectDocument(files, path);
          assertPatchFields(definition, kind, { [operation.field]: operation.items });
          const currentItems = file[operation.field];
          if (!Array.isArray(currentItems)) throw new Error(`${path}.${operation.field} 必须是数组。`);
          const next = [...currentItems];
          for (const item of operation.items) {
            if (typeof item.id !== "string") throw new Error("upsert-items 的每个对象必须包含字符串 id。");
            const index = next.findIndex((candidate) => isObject(candidate) && candidate.id === item.id);
            if (index >= 0) next[index] = deepMerge(next[index], item);
            else next.push(item);
          }
          files.set(
            path,
            materializeStoryDocument(definition, { ...file, [operation.field]: next }, kind, timestamp, {
              coerce: true,
            }),
          );
          break;
        }
        case "remove-items": {
          const file = requireObjectDocument(files, path);
          assertPatchFields(definition, kind, { [operation.field]: [] });
          const currentItems = file[operation.field];
          if (!Array.isArray(currentItems)) throw new Error(`${path}.${operation.field} 必须是数组。`);
          files.set(
            path,
            materializeStoryDocument(
              definition,
              {
                ...file,
                [operation.field]: currentItems.filter(
                  (item) => !isObject(item) || typeof item.id !== "string" || !operation.ids.includes(item.id),
                ),
              },
              kind,
              timestamp,
              { coerce: true },
            ),
          );
          break;
        }
        case "add-values":
        case "remove-values": {
          const file = requireObjectDocument(files, path);
          assertPatchFields(definition, kind, { [operation.field]: operation.values });
          const currentValues = file[operation.field];
          if (!Array.isArray(currentValues) || currentValues.some((item) => typeof item !== "string")) {
            throw new Error(`${path}.${operation.field} 必须是字符串数组。`);
          }
          const next =
            operation.type === "add-values"
              ? [...new Set([...currentValues, ...operation.values])]
              : currentValues.filter((item) => !operation.values.includes(item));
          files.set(
            path,
            materializeStoryDocument(definition, { ...file, [operation.field]: next }, kind, timestamp, {
              coerce: true,
            }),
          );
          break;
        }
        case "append-text":
        case "replace-text": {
          const file = requireObjectDocument(files, path);
          const field = operation.field;
          if (document.contentType !== "markdown") assertPatchFields(definition, kind, { [field]: "" });
          if (typeof file[field] !== "string") throw new Error(`${path}.${field} 必须是字符串。`);
          const next =
            operation.type === "append-text"
              ? `${file[field]}${file[field] ? (operation.separator ?? "\n") : ""}${operation.value}`
              : (() => {
                  if (!file[field].includes(operation.oldText)) throw new Error(`${path}.${field} 未找到待替换文本。`);
                  return file[field].replace(operation.oldText, operation.newText);
                })();
          files.set(
            path,
            materializeStoryDocument(definition, { ...file, [field]: next }, kind, timestamp, { coerce: true }),
          );
          break;
        }
      }
    } catch (error) {
      if (error instanceof StoryProjectValidationError) operationIssues.push(...error.issues);
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
  if (operationIssues.length > 0) throw new StoryProjectValidationError(operationIssues);
  const nextBase: StoryProjectState = {
    manifest: current.manifest,
    documents: [...files].map(([path, value]) => ({ path, value })),
  };
  const next = rebuildManifest(nextBase, definition, info.revision + 1, timestamp);
  const validation = validateProject(next, definition, changeSet.validationMode);
  if (!validation.valid) throw new StoryProjectValidationError(validation.issues);
  return {
    project: next,
    nextRevision: info.revision + 1,
    validation,
    batch: changeSet.batch ?? null,
    operationTypes: [...new Set(changeSet.operations.map((item) => item.type))],
    changedPaths: [...new Set(changeSet.operations.map((item) => canonicalPath(item.path)))],
  };
};
