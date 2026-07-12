import { z } from "zod";
import {
  storyBookArcFileSchema,
  storyBookFileSchema,
  storyChapterFileSchema,
  storyChapterPlanFileSchema,
  storyCharacterFileSchema,
  storyCharacterStateFileSchema,
  storyForeshadowsFileSchema,
  storyGraphFileSchema,
  storyAnalysisFileSchema,
  storyReviewFileSchema,
  storyImportFileSchema,
  storyManifestFileSchema,
  storyPositioningFileSchema,
  storyProgressFileSchema,
  storyRelationshipsFileSchema,
  storySceneFileSchema,
  storyStyleFileSchema,
  storyTimelineFileSchema,
  storyVolumeFileSchema,
  storyWorldEntryFileSchema,
  storyProjectSchema,
  type StoryProject,
  type StoryProjectFile,
} from "./schema.js";
import { storyProjectFiles, withRebuiltManifest, type StoryProjectFileEntry } from "./project.js";
import { type StoryValidationProfile, validateStoryProject } from "./validation.js";
import type { StoryProjectApi } from "../../protocol.js";

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
  z
    .object({
      type: z.literal("upsert"),
      path: z.string().trim().min(1),
      value: z.unknown(),
    })
    .strict(),
  z
    .object({
      type: z.literal("delete"),
      path: z.string().trim().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("patch"),
      path: z.string().trim().min(1),
      value: z.record(z.string(), z.unknown()),
    })
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
    contractId: z.string().trim().min(1),
    contractVersion: z.number().int().positive(),
    storyId: z.string().trim().min(1),
    baseRevision: z.number().int().nonnegative(),
    validationProfile: z.enum(["draft", "openBook", "chapterWrite"]),
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

const canonicalStoryPath = (value: string) =>
  value
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");

const assertWritableStoryPath = (contract: StoryProjectApi, value: string) => {
  const path = canonicalStoryPath(value);
  if (
    !path.startsWith(`${contract.describe().rootPath}/`) ||
    !path.endsWith(".json") ||
    path.includes("../") ||
    path === contract.resolveDocument("story-manifest")
  ) {
    throw new Error(`不允许通过 ChangeSet 修改路径：${value}`);
  }
  return path;
};

type JsonObject = Record<string, unknown>;

