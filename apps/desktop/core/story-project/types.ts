export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };
export type StoryValue = JsonValue;

export type JsonFieldOption = Readonly<{ label: string; value: string }>;

export type JsonFieldMetadata = Readonly<{
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
  targetKinds?: readonly string[];
  targetObjectDefinitions?: readonly string[];
  options?: readonly JsonFieldOption[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  minItems?: number;
  maxItems?: number;
}>;

export type JsonObjectDefinition = Readonly<{
  label?: string;
  fields: Readonly<Record<string, JsonFieldMetadata>>;
}>;

export type StoryDocumentDefinition = Readonly<{
  definitions: Readonly<Record<string, JsonObjectDefinition>>;
  fields: Readonly<Record<string, JsonFieldMetadata>>;
  kind: string;
  label: string;
}>;

export type StoryDocument = Readonly<{
  definition?: StoryDocumentDefinition;
  path: string;
  value: StoryValue;
  updatedAt: number | null;
}>;

export type StoryValidationIssue = Readonly<{
  severity: "error" | "warning";
  code: string;
  path: string;
  message: string;
}>;

export type StoryValidationResult = Readonly<{
  valid: boolean;
  issues: StoryValidationIssue[];
}>;

export type StoryContextSource = Readonly<{
  kind: string;
  label: string;
  path: string;
  id?: string;
}>;

export type StoryContextSection = Readonly<{
  id: string;
  label: string;
  priority: number;
  required: boolean;
  content: string;
  sources: readonly StoryContextSource[];
}>;

export type StoryContext = Readonly<{
  scope: "project" | "chapter";
  revision: number;
  target: Readonly<{ kind: string; id: string; label: string }> | null;
  text: string;
  sections: readonly StoryContextSection[];
  sources: readonly StoryContextSource[];
}>;

export type StoryProjectState = Readonly<{
  manifest: Readonly<Record<string, unknown>>;
  documents: readonly StoryProjectFileEntry[];
}>;

export type StoryProjectFileEntry = Readonly<{ path: string; value: unknown }>;

export type StoryProjectAppliedChanges = Readonly<{
  project: StoryProjectState;
  nextRevision: number;
  validation: StoryValidationResult;
  batch: unknown | null;
  operationTypes: string[];
  changedPaths: string[];
}>;

export type StoryChangeSetDescription = Readonly<{
  maxOperations: number;
  maxBytes: number;
  operations: readonly string[];
  atomicCommit: true;
  revisionRequired: true;
}>;

export type StoryProjectStructure = Readonly<{
  storyType: Readonly<{
    id: string;
    version: number;
    label: string;
    description: string;
    rootPath: string;
    manifestKind: string;
    primaryKind?: string;
  }>;
  roles: Readonly<Record<string, string>>;
  documents: Readonly<
    Record<
      string,
      Readonly<{
        label: string;
        description?: string;
        contentType: "json" | "markdown";
        pathPattern: string;
        cardinality: "one" | "many";
      }>
    >
  >;
  contexts: Readonly<
    Record<
      string,
      Readonly<{
        label: string;
        scope: "project" | "chapter";
        targetKind?: string;
        documentKinds: readonly string[];
      }>
    >
  >;
  validationModes: readonly string[];
  schemas: Readonly<{
    documents: Readonly<
      Record<
        string,
        Readonly<{
          label: string;
          description?: string;
          contentType: "json" | "markdown";
          pathPattern: string;
          cardinality: "one" | "many";
          fields: Readonly<Record<string, JsonFieldMetadata>>;
        }>
      >
    >;
    objectDefinitions: Readonly<Record<string, JsonObjectDefinition>>;
  }>;
  changes: StoryChangeSetDescription;
  rules: readonly string[];
}>;

export type StoryOverview = Readonly<{
  id: string;
  title: string;
  description: string;
  goal: string;
  lengthType: string;
  createdAt: number;
  updatedAt: number;
  characters: readonly Readonly<{ id: string; name: string; avatar: string }>[];
  resourceCounts: Readonly<{ characters: number; chapters: number; worldEntries: number }>;
}>;

export type StoryInitialization = Readonly<{
  initialized: boolean;
  alreadyInitialized: boolean;
  revision: number | null;
  manifestPath: string | null;
  existingJsonPaths: string[];
  issues: StoryValidationIssue[];
  hint: string | null;
}>;

export type StoryChangeValidation = Readonly<{
  valid: boolean;
  nextRevision: number | null;
  issues: StoryValidationIssue[];
  batch: unknown | null;
  operationTypes: string[];
  changedPaths: string[];
}>;

export type StoryChangeResult = Readonly<{
  committed: boolean;
  valid: boolean;
  revision: number | null;
  batch: unknown | null;
  operationTypes: string[];
  changedPaths: string[];
  validation: StoryValidationResult | null;
  issues: StoryValidationIssue[];
  hint: string | null;
}>;
