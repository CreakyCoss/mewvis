import type { StoryManuscriptInbox } from "../modules/manuscripts/manuscript-inbox";

export type StoryJsonVersion = 1;

export type StoryLorebookEntryJson = {
  id: string;
  title: string;
  content: string;
  keywords: string[];
  enabled: boolean;
  alwaysOn: boolean;
};

export type StorySceneStatusJson = {
  location?: string;
  timeLabel?: string;
  weather?: string;
  atmosphere?: string;
  scenePhase?: string;
  immediateThreat?: string;
};

export type StorySceneJson = {
  id: string;
  title: string;
  scene: string;
  goal: string;
  plot: string;
  direction: string;
  transition: string;
  memory: string;
  status?: StorySceneStatusJson;
};

export type StoryCharacterMemoryJson = {
  required: string;
  public: string;
  known: string;
  privateSelf: string;
  directorSecret: string;
};

export type StoryCharacterJson = {
  id: string;
  name: string;
  avatar: string;
  description: string;
  speakingStyle: string;
  writingStyle?: string;
  replyStylePrompt?: string;
  goals?: string;
  relationshipSummary?: string;
  publicRelationshipSummary?: string;
  memory?: StoryCharacterMemoryJson;
};

export type StoryStageJson = {
  id: string;
  title: string;
  summary?: string;
  order: number;
};

export type StoryNodeJson = {
  id: string;
  stageId: string;
  sceneId?: string;
  title: string;
  type: string;
  pathRole: string;
  status?: string;
};

export type StoryEdgeJson = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  label: string;
  reason?: string;
  isDefault?: boolean;
  priority: number;
};

export type StoryGraphJson = {
  entryNodeId: string;
  activeNodeId: string;
  stages: StoryStageJson[];
  nodes: StoryNodeJson[];
  edges: StoryEdgeJson[];
};

export type StoryJson = {
  version: StoryJsonVersion;
  id: string;
  workspaceId: string;
  title: string;
  outline: string;
  goal: string;
  userPersonaName: string;
  characters: StoryCharacterJson[];
  lorebookEntries: StoryLorebookEntryJson[];
  scenes: StorySceneJson[];
  graph: StoryGraphJson;
  manuscriptInbox: StoryManuscriptInbox;
  createdAt: number;
  updatedAt: number;
};
