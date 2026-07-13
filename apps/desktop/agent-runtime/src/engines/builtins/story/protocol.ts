import type {
  CompiledStoryContextViewDescription,
  CompiledStoryDocumentDescription,
  StoryProfileDescription,
  StoryContextBundle,
  StoryValidationIssue,
  StoryValidationResult,
} from "../../../../../protocols/story-project/index.js";
import { defineBuiltinToolContract } from "../definition.js";

/** Story 内置能力自身使用的稳定身份，不属于工作区 Story Project 协议。 */
export const STORY_BUILTIN_IDENTIFIERS = Object.freeze({
  /** 技能依赖的 Story Tool Contract；实现可以替换，但必须满足这组方法。 */
  toolContract: Object.freeze({
    id: "novel-claw.story-project-tool",
    version: 1,
  }),
  /** agent-runtime 创建的默认 Story Tool 实现包身份。 */
  toolPackage: Object.freeze({
    id: "novel-claw.story",
  }),
});

export const STORY_TOOL_ACTIONS = {
  describeStructure: "describe_structure",
  initialize: "initialize",
  readContext: "read_context",
  validateChanges: "validate_changes",
  commitChanges: "commit_changes",
} as const;

export type StoryToolAction = (typeof STORY_TOOL_ACTIONS)[keyof typeof STORY_TOOL_ACTIONS];

export type StoryDescribeStructureRequest = {
  documentKinds?: string[];
};

export type StoryStructureProfileDescription = Pick<
  StoryProfileDescription,
  "$format" | "profileId" | "profileVersion" | "schemaVersion" | "rootPath" | "manifestKind" | "primaryKind"
> & {
  documentRoles: StoryProfileDescription["documentRoles"];
  documents: Readonly<
    Record<
      string,
      Pick<
        CompiledStoryDocumentDescription,
        "label" | "description" | "contentType" | "layoutPresence" | "pathPattern" | "cardinality"
      >
    >
  >;
  contextViews: Readonly<
    Record<string, Pick<CompiledStoryContextViewDescription, "label" | "scope" | "targetKind" | "documentKinds">>
  >;
  validationProfiles: readonly string[];
};

export type StoryStructureDescription = {
  compiler: { format: string; version: number };
  profile: StoryStructureProfileDescription;
  schemas: {
    documents: Readonly<Record<string, CompiledStoryDocumentDescription>>;
    objectDefinitions: StoryProfileDescription["objectDefinitions"];
  };
  changeSet: {
    maxOperations: number;
    maxBytes: number;
    operations: readonly string[];
    atomicCommit: true;
    revisionRequired: true;
  };
  rules: string[];
};

export type StoryDescribeStructureResult = {
  available: true;
  structure: StoryStructureDescription;
};

export type StoryInitializeRequest = {
  storyId: string;
  title: string;
  replaceExistingJson?: boolean;
};

export type StoryInitializeResult = {
  initialized: boolean;
  alreadyInitialized: boolean;
  revision: number | null;
  manifestPath: string | null;
  existingJsonPaths: string[];
  issues: StoryValidationIssue[];
  hint: string | null;
};

export type StoryReadContextRequest = {
  scope: "project" | "chapter";
  targetId?: string;
};

export type StoryChangeSetRequest = {
  changeSet: unknown;
};

export type StoryToolRequest =
  | ({ action: typeof STORY_TOOL_ACTIONS.describeStructure } & StoryDescribeStructureRequest)
  | ({ action: typeof STORY_TOOL_ACTIONS.initialize } & StoryInitializeRequest)
  | ({ action: typeof STORY_TOOL_ACTIONS.readContext } & StoryReadContextRequest)
  | ({ action: typeof STORY_TOOL_ACTIONS.validateChanges } & StoryChangeSetRequest)
  | ({ action: typeof STORY_TOOL_ACTIONS.commitChanges } & StoryChangeSetRequest);

export type StoryValidateChangesResult = {
  valid: boolean;
  nextRevision: number | null;
  issues: StoryValidationIssue[];
  batch: unknown | null;
  operationTypes: string[];
  changedPaths: string[];
};

export type StoryCommitChangesResult = {
  committed: boolean;
  valid: boolean;
  revision: number | null;
  batch: unknown | null;
  operationTypes: string[];
  changedPaths: string[];
  validation: StoryValidationResult | null;
  issues: StoryValidationIssue[];
  hint: string | null;
};

export interface StoryToolApi {
  describeStructure(input?: StoryDescribeStructureRequest): Promise<StoryDescribeStructureResult>;
  initialize(input: StoryInitializeRequest): Promise<StoryInitializeResult>;
  readContext(input: StoryReadContextRequest): Promise<StoryContextBundle>;
  validateChanges(input: StoryChangeSetRequest): Promise<StoryValidateChangesResult>;
  commitChanges(input: StoryChangeSetRequest): Promise<StoryCommitChangesResult>;
}

export const STORY_TOOL_CONTRACT = defineBuiltinToolContract<StoryToolApi>()({
  id: STORY_BUILTIN_IDENTIFIERS.toolContract.id,
  version: STORY_BUILTIN_IDENTIFIERS.toolContract.version,
  properties: {},
  methods: {
    describeStructure: { description: "返回 Compiler 标准化后的故事结构与 ChangeSet 约束" },
    initialize: { description: "按当前故事协议初始化项目" },
    readContext: { description: "读取项目摘要或章节写作上下文" },
    validateChanges: { description: "校验小批次 ChangeSet，但不写入" },
    commitChanges: { description: "校验并原子提交小批次 ChangeSet" },
  },
});
