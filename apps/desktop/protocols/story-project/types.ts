export type StoryProfileIdentity = Readonly<{
  format: string;
  profileId: string;
  profileVersion: number;
}>;

/** Compiler 标准化后供 StoryProjectApi 内部使用的字段描述。 */
export type CompiledStoryFieldDescription = Readonly<{
  type: string;
  label: string;
  description?: string;
  required?: boolean;
  readOnly?: boolean;
  immutable?: boolean;
  generated?: boolean;
  const?: unknown;
  default?: unknown;
  definition?: string;
  itemDefinition?: string;
  targetKinds?: readonly string[];
  targetObjectDefinitions?: readonly string[];
  options?: readonly Readonly<{ value: string; label: string }>[];
  [key: string]: unknown;
}>;

export type CompiledStoryDocumentDescription = Readonly<{
  label: string;
  description?: string;
  contentType?: "json" | "markdown";
  layoutPresence: "required" | "optional";
  pathPattern: string;
  cardinality: "one" | "many";
  fields: Readonly<Record<string, CompiledStoryFieldDescription>>;
  fieldSets?: readonly string[];
  constFields?: Readonly<Record<string, unknown>>;
  companionKinds?: readonly string[];
  ruleIds?: readonly string[];
  [key: string]: unknown;
}>;

export type CompiledStoryContextViewDescription = Readonly<{
  name: string;
  label: string;
  scope: "project" | "chapter";
  targetKind?: string;
  targetSelectors?: readonly string[];
  documentKinds: readonly string[];
  [key: string]: unknown;
}>;

export type StoryProfileDescription = Readonly<{
  $format: string;
  profileId: string;
  profileVersion: number;
  schemaVersion: number;
  rootPath: string;
  manifestKind: string;
  primaryKind?: string;
  documentRoles: Readonly<Record<string, string>>;
  commonFieldSets: Readonly<Record<string, Readonly<Record<string, CompiledStoryFieldDescription>>>>;
  objectDefinitions: Readonly<
    Record<
      string,
      Readonly<{ fields: Readonly<Record<string, CompiledStoryFieldDescription>>; [key: string]: unknown }>
    >
  >;
  documents: Readonly<Record<string, CompiledStoryDocumentDescription>>;
  contextViews: Readonly<Record<string, Omit<CompiledStoryContextViewDescription, "name">>>;
  validationProfiles: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  [key: string]: unknown;
}>;

export type SerializedStoryDocument = Record<string, unknown> | string;

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

export type StoryContextBundle = Readonly<{
  scope: "project" | "chapter";
  revision: number;
  target: Readonly<{ kind: string; id: string; label: string }> | null;
  text: string;
  sections: readonly StoryContextSection[];
  sources: readonly StoryContextSource[];
}>;

export type StoryCompiledProject = Readonly<{
  manifest: Readonly<Record<string, unknown>>;
  documents: readonly CompiledStoryProjectFileEntry[];
}>;

export type CompiledStoryProjectFileEntry = Readonly<{
  path: string;
  value: unknown;
}>;

export type CompiledStoryManifest = Readonly<{
  value: unknown;
  storyId: string;
  revision: number;
  files: readonly Readonly<{ path: string; kind: string; id: string }>[];
}>;

export type AppliedStoryChanges = Readonly<{
  project: StoryCompiledProject;
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
