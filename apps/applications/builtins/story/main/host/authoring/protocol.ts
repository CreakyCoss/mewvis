import { defineBuiltinToolContract } from "../definition.js";

type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

type StoryFieldDescription = Readonly<{
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
  options?: readonly Readonly<{ label: string; value: string }>[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  minItems?: number;
  maxItems?: number;
}>;

type StoryObjectDescription = Readonly<{
  label?: string;
  fields: Readonly<Record<string, StoryFieldDescription>>;
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

export type StoryDocumentIdentity = Readonly<{
  kind: string;
  identity: Readonly<Record<string, string>>;
}>;

export type StoryContextBundle = Readonly<{
  scope: "project" | "chapter";
  revision: number;
  target: Readonly<{ kind: string; id: string; label: string }> | null;
  text: string;
  sections: readonly Readonly<{
    id: string;
    label: string;
    priority: number;
    required: boolean;
    content: string;
    sources: readonly Readonly<{
      kind: string;
      label: string;
      ref: StoryDocumentIdentity;
      id?: string;
    }>[];
  }>[];
  sources: readonly Readonly<{
    kind: string;
    label: string;
    ref: StoryDocumentIdentity;
    id?: string;
  }>[];
}>;

/** Story 内置能力自身使用的稳定身份，不属于具体工作区故事类型。 */
export const STORY_BUILTIN_IDENTIFIERS = Object.freeze({
  /** 技能依赖的 Story Tool Contract；实现可以替换，但必须满足这组方法。 */
  toolContract: Object.freeze({
    id: "isle-claw.story-project-tool",
    version: 2,
  }),
  /** agent-runtime 创建的默认 Story Tool 实现包身份。 */
  toolPackage: Object.freeze({ id: "isle-claw.story" }),
});

export const STORY_TOOL_ACTIONS = {
  describeStructure: "describe_structure",
  initialize: "initialize",
  readContext: "read_context",
  validateChanges: "validate_changes",
  commitChanges: "commit_changes",
} as const;

export type StoryToolAction =
  (typeof STORY_TOOL_ACTIONS)[keyof typeof STORY_TOOL_ACTIONS];

export type StoryDescribeStructureRequest = { documentKinds?: string[] };

export type StoryStructureDescription = Readonly<{
  storyType: Readonly<{
    id: string;
    version: number;
    label: string;
    description: string;
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
        contentFormat: "structured" | "markdown";
        cardinality: "one" | "many";
        identityFields: readonly string[];
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
          contentFormat: "structured" | "markdown";
          cardinality: "one" | "many";
          identityFields: readonly string[];
          fields: Readonly<Record<string, StoryFieldDescription>>;
        }>
      >
    >;
    objectDefinitions: Readonly<Record<string, StoryObjectDescription>>;
  }>;
  changes: Readonly<{
    maxOperations: number;
    maxBytes: number;
    operations: readonly string[];
    atomicCommit: true;
    revisionRequired: true;
  }>;
  rules: readonly string[];
}>;

export type StoryDescribeStructureResult = {
  available: true;
  structure: StoryStructureDescription;
};

export type StoryInitializeRequest = {
  storyId: string;
  title: string;
  storyTypeId?: string;
  replaceExisting?: boolean;
};

export type StoryInitializeResult = {
  initialized: boolean;
  alreadyInitialized: boolean;
  revision: number | null;
  manifestRef: StoryDocumentIdentity | null;
  existingEntryCount: number;
  issues: StoryValidationIssue[];
  hint: string | null;
};

export type StoryReadContextRequest = {
  scope: "project" | "chapter";
  targetId?: string;
};
export type StoryChangeSetRequest = { changeSet: unknown };

export type StoryToolRequest =
  | ({
      action: typeof STORY_TOOL_ACTIONS.describeStructure;
    } & StoryDescribeStructureRequest)
  | ({ action: typeof STORY_TOOL_ACTIONS.initialize } & StoryInitializeRequest)
  | ({
      action: typeof STORY_TOOL_ACTIONS.readContext;
    } & StoryReadContextRequest)
  | ({
      action: typeof STORY_TOOL_ACTIONS.validateChanges;
    } & StoryChangeSetRequest)
  | ({
      action: typeof STORY_TOOL_ACTIONS.commitChanges;
    } & StoryChangeSetRequest);

export type StoryValidateChangesResult = {
  valid: boolean;
  nextRevision: number | null;
  issues: StoryValidationIssue[];
  batch: unknown | null;
  operationTypes: string[];
  changedDocuments: StoryDocumentIdentity[];
};

export type StoryCommitChangesResult = {
  committed: boolean;
  valid: boolean;
  revision: number | null;
  batch: unknown | null;
  operationTypes: string[];
  changedDocuments: StoryDocumentIdentity[];
  validation: StoryValidationResult | null;
  issues: StoryValidationIssue[];
  hint: string | null;
};

export interface StoryToolApi {
  describeStructure(
    input?: StoryDescribeStructureRequest,
  ): Promise<StoryDescribeStructureResult>;
  initialize(input: StoryInitializeRequest): Promise<StoryInitializeResult>;
  readContext(input: StoryReadContextRequest): Promise<StoryContextBundle>;
  validateChanges(
    input: StoryChangeSetRequest,
  ): Promise<StoryValidateChangesResult>;
  commitChanges(
    input: StoryChangeSetRequest,
  ): Promise<StoryCommitChangesResult>;
}

export const STORY_TOOL_CONTRACT = defineBuiltinToolContract<StoryToolApi>()({
  id: STORY_BUILTIN_IDENTIFIERS.toolContract.id,
  version: STORY_BUILTIN_IDENTIFIERS.toolContract.version,
  properties: {},
  methods: {
    describeStructure: {
      description: "返回当前故事类型的文档目录、字段结构与 ChangeSet 约束",
    },
    initialize: { description: "按当前故事类型初始化项目" },
    readContext: { description: "读取项目摘要或章节写作上下文" },
    validateChanges: { description: "校验小批次 ChangeSet，但不写入" },
    commitChanges: { description: "校验并原子提交小批次 ChangeSet" },
  },
});
