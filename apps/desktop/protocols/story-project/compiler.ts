export const STORY_PROJECT_CONTRACT_PATH = "story/.novel-claw/contract.json" as const;
export const STORY_PROJECT_CONTRACT_LOCK_PATH = "story/.novel-claw/contract.lock.json" as const;
export const STORY_PROJECT_CONTRACT_TOOL_CAPABILITY = "novel-claw.story-project-contract-tool@1" as const;
export const STORY_DOCUMENT_MODEL_CAPABILITY = "novel-claw.story.documents@1" as const;
export const STORY_PROJECT_CONTEXT_CAPABILITY = "novel-claw.story.context.project@1" as const;
export const STORY_CHAPTER_CONTEXT_CAPABILITY = "novel-claw.story.context.chapter-writing@1" as const;
export const STORY_ATOMIC_CHANGES_CAPABILITY = "novel-claw.story.changes.atomic@1" as const;

export type StoryContractIdentity = Readonly<{
  format: string;
  contractId: string;
  contractVersion: number;
}>;

/**
 * Compiler-normalized structure exposed to tools and skills.
 *
 * This deliberately does not reuse a concrete contract source type. A compiler
 * may accept any source format as long as it can normalize it to this shape.
 */
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
  pathPattern: string;
  cardinality: "one" | "many";
  fields: Readonly<Record<string, CompiledStoryFieldDescription>>;
  fieldSets?: readonly string[];
  constFields?: Readonly<Record<string, unknown>>;
  ruleIds?: readonly string[];
  [key: string]: unknown;
}>;

export type CompiledStoryContextViewDescription = Readonly<{
  name: string;
  label: string;
  capability: string;
  scope: "project" | "chapter";
  targetKind?: string;
  targetSelectors?: readonly string[];
  documentKinds: readonly string[];
  [key: string]: unknown;
}>;

export type CompiledStoryContractDescription = Readonly<{
  $format: string;
  contractId: string;
  contractVersion: number;
  capabilities: readonly string[];
  schemaVersion: number;
  rootPath: string;
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

export type CompiledStructuredStoryDocument = Readonly<{
  $format: string;
  $formatVersion: number;
  $contract: Readonly<{ id: string; version: number }>;
  $document: Readonly<{ kind: string; label: string; path: string }>;
  $schema: Readonly<{
    fields: Readonly<Record<string, CompiledStoryFieldDescription>>;
    objectDefinitions: Readonly<Record<string, unknown>>;
  }>;
  data: Record<string, unknown>;
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

export type StoryCompiledProject = unknown;

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

export interface CompiledStoryContract {
  readonly compiler: Readonly<{ format: string; version: number }>;
  readonly identity: StoryContractIdentity;
  readonly capabilities: ReadonlySet<string>;
  readonly changeSet: StoryChangeSetDescription;

  describe(): CompiledStoryContractDescription;
  assertCapabilities(required: readonly string[]): void;
  document(kind: string): CompiledStoryDocumentDescription;
  documentFields(kind: string): Readonly<Record<string, CompiledStoryFieldDescription>>;
  contextView(scope: CompiledStoryContextViewDescription["scope"]): CompiledStoryContextViewDescription;
  resolveDocument(kind: string, parameters?: Readonly<Record<string, string>>): string;
  kindForPath(path: string): string;
  materializeDocument(input: unknown, expectedKind: string, timestamp?: number): Record<string, unknown>;
  encodeDocument(input: unknown, path: string): CompiledStructuredStoryDocument;
  decodeDocument(input: unknown, path: string): Record<string, unknown>;

  projectManifestPath(): string;
  createProject(input: { storyId: string; title: string; timestamp?: number }): StoryCompiledProject;
  parseManifest(input: unknown): CompiledStoryManifest;
  assembleProject(entries: readonly CompiledStoryProjectFileEntry[]): StoryCompiledProject;
  projectFiles(project: StoryCompiledProject): CompiledStoryProjectFileEntry[];
  projectManifest(project: StoryCompiledProject): unknown;
  projectInfo(project: StoryCompiledProject): { storyId: string; revision: number };
  validateProject(project: StoryCompiledProject, profile: string): StoryValidationResult;
  applyChanges(project: StoryCompiledProject, changeSet: unknown): AppliedStoryChanges;
  readContext(project: StoryCompiledProject, input: { scope: "project" | "chapter"; targetId?: string }): unknown;
}

export interface StoryContractCompiler {
  readonly format: string;
  readonly compilerVersion: number;
  compile(source: unknown): CompiledStoryContract;
}
