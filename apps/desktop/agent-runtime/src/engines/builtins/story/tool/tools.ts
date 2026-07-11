import type { StoryChangeSet } from "./change-set.js";
import type { StoryAuthoringContract } from "./contract.js";
import type {
  StoryBookArcFile,
  StoryBookFile,
  StoryAnalysisFile,
  StoryChapterFile,
  StoryChapterPlanFile,
  StoryCharacterFile,
  StoryCharacterStateFile,
  StoryForeshadowsFile,
  StoryPositioningFile,
  StoryProgressFile,
  StoryImportFile,
  StoryRelationshipsFile,
  StoryReviewFile,
  StoryStyleFile,
  StoryVolumeFile,
  StoryWorldEntryFile,
} from "./schema.js";
import type { StoryValidationIssue, StoryValidationResult } from "./validation.js";

export const STORY_TOOL_ACTIONS = {
  describeStructure: "describe_structure",
  initialize: "initialize",
  readContext: "read_context",
  validateChanges: "validate_changes",
  commitChanges: "commit_changes",
} as const;

export type StoryToolAction = (typeof STORY_TOOL_ACTIONS)[keyof typeof STORY_TOOL_ACTIONS];

export type StoryStructureDescription = {
  contract: StoryAuthoringContract;
  changeSet: {
    maxOperations: number;
    maxBytes: number;
    operations: string[];
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
  manifestPath: string;
  existingJsonPaths: string[];
  issues: StoryValidationIssue[];
  hint: string | null;
};

export type StoryReadContextRequest = {
  scope: "project" | "chapter";
  targetId?: string;
};

export type StoryProjectSummary = {
  revision: number;
  book: StoryBookFile;
  positioning: StoryPositioningFile;
  style: StoryStyleFile;
  arc: StoryBookArcFile;
  volumes: Array<
    Pick<
      StoryVolumeFile,
      "id" | "number" | "title" | "startChapter" | "endChapter" | "phase" | "purpose" | "coreConflict"
    >
  >;
  chapters: Array<
    Pick<StoryChapterPlanFile, "id" | "number" | "title" | "volumeId" | "targetEmotion" | "coreEvent" | "status">
  >;
  characters: Array<Pick<StoryCharacterFile, "id" | "name" | "role" | "goals">>;
  worldEntries: Array<Pick<StoryWorldEntryFile, "id" | "title" | "category" | "keywords">>;
  analyses: Array<Pick<StoryAnalysisFile, "id" | "analysisType" | "target" | "status"> & { sourceTitle: string }>;
  reviews: Array<Pick<StoryReviewFile, "id" | "reviewType" | "verdict"> & { openFindings: number }>;
  imports: Array<Pick<StoryImportFile, "id" | "sourceTitle" | "lengthType" | "status">>;
  progress: StoryProgressFile;
  validation: StoryValidationResult;
};

export type StoryChapterContext = {
  revision: number;
  book: StoryBookFile;
  positioning: StoryPositioningFile;
  style: StoryStyleFile;
  volume: StoryVolumeFile | null;
  plan: StoryChapterPlanFile;
  chapter: StoryChapterFile | null;
  previousChapter: Pick<StoryChapterFile, "id" | "title" | "summary" | "content"> | null;
  characters: StoryCharacterFile[];
  characterStates: StoryCharacterStateFile[];
  worldEntries: StoryWorldEntryFile[];
  relationships: StoryRelationshipsFile["relationships"];
  foreshadows: StoryForeshadowsFile["foreshadows"];
  progress: StoryProgressFile;
  sources: string[];
};

export type StoryReadContextResult = StoryProjectSummary | StoryChapterContext;

export type StoryChangeSetRequest = {
  changeSet: StoryChangeSet;
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
  batch: StoryChangeSet["batch"] | null;
  operationTypes: string[];
  changedPaths: string[];
};

export type StoryCommitChangesResult = {
  committed: boolean;
  valid: boolean;
  revision: number | null;
  batch: StoryChangeSet["batch"] | null;
  operationTypes: string[];
  changedPaths: string[];
  validation: StoryValidationResult | null;
  issues: StoryValidationIssue[];
  hint: string | null;
};

export interface StoryToolService {
  describeStructure(): Promise<StoryDescribeStructureResult>;
  initialize(input: StoryInitializeRequest): Promise<StoryInitializeResult>;
  readContext(input: StoryReadContextRequest): Promise<StoryReadContextResult>;
  validateChanges(input: StoryChangeSetRequest): Promise<StoryValidateChangesResult>;
  commitChanges(input: StoryChangeSetRequest): Promise<StoryCommitChangesResult>;
}
