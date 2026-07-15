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
  contentType: "json" | "markdown";
  pathPattern: string;
  cardinality: "one" | "many";
  fields: readonly StoryFieldDefinition[];
  companionKinds?: readonly string[];
  ruleIds?: readonly string[];
}>;

/** 可被多个故事类型复用的文档结构；文件路径由具体故事类型绑定。 */
export type StoryDocumentModelDefinition = Omit<StoryDocumentDefinition, "pathPattern">;

export type StoryContextDefinition = Readonly<{
  name: string;
  label: string;
  scope: "project" | "chapter";
  targetKind?: string;
  targetSelectors?: readonly string[];
  documentKinds: readonly string[];
}>;

export type StoryTypeDefinition = Readonly<{
  $format: "novel-claw.story-project";
  formatVersion: 1;
  id: string;
  version: number;
  label: string;
  description: string;
  rootPath: string;
  manifestKind: string;
  primaryKind?: string;
  roles: Readonly<Record<string, string>>;
  objects: readonly StoryObjectDefinition[];
  documents: readonly StoryDocumentDefinition[];
  contexts: readonly StoryContextDefinition[];
  validationModes: Readonly<Record<string, Readonly<{ label?: string; description?: string }>>>;
  rules: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}>;

export type StoryTypeSummary = Pick<StoryTypeDefinition, "id" | "version" | "label" | "description">;
