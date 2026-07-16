import { defineFields, STORY_ENTITY_FIELDS } from "./fields.js";
import type {
  StoryDocumentDefinition,
  StoryDocumentModelDefinition,
  StoryFieldDefinition,
  StoryObjectDefinition,
} from "./types.js";

type DocumentModelInput = Omit<StoryDocumentModelDefinition, "contentType" | "fields"> &
  Readonly<{
    contentType?: StoryDocumentModelDefinition["contentType"];
    fields: readonly StoryFieldDefinition[];
  }>;

const freezeDocumentModel = (input: DocumentModelInput): StoryDocumentModelDefinition =>
  Object.freeze({
    ...input,
    contentType: input.contentType ?? "json",
    fields: defineFields(input.fields),
  });

/** 定义不自动追加身份字段的文档，例如 Manifest 与 Markdown 正文。 */
export const documentModel = (input: DocumentModelInput) => freezeDocumentModel(input);

/** 定义普通实体文档，并统一追加 schemaVersion、kind、id 与 updatedAt。 */
export const entityDocument = (input: DocumentModelInput) =>
  freezeDocumentModel({
    ...input,
    fields: [
      ...STORY_ENTITY_FIELDS.map((field) => (field.key === "kind" ? { ...field, const: input.kind } : field)),
      ...input.fields,
    ],
  });

export const defineObjectModels = (objects: readonly StoryObjectDefinition[]) => {
  const ids = objects.map((object) => object.id);
  if (ids.some((id) => !id.trim()) || new Set(ids).size !== ids.length) {
    throw new Error("故事对象模型 ID 必须非空且不得重复。");
  }
  return Object.freeze(
    objects.map((object) =>
      Object.freeze({
        ...object,
        fields: defineFields(object.fields),
      }),
    ),
  );
};

export const defineDocumentModels = (documents: readonly StoryDocumentModelDefinition[]) => {
  const kinds = documents.map((document) => document.kind);
  if (kinds.some((kind) => !kind.trim()) || new Set(kinds).size !== kinds.length) {
    throw new Error("故事文档模型 kind 必须非空且不得重复。");
  }
  return Object.freeze(documents.map((document) => Object.freeze(document)));
};

/** 具体故事类型在这里为复用文档模型绑定实际文件路径。 */
export const bindDocumentModels = (
  models: readonly StoryDocumentModelDefinition[],
  paths: Readonly<Record<string, string>>,
): readonly StoryDocumentDefinition[] => {
  const kinds = models.map((model) => model.kind);
  const missing = kinds.filter((kind) => !paths[kind]);
  const unknown = Object.keys(paths).filter((kind) => !kinds.includes(kind));
  if (missing.length > 0 || unknown.length > 0) {
    throw new Error(
      `文档模型与路径绑定不一致；缺少路径：${missing.join("、") || "无"}；未知路径：${unknown.join("、") || "无"}。`,
    );
  }
  return models.map((model) => Object.freeze({ ...model, pathPattern: paths[model.kind]! }));
};
