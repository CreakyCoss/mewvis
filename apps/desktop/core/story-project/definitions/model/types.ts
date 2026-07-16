export type StoryDataValue = string | number | boolean | null | StoryDataValue[] | { [key: string]: StoryDataValue };

export type StoryFieldType =
  | "id"
  | "text"
  | "textarea"
  | "content"
  | "integer"
  | "number"
  | "boolean"
  | "timestamp"
  | "enum"
  | "string-list"
  | "reference"
  | "reference-list"
  | "object"
  | "collection"
  | "path";

export type StoryDocumentRef = Readonly<{
  kind: string;
  identity: Readonly<Record<string, string>>;
}>;

export type StoryFieldDefinition = Readonly<{
  key: string;
  type: StoryFieldType;
  label: string;
  description?: string;
  required?: boolean;
  readOnly?: boolean;
  immutable?: boolean;
  generated?: boolean;
  const?: StoryDataValue;
  default?: StoryDataValue;
  definition?: string;
  itemDefinition?: string;
  targetKinds?: readonly string[];
  targetObjectDefinitions?: readonly string[];
  options?: readonly Readonly<{ value: string; label: string }>[];
  generatedFrom?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  minItems?: number;
  maxItems?: number;
}>;

export type StoryObjectDefinition = Readonly<{
  id: string;
  label?: string;
  fields: readonly StoryFieldDefinition[];
}>;

export type StoryDocumentDefinition = Readonly<{
  kind: string;
  label: string;
  description?: string;
  contentFormat: "structured" | "markdown";
  cardinality: "one" | "many";
  identityFields: readonly string[];
  fields: readonly StoryFieldDefinition[];
  companionKinds?: readonly string[];
  ruleIds?: readonly string[];
}>;

export type StoryDocumentModelDefinition = StoryDocumentDefinition;
