export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export type JsonObject = {
  [key: string]: JsonValue;
};

export type StoryJsonDocument = {
  definition?: StoryJsonDocumentDefinition;
  path: string;
  value: JsonValue;
  updatedAt: number | null;
};

export type JsonFieldOption = {
  label: string;
  value: string;
};

export type JsonFieldMetadata = {
  type: string;
  label: string;
  description?: string;
  const?: JsonValue;
  default?: JsonValue;
  required?: boolean;
  readOnly?: boolean;
  immutable?: boolean;
  generated?: boolean;
  definition?: string;
  itemDefinition?: string;
  options?: JsonFieldOption[];
};

export type JsonObjectDefinition = {
  label?: string;
  fields: Record<string, JsonFieldMetadata>;
};

export type StoryJsonDocumentDefinition = {
  definitions: Record<string, JsonObjectDefinition>;
  fields: Record<string, JsonFieldMetadata>;
  kind: string;
  label: string;
};

export type StructuredJsonDocument = {
  data: JsonObject;
  definitions: Record<string, JsonObjectDefinition>;
  fields: Record<string, JsonFieldMetadata>;
  kind: string;
  label: string;
  path: string;
};
