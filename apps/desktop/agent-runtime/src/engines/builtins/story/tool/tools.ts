import type {
  CompiledStoryContractDescription,
  StoryValidationIssue,
  StoryValidationResult,
} from "../../../../../../protocols/story-project/index.js";

export const STORY_TOOL_ACTIONS = {
  describeStructure: "describe_structure",
  initialize: "initialize",
  readContext: "read_context",
  validateChanges: "validate_changes",
  commitChanges: "commit_changes",
} as const;

export type StoryToolAction = (typeof STORY_TOOL_ACTIONS)[keyof typeof STORY_TOOL_ACTIONS];

export type StoryStructureDescription = {
  compiler: { format: string; version: number };
  contract: CompiledStoryContractDescription;
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
  | { action: typeof STORY_TOOL_ACTIONS.describeStructure }
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

export interface StoryToolService {
  describeStructure(): Promise<StoryDescribeStructureResult>;
  initialize(input: StoryInitializeRequest): Promise<StoryInitializeResult>;
  readContext(input: StoryReadContextRequest): Promise<unknown>;
  validateChanges(input: StoryChangeSetRequest): Promise<StoryValidateChangesResult>;
  commitChanges(input: StoryChangeSetRequest): Promise<StoryCommitChangesResult>;
}
