import type { StoryJson } from "../../story/model/types";
import type { StoryManuscriptManifestIdsKey, StoryManuscriptStatus as StoryManuscriptStatusValue } from "./status";

export { storyManuscriptStatuses } from "./status";
export type { StoryManuscriptStatus } from "./status";

export type StoryManuscriptSource = "tavern" | "chat" | "manual" | "aiPolish" | "import";

export type StoryManuscriptStorySnapshot = {
  id: string;
  title: string;
  outline: string;
  goal: string;
  userPersonaName: string;
  updatedAt: number;
};

export type StoryManuscriptNodeSnapshot = {
  nodeId: string;
  title: string;
  type: string;
  pathRole: string;
  status?: string;
  sceneId?: string;
  sceneTitle?: string;
  sceneSummary?: string;
  sceneGoal?: string;
  scenePlot?: string;
};

export type StoryManuscriptSubmissionInput = {
  storyId: string;
  nodeId: string;
  branchId?: string;
  source: StoryManuscriptSource;
  sourceRunId?: string;
  sourceMessageIds?: string[];
  title?: string;
  content: string;
  summary?: string;
  metadata?: Record<string, unknown>;
  createdAt?: number;
};

export type StoryManuscriptUpdateInput = {
  title?: string;
  content?: string;
  summary?: string;
  branchId?: string | null;
  metadata?: Record<string, unknown>;
  updatedAt?: number;
};

export type StoryManuscriptMeta = {
  version: 1;
  id: string;
  storyId: string;
  nodeId: string;
  branchId?: string;
  status: StoryManuscriptStatusValue;
  source: StoryManuscriptSource;
  sourceRunId?: string;
  sourceMessageIds: string[];
  title: string;
  summary: string;
  metadata: Record<string, unknown>;
  storySnapshot: StoryManuscriptStorySnapshot;
  nodeSnapshot: StoryManuscriptNodeSnapshot;
  contentPath: string;
  createdAt: number;
  updatedAt: number;
  acceptedAt?: number;
  rejectedAt?: number;
};

export type StoryManuscript = StoryManuscriptMeta & {
  content: string;
};

export type StoryManuscriptsNodeManifest = {
  nodeId: string;
  nodeSnapshot: StoryManuscriptNodeSnapshot | null;
} & Record<StoryManuscriptManifestIdsKey, string[]>;

export type StoryManuscriptsManifest = {
  version: 1;
  storyId: string;
  updatedAt: number;
  nodes: StoryManuscriptsNodeManifest[];
};

export type StoryManuscriptsByNode = Record<
  string,
  {
    node: StoryJson["graph"]["nodes"][number] | null;
  } & Record<StoryManuscriptStatusValue, StoryManuscript[]>
>;
