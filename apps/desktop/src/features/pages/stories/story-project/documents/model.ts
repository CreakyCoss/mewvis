import type {
  StoryCharacterJson,
  StoryCharacterMemoryJson,
  StoryEdgeJson,
  StoryJson,
  StoryLorebookEntryJson,
  StoryNodeJson,
  StorySceneJson,
  StorySceneStatusJson,
} from "../../story/model/types";
import type {
  JsonFieldMetadata,
  JsonObject,
  JsonObjectDefinition,
  JsonValue,
  StoryJsonDocument,
  StructuredJsonDocument,
} from "./types";

export const isJsonObject = (value: unknown): value is JsonObject =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const stringValue = (value: JsonValue | undefined, fallback = "") => (typeof value === "string" ? value : fallback);

const numberValue = (value: JsonValue | undefined, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const booleanValue = (value: JsonValue | undefined, fallback = false) =>
  typeof value === "boolean" ? value : fallback;

const stringArray = (value: JsonValue | undefined) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

const objectArray = (value: JsonValue | undefined) => (Array.isArray(value) ? value.filter(isJsonObject) : []);

const normalizeFieldMetadata = (value: JsonValue): JsonFieldMetadata | null => {
  if (!isJsonObject(value) || typeof value.type !== "string" || typeof value.label !== "string") {
    return null;
  }
  return {
    type: value.type,
    label: value.label,
    ...(typeof value.description === "string" ? { description: value.description } : {}),
    ...(value.const !== undefined ? { const: value.const } : {}),
    ...(value.default !== undefined ? { default: value.default } : {}),
    ...(typeof value.required === "boolean" ? { required: value.required } : {}),
    ...(typeof value.readOnly === "boolean" ? { readOnly: value.readOnly } : {}),
    ...(typeof value.immutable === "boolean" ? { immutable: value.immutable } : {}),
    ...(typeof value.generated === "boolean" ? { generated: value.generated } : {}),
    ...(typeof value.definition === "string" ? { definition: value.definition } : {}),
    ...(typeof value.itemDefinition === "string" ? { itemDefinition: value.itemDefinition } : {}),
    ...(Array.isArray(value.options)
      ? {
          options: value.options.flatMap((option) => {
            if (!isJsonObject(option) || typeof option.value !== "string" || typeof option.label !== "string") {
              return [];
            }
            return [{ value: option.value, label: option.label }];
          }),
        }
      : {}),
  };
};

const normalizeObjectDefinitions = (value: JsonValue | undefined): Record<string, JsonObjectDefinition> => {
  if (!isJsonObject(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([name, rawDefinition]) => {
      if (!isJsonObject(rawDefinition) || !isJsonObject(rawDefinition.fields)) return [];
      const fields = Object.fromEntries(
        Object.entries(rawDefinition.fields).flatMap(([pointer, rawField]) => {
          const field = normalizeFieldMetadata(rawField);
          return field ? [[pointer, field] as const] : [];
        }),
      );
      return [
        [
          name,
          {
            ...(typeof rawDefinition.label === "string" ? { label: rawDefinition.label } : {}),
            fields,
          },
        ] as const,
      ];
    }),
  );
};

export const inspectStructuredJsonDocument = (document: StoryJsonDocument): StructuredJsonDocument | null => {
  if (document.definition && isJsonObject(document.value)) {
    return {
      data: document.value,
      definitions: document.definition.definitions,
      fields: document.definition.fields,
      kind: document.definition.kind,
      label: document.definition.label,
      path: document.path,
    };
  }
  if (!isJsonObject(document.value)) {
    return null;
  }
  const identity = document.value.$document;
  const schema = document.value.$schema;
  const data = document.value.data;
  if (!isJsonObject(identity) || !isJsonObject(schema) || !isJsonObject(data)) {
    return null;
  }
  const rawFields = schema.fields;
  const fields = isJsonObject(rawFields)
    ? Object.fromEntries(
        Object.entries(rawFields).flatMap(([pointer, value]) => {
          const metadata = normalizeFieldMetadata(value);
          return metadata ? [[pointer, metadata] as const] : [];
        }),
      )
    : {};
  return {
    data,
    definitions: normalizeObjectDefinitions(schema.objectDefinitions),
    fields,
    kind: stringValue(identity.kind, stringValue(data.kind, "json-document")),
    label: stringValue(identity.label, document.path.split("/").at(-1) ?? document.path),
    path: stringValue(identity.path, document.path),
  };
};

export const storyDocumentData = (document: StoryJsonDocument): JsonObject | null => {
  const structured = inspectStructuredJsonDocument(document);
  if (structured) {
    return structured.data;
  }
  return isJsonObject(document.value) ? document.value : null;
};

export const storyDocumentLabel = (document: StoryJsonDocument) =>
  inspectStructuredJsonDocument(document)?.label ?? document.path.split("/").at(-1) ?? document.path;

const asCharacterMemory = (value: JsonValue | undefined): StoryCharacterMemoryJson | undefined => {
  if (!isJsonObject(value)) return undefined;
  return {
    required: stringValue(value.required),
    public: stringValue(value.public),
    known: stringValue(value.known),
    privateSelf: stringValue(value.privateSelf),
    directorSecret: stringValue(value.directorSecret),
  };
};

const asSceneStatus = (value: JsonValue | undefined): StorySceneStatusJson | undefined => {
  if (!isJsonObject(value)) return undefined;
  return Object.fromEntries(
    ["location", "timeLabel", "weather", "atmosphere", "scenePhase", "immediateThreat"].flatMap((key) => {
      const item = value[key];
      return typeof item === "string" ? [[key, item]] : [];
    }),
  );
};

const asCharacter = (value: JsonObject): StoryCharacterJson => ({
  id: stringValue(value.id),
  name: stringValue(value.name),
  avatar: stringValue(value.avatar, "blank-avatar"),
  description: stringValue(value.description),
  speakingStyle: stringValue(value.speakingStyle),
  writingStyle: stringValue(value.writingStyle) || undefined,
  replyStylePrompt: stringValue(value.replyStylePrompt) || undefined,
  goals: stringValue(value.goals) || undefined,
  relationshipSummary: stringValue(value.relationshipSummary) || undefined,
  publicRelationshipSummary: stringValue(value.publicRelationshipSummary) || undefined,
  memory: asCharacterMemory(value.memory),
});

const asWorldEntry = (value: JsonObject): StoryLorebookEntryJson => ({
  id: stringValue(value.id),
  title: stringValue(value.title),
  content: stringValue(value.content),
  keywords: stringArray(value.keywords),
  enabled: booleanValue(value.enabled, true),
  alwaysOn: booleanValue(value.alwaysOn),
});

const asScene = (value: JsonObject): StorySceneJson => ({
  id: stringValue(value.id),
  title: stringValue(value.title),
  scene: stringValue(value.scene),
  goal: stringValue(value.goal),
  plot: stringValue(value.plot),
  direction: stringValue(value.direction),
  transition: stringValue(value.transition),
  memory: stringValue(value.memory),
  status: asSceneStatus(value.status),
});

const asNode = (value: JsonObject): StoryNodeJson => ({
  id: stringValue(value.id),
  sceneId: stringValue(value.sceneId) || undefined,
  title: stringValue(value.title),
  type: stringValue(value.type),
  pathRole: stringValue(value.pathRole),
  status: stringValue(value.status) || undefined,
});

const asEdge = (value: JsonObject): StoryEdgeJson => ({
  id: stringValue(value.id),
  fromNodeId: stringValue(value.fromNodeId),
  toNodeId: stringValue(value.toNodeId),
  label: stringValue(value.label),
  reason: stringValue(value.reason) || undefined,
  isDefault: typeof value.isDefault === "boolean" ? value.isDefault : undefined,
  priority: numberValue(value.priority, 0),
});

export const storyDocumentsToStoryJson = (
  input: { id: string; name: string; createdAt: number; updatedAt: number },
  documents: StoryJsonDocument[],
): StoryJson => {
  const data = documents.flatMap((document) => {
    const value = storyDocumentData(document);
    return value ? [value] : [];
  });
  const byKind = (kind: string) => data.filter((value) => value.kind === kind);
  const book = byKind("story-book")[0];
  const graph = byKind("story-graph")[0];
  const fallback: StoryJson = {
    id: input.id,
    title: input.name,
    premise: "",
    goal: "",
    playerName: "我",
    characters: [],
    lorebookEntries: [],
    scenes: [],
    graph: { nodes: [], edges: [] },
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
  return {
    ...fallback,
    title: book ? stringValue(book.title, input.name) : input.name,
    premise: book ? stringValue(book.premise) : "",
    goal: book ? stringValue(book.goal) : "",
    playerName: book ? stringValue(book.playerName, "我") : "我",
    characters: byKind("story-character")
      .map(asCharacter)
      .filter((item) => item.id),
    lorebookEntries: byKind("story-world-entry")
      .map(asWorldEntry)
      .filter((item) => item.id),
    scenes: byKind("story-scene")
      .map(asScene)
      .filter((item) => item.id),
    graph: graph
      ? {
          nodes: objectArray(graph.nodes)
            .map(asNode)
            .filter((item) => item.id),
          edges: objectArray(graph.edges)
            .map(asEdge)
            .filter((item) => item.id),
        }
      : fallback.graph,
    createdAt: book ? numberValue(book.createdAt, input.createdAt) : input.createdAt,
    updatedAt: Math.max(input.updatedAt, ...documents.map((document) => document.updatedAt ?? 0)),
  };
};

export const replaceStructuredDocumentData = (value: JsonValue, data: JsonObject): JsonValue =>
  isJsonObject(value) && isJsonObject(value.$document) && isJsonObject(value.$schema) ? { ...value, data } : data;
