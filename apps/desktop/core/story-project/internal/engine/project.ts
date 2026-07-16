import type { StoryProjectDocumentEntry, StoryProjectState } from "../../types.js";
import { parseStoryDocument } from "./document.js";
import { StoryDefinition } from "../../definitions/index.js";
import type { StoryFieldDefinition } from "../../definitions/model/types.js";
import type { StoryTypeDefinition } from "../../definitions/types.js";

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const clone = <T>(value: T): T => structuredClone(value);

const documentKind = (value: unknown) => (isObject(value) && typeof value.kind === "string" ? value.kind : "");

const emptyFieldValue = (definition: StoryTypeDefinition, field: StoryFieldDefinition, timestamp: number): unknown => {
  if (field.const !== undefined) return clone(field.const);
  if (field.default !== undefined) return clone(field.default);
  if (field.generated && field.type === "timestamp") return timestamp;
  if (field.definition) {
    const fields = StoryDefinition.objectFields(definition, field.definition);
    return Object.fromEntries(
      Object.entries(fields)
        .filter(([, child]) => child.required || child.default !== undefined || child.const !== undefined)
        .map(([key, child]) => [key, emptyFieldValue(definition, child, timestamp)]),
    );
  }
  if (field.itemDefinition || field.type === "collection" || field.type.endsWith("-list")) return [];
  if (field.type === "boolean") return false;
  if (["integer", "number", "timestamp"].includes(field.type)) return 0;
  if (field.options?.length) return field.options[0]!.value;
  return "";
};

export const initialDocumentInput = (
  definition: StoryTypeDefinition,
  kind: string,
  storyId: string,
  title: string,
  timestamp: number,
) => {
  const fields = StoryDefinition.fields(definition, kind);
  const result: JsonObject = {};
  for (const [key, field] of Object.entries(fields)) {
    if (key === "storyId") result[key] = storyId;
    else if (key === "id")
      result[key] = kind === definition.primaryKind ? storyId : `${storyId}-${kind.replace(/^story-/, "")}`;
    else if (key === "title") result[key] = title;
    else if (key === "revision") result[key] = 0;
    else if (key === "createdAt" || key === "updatedAt") result[key] = timestamp;
    else if (field.required || field.default !== undefined || field.const !== undefined) {
      result[key] = emptyFieldValue(definition, field, timestamp);
    }
  }
  return result;
};

export const createInitialProject = (
  definition: StoryTypeDefinition,
  input: { storyId: string; title: string },
  timestamp = Date.now(),
) => {
  const manifestRef = StoryDefinition.identity(definition, definition.manifestKind);
  const manifest = parseStoryDocument(
    definition,
    initialDocumentInput(definition, definition.manifestKind, input.storyId, input.title, timestamp),
    manifestRef,
    timestamp,
  );
  if (!isObject(manifest)) throw new Error("故事 Manifest 必须是结构化对象。");
  const documents = definition.documents.flatMap((document): StoryProjectDocumentEntry[] => {
    if (document.kind === definition.manifestKind || document.cardinality !== "one") return [];
    const ref = StoryDefinition.identity(definition, document.kind);
    return [
      {
        ref,
        value: parseStoryDocument(
          definition,
          initialDocumentInput(definition, document.kind, input.storyId, input.title, timestamp),
          ref,
          timestamp,
        ),
      },
    ];
  });
  return rebuildManifest({ manifest, documents }, definition, 0, timestamp);
};

export const projectInfo = (project: StoryProjectState) => {
  const manifest = project.manifest;
  if (typeof manifest.storyId !== "string" || !Number.isInteger(manifest.revision)) {
    throw new Error("故事 Manifest 缺少 storyId 或 revision。");
  }
  return { storyId: manifest.storyId, revision: Number(manifest.revision) };
};

export const rebuildManifest = (
  project: StoryProjectState,
  definition: StoryTypeDefinition,
  revision: number,
  timestamp = Date.now(),
): StoryProjectState => {
  const documents = [...project.documents].sort((left, right) =>
    StoryDefinition.identityKey(left.ref).localeCompare(StoryDefinition.identityKey(right.ref)),
  );
  const primary = definition.primaryKind
    ? documents.find((entry) => entry.ref.kind === definition.primaryKind)?.value
    : undefined;
  const manifest = {
    ...project.manifest,
    ...(isObject(primary) && typeof primary.title === "string" ? { title: primary.title } : {}),
    revision,
    updatedAt: timestamp,
  };
  return { manifest, documents };
};

export const assembleProject = (
  entries: readonly StoryProjectDocumentEntry[],
  definition: StoryTypeDefinition,
): StoryProjectState => {
  const normalized = entries.map((entry) => ({
    ref: StoryDefinition.identity(definition, entry.ref.kind, entry.ref.identity),
    value: entry.value,
  }));
  const manifestEntries = normalized.filter((entry) => entry.ref.kind === definition.manifestKind);
  if (manifestEntries.length !== 1) {
    throw new Error(`故事项目必须且只能包含一个 Manifest，当前为 ${manifestEntries.length} 个。`);
  }
  const documents = normalized
    .filter((entry) => entry.ref.kind !== definition.manifestKind)
    .map((entry) => {
      const value = parseStoryDocument(definition, entry.value, entry.ref);
      if (documentKind(value) !== entry.ref.kind) {
        throw new Error(`${StoryDefinition.identityKey(entry.ref)} 的 kind 与故事类型不一致。`);
      }
      return { ref: entry.ref, value };
    });
  const keys = documents.map((entry) => StoryDefinition.identityKey(entry.ref));
  if (new Set(keys).size !== keys.length) throw new Error("故事项目包含重复文档引用。");
  for (const document of definition.documents) {
    if (document.kind === definition.manifestKind) continue;
    const count = documents.filter((entry) => entry.ref.kind === document.kind).length;
    if (document.cardinality === "one" && count !== 1) {
      throw new Error(`故事项目必须且只能包含一个 ${document.kind}，当前为 ${count} 个。`);
    }
  }
  const manifestEntry = manifestEntries[0]!;
  return {
    manifest: parseStoryDocument(definition, manifestEntry.value, manifestEntry.ref),
    documents: documents.sort((left, right) =>
      StoryDefinition.identityKey(left.ref).localeCompare(StoryDefinition.identityKey(right.ref)),
    ),
  };
};
