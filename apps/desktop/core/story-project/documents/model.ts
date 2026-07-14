import type {
  JsonFieldMetadata,
  JsonObject,
  JsonObjectDefinition,
  JsonValue,
  StoryProjectDocument,
  StructuredJsonDocument,
} from "./types.js";

export const isJsonObject = (value: unknown): value is JsonObject =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const stringValue = (value: JsonValue | undefined, fallback = "") => (typeof value === "string" ? value : fallback);

const normalizeFieldMetadata = (value: JsonValue): JsonFieldMetadata | null => {
  if (!isJsonObject(value) || typeof value.type !== "string" || typeof value.label !== "string") return null;
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
          options: value.options.flatMap((option) =>
            isJsonObject(option) && typeof option.value === "string" && typeof option.label === "string"
              ? [{ value: option.value, label: option.label }]
              : [],
          ),
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

/** 将项目文档转换成通用编辑器可以直接消费的数据与字段描述。 */
export const inspectStructuredJsonDocument = (document: StoryProjectDocument): StructuredJsonDocument | null => {
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
  if (!isJsonObject(document.value)) return null;
  const identity = document.value.$document;
  const schema = document.value.$schema;
  const data = document.value.data;
  if (!isJsonObject(identity) || !isJsonObject(schema) || !isJsonObject(data)) return null;
  const fields = isJsonObject(schema.fields)
    ? Object.fromEntries(
        Object.entries(schema.fields).flatMap(([pointer, value]) => {
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

export const storyDocumentData = (document: StoryProjectDocument): JsonObject | null => {
  const structured = inspectStructuredJsonDocument(document);
  return structured?.data ?? (isJsonObject(document.value) ? document.value : null);
};

export const storyDocumentLabel = (document: StoryProjectDocument) =>
  inspectStructuredJsonDocument(document)?.label ?? document.path.split("/").at(-1) ?? document.path;

export const replaceStructuredDocumentData = (value: JsonValue, data: JsonObject): JsonValue =>
  isJsonObject(value) && isJsonObject(value.$document) && isJsonObject(value.$schema) ? { ...value, data } : data;