const isJsonObject = (value: unknown): value is JsonObject =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const deepMergePatch = (current: unknown, patch: JsonObject): JsonObject => {
  const result: JsonObject = isJsonObject(current) ? { ...current } : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete result[key];
    } else if (isJsonObject(value)) {
      result[key] = deepMergePatch(result[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
};

const immutablePatchFields = new Set(["schemaVersion", "kind", "id", "storyId", "revision", "files"]);

const assertMutablePatch = (value: JsonObject) => {
  const forbidden = Object.keys(value).filter((key) => immutablePatchFields.has(key));
  if (forbidden.length > 0) {
    throw new Error(`patch 不允许修改身份字段：${forbidden.join("、")}`);
  }
};

const touchFile = (value: JsonObject, timestamp: number) =>
  "updatedAt" in value ? { ...value, updatedAt: timestamp } : value;

const requireObjectFile = (files: Map<string, StoryProjectFile>, path: string): JsonObject => {
  const current = files.get(path);
  if (!current || !isJsonObject(current)) {
    throw new Error(`增量操作要求文件已存在：${path}`);
  }
  return current;
};

const requireArrayField = (file: JsonObject, field: string, path: string): unknown[] => {
  const value = file[field];
  if (!Array.isArray(value)) {
    throw new Error(`增量操作要求 ${path} 的 ${field} 是数组。`);
  }
  return value;
};

const requireTextField = (file: JsonObject, field: string, path: string): string => {
  const value = file[field];
  if (typeof value !== "string") {
    throw new Error(`文本增量操作要求 ${path} 的 ${field} 是字符串。`);
  }
  return value;
};

export const parseStoryProjectFile = (value: unknown): StoryProjectFile => {
  if (!value || typeof value !== "object" || Array.isArray(value) || !("kind" in value)) {
    throw new Error("故事文件缺少 kind。");
  }
  switch ((value as { kind?: unknown }).kind) {
    case "story-manifest":
      return storyManifestFileSchema.parse(value);
    case "story-book":
      return storyBookFileSchema.parse(value);
    case "story-positioning":
      return storyPositioningFileSchema.parse(value);
    case "story-style":
      return storyStyleFileSchema.parse(value);
    case "story-character":
      return storyCharacterFileSchema.parse(value);
    case "story-relationships":
      return storyRelationshipsFileSchema.parse(value);
    case "story-world-entry":
      return storyWorldEntryFileSchema.parse(value);
    case "story-book-arc":
      return storyBookArcFileSchema.parse(value);
    case "story-volume":
      return storyVolumeFileSchema.parse(value);
    case "story-chapter-plan":
      return storyChapterPlanFileSchema.parse(value);
    case "story-chapter":
      return storyChapterFileSchema.parse(value);
    case "story-character-state":
      return storyCharacterStateFileSchema.parse(value);
    case "story-foreshadows":
      return storyForeshadowsFileSchema.parse(value);
    case "story-timeline":
      return storyTimelineFileSchema.parse(value);
    case "story-progress":
      return storyProgressFileSchema.parse(value);
    case "story-scene":
      return storySceneFileSchema.parse(value);
    case "story-graph":
      return storyGraphFileSchema.parse(value);
    case "story-analysis":
      return storyAnalysisFileSchema.parse(value);
    case "story-review":
      return storyReviewFileSchema.parse(value);
    case "story-import":
      return storyImportFileSchema.parse(value);
    default:
      throw new Error(`未知故事文件 kind：${String((value as { kind?: unknown }).kind)}`);
  }
};

const requireOne = <T extends StoryProjectFile["kind"]>(
  files: StoryProjectFile[],
  kind: T,
): Extract<StoryProjectFile, { kind: T }> => {
  const matches = files.filter((file) => file.kind === kind);
  if (matches.length !== 1) {
    throw new Error(`故事项目必须且只能包含一个 ${kind} 文件，当前为 ${matches.length} 个。`);
  }
  return matches[0] as Extract<StoryProjectFile, { kind: T }>;
};

export const assembleStoryProject = (entries: StoryProjectFileEntry[]): StoryProject => {
  const files = entries.map(({ value }) => parseStoryProjectFile(value));
  const project: StoryProject = {
    manifest: requireOne(files, "story-manifest"),
    book: requireOne(files, "story-book"),
    positioning: requireOne(files, "story-positioning"),
    style: requireOne(files, "story-style"),
    characters: files.filter((file) => file.kind === "story-character"),
    relationships: requireOne(files, "story-relationships"),
    worldEntries: files.filter((file) => file.kind === "story-world-entry"),
    bookArc: requireOne(files, "story-book-arc"),
    volumes: files.filter((file) => file.kind === "story-volume"),
    chapterPlans: files.filter((file) => file.kind === "story-chapter-plan"),
    chapters: files.filter((file) => file.kind === "story-chapter"),
    characterStates: files.filter((file) => file.kind === "story-character-state"),
    foreshadows: requireOne(files, "story-foreshadows"),
    timelines: files.filter((file) => file.kind === "story-timeline"),
    progress: requireOne(files, "story-progress"),
    scenes: files.filter((file) => file.kind === "story-scene"),
    graph: requireOne(files, "story-graph"),
    analyses: files.filter((file) => file.kind === "story-analysis"),
    reviews: files.filter((file) => file.kind === "story-review"),
    imports: files.filter((file) => file.kind === "story-import"),
  };
  return storyProjectSchema.parse(project);
};

export const applyStoryChangeSet = (
  current: StoryProject,
  input: StoryChangeSet,
  contract: StoryProjectApi,
): StoryProject => {
  const changeSet = storyChangeSetSchema.parse(input);
  if (
    changeSet.contractId !== contract.identity.contractId ||
    changeSet.contractVersion !== contract.identity.contractVersion
  ) {
    throw new Error(
      `ChangeSet 协议身份与工作区不一致：期望 ${contract.identity.contractId}@${contract.identity.contractVersion}。`,
    );
  }
  if (changeSet.storyId !== current.manifest.storyId) {
    throw new Error("ChangeSet storyId 与当前故事不一致。");
  }
  if (changeSet.baseRevision !== current.manifest.revision) {
    throw new Error(
      `故事已被其他操作更新：期望 revision ${changeSet.baseRevision}，当前为 ${current.manifest.revision}。`,
    );
  }

  const files = new Map(storyProjectFiles(current, contract).map(({ path, value }) => [path, value]));
  const timestamp = Date.now();
  for (const operation of changeSet.operations) {
    const path = assertWritableStoryPath(contract, operation.path);
    switch (operation.type) {
      case "delete":
        files.delete(path);
        break;
      case "upsert":
        files.set(
          path,
          parseStoryProjectFile(contract.materializeDocument(operation.value, contract.kindForPath(path), timestamp)),
        );
        break;
      case "patch": {
        assertMutablePatch(operation.value);
        const currentFile = requireObjectFile(files, path);
        files.set(path, parseStoryProjectFile(touchFile(deepMergePatch(currentFile, operation.value), timestamp)));
        break;
      }
      case "upsert-items": {
        const currentFile = requireObjectFile(files, path);
        const items = requireArrayField(currentFile, operation.field, path);
        const nextItems = [...items];
        for (const item of operation.items) {
          const id = item.id;
          if (typeof id !== "string" || !id.trim()) {
            throw new Error(`upsert-items 的每个条目都必须包含非空 id：${path}#${operation.field}`);
          }
          const index = nextItems.findIndex((candidate) => isJsonObject(candidate) && candidate.id === id);
          if (index === -1) {
            nextItems.push(item);
          } else {
            nextItems[index] = deepMergePatch(nextItems[index], item);
          }
        }
        files.set(path, parseStoryProjectFile(touchFile({ ...currentFile, [operation.field]: nextItems }, timestamp)));
        break;
      }
      case "remove-items": {
        const currentFile = requireObjectFile(files, path);
        const items = requireArrayField(currentFile, operation.field, path);
        const ids = new Set(operation.ids);
        const nextItems = items.filter(
          (item) => !isJsonObject(item) || typeof item.id !== "string" || !ids.has(item.id),
        );
        files.set(path, parseStoryProjectFile(touchFile({ ...currentFile, [operation.field]: nextItems }, timestamp)));
        break;
      }
      case "add-values": {
        const currentFile = requireObjectFile(files, path);
        const values = requireArrayField(currentFile, operation.field, path);
        if (!values.every((value) => typeof value === "string")) {
          throw new Error(`add-values 只支持字符串数组：${path}#${operation.field}`);
        }
        const nextValues = [...new Set([...values, ...operation.values])];
        files.set(path, parseStoryProjectFile(touchFile({ ...currentFile, [operation.field]: nextValues }, timestamp)));
        break;
      }
      case "remove-values": {
        const currentFile = requireObjectFile(files, path);
        const values = requireArrayField(currentFile, operation.field, path);
        if (!values.every((value) => typeof value === "string")) {
          throw new Error(`remove-values 只支持字符串数组：${path}#${operation.field}`);
        }
        const removed = new Set(operation.values);
        files.set(
          path,
          parseStoryProjectFile(
            touchFile(
              { ...currentFile, [operation.field]: values.filter((value) => !removed.has(value as string)) },
              timestamp,
            ),
          ),
        );
        break;
      }
      case "append-text": {
        if (immutablePatchFields.has(operation.field)) {
          throw new Error(`append-text 不允许修改身份字段：${operation.field}`);
        }
        const currentFile = requireObjectFile(files, path);
        const currentText = requireTextField(currentFile, operation.field, path);
        const separator = currentText ? (operation.separator ?? "") : "";
        files.set(
          path,
          parseStoryProjectFile(
            touchFile({ ...currentFile, [operation.field]: `${currentText}${separator}${operation.value}` }, timestamp),
          ),
        );
        break;
      }
      case "replace-text": {
        if (immutablePatchFields.has(operation.field)) {
          throw new Error(`replace-text 不允许修改身份字段：${operation.field}`);
        }
        const currentFile = requireObjectFile(files, path);
        const currentText = requireTextField(currentFile, operation.field, path);
        const firstIndex = currentText.indexOf(operation.oldText);
        const lastIndex = currentText.lastIndexOf(operation.oldText);
        if (firstIndex === -1) {
          throw new Error(`replace-text 在 ${path}#${operation.field} 中找不到 oldText。`);
        }
        if (firstIndex !== lastIndex) {
          throw new Error(`replace-text 的 oldText 在 ${path}#${operation.field} 中不唯一，请提供更长锚点。`);
        }
        const nextText = `${currentText.slice(0, firstIndex)}${operation.newText}${currentText.slice(firstIndex + operation.oldText.length)}`;
        files.set(path, parseStoryProjectFile(touchFile({ ...currentFile, [operation.field]: nextText }, timestamp)));
        break;
      }
    }
  }

  const provisionalManifest = {
    ...current.manifest,
    revision: current.manifest.revision + 1,
    updatedAt: timestamp,
    files: [],
  };
  const next = assembleStoryProject([
    { path: contract.resolveDocument("story-manifest"), value: provisionalManifest },
    ...[...files.entries()].map(([path, value]) => ({ path, value })),
  ]);
  const rebuilt = withRebuiltManifest(next, contract, {
    revision: current.manifest.revision + 1,
    timestamp,
  });
  const rebuiltPaths = new Set(storyProjectFiles(rebuilt, contract).map((entry) => entry.path));
  for (const operation of changeSet.operations) {
    if (operation.type !== "delete") {
      const path = assertWritableStoryPath(contract, operation.path);
      if (!rebuiltPaths.has(path)) {
        throw new Error(`ChangeSet 路径与文件身份不匹配：${path}`);
      }
    }
  }
  const validation = validateStoryProject(rebuilt, contract, changeSet.validationProfile as StoryValidationProfile);
  if (!validation.valid) {
    const details = validation.issues
      .filter((item) => item.severity === "error")
      .map((item) => `${item.path || "story"}：${item.message}`)
      .join("\n");
    throw new Error(details || "故事 ChangeSet 校验失败。");
  }
  return rebuilt;
};
