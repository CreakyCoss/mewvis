import { defineFields, STORY_ENTITY_FIELDS } from "./fields.js";
import type { StoryDocumentModelDefinition, StoryFieldDefinition, StoryObjectDefinition } from "./types.js";

type DocumentModelInput = Omit<StoryDocumentModelDefinition, "contentFormat" | "identityFields" | "fields"> &
  Readonly<{
    contentFormat?: StoryDocumentModelDefinition["contentFormat"];
    identityFields?: readonly string[];
    fields: readonly StoryFieldDefinition[];
  }>;

const freezeDocumentModel = (input: DocumentModelInput): StoryDocumentModelDefinition =>
  Object.freeze({
    ...input,
    contentFormat: input.contentFormat ?? "structured",
    identityFields: input.identityFields ?? (input.cardinality === "many" ? ["id"] : []),
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
