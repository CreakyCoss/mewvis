import { defineProtocol } from "../definition.js";

export const STORY_PROJECT_CONTRACT_PATH = "story/.novel-claw/contract.json" as const;
export const STORY_PROJECT_CONTRACT_LOCK_PATH = "story/.novel-claw/contract.lock.json" as const;

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

export interface StoryProjectApi {
  readonly compiler: Readonly<{ format: string; version: number }>;
  readonly identity: StoryContractIdentity;
  readonly changeSet: StoryChangeSetDescription;

  describe(): CompiledStoryContractDescription;
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

export const STORY_PROJECT_PROTOCOL = defineProtocol<StoryProjectApi>()({
  id: "novel-claw.story-project",
  version: 1,
  properties: {
    compiler: { description: "实际编译工作区 contract 的受信任 Compiler 身份" },
    identity: { description: "当前故事项目 contract 的稳定身份" },
    changeSet: { description: "增量变更限制与支持的操作" },
  },
  methods: {
    describe: { description: "返回标准化后的故事项目结构" },
    document: { description: "按 kind 读取文档定义" },
    documentFields: { description: "按 kind 读取合并后的字段定义" },
    contextView: { description: "读取项目或章节上下文视图" },
    resolveDocument: { description: "按 kind 和参数解析文档路径" },
    kindForPath: { description: "按路径识别文档 kind" },
    materializeDocument: { description: "补齐并规范化普通故事数据" },
    encodeDocument: { description: "编码自描述故事 JSON" },
    decodeDocument: { description: "解码自描述故事 JSON" },
    projectManifestPath: { description: "返回项目 Manifest 路径" },
    createProject: { description: "创建空故事项目" },
    parseManifest: { description: "解析并校验 Manifest" },
    assembleProject: { description: "从文件条目装配故事项目" },
    projectFiles: { description: "枚举项目内容文件" },
    projectManifest: { description: "读取项目 Manifest 数据" },
    projectInfo: { description: "读取项目身份与 revision" },
    validateProject: { description: "按 profile 校验完整项目" },
    applyChanges: { description: "应用并校验原子 ChangeSet" },
    readContext: { description: "生成项目摘要或章节写作上下文" },
  },
});
