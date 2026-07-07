import type { VisualPresetId } from "@/features/pages/taverns/tavern/visual-presets";
import type { TavernMessage } from "@/features/pages/taverns/tavern/types";
import type {
  TavernCharacter,
  TavernCharacterPrivateStatus,
  TavernCharacterPublicStatus,
  TavernLorebookEntry,
  TavernPendingInteraction,
  TavernReplyOption,
  TavernRoom as TavernRoomConfig,
  TavernRoomCharacterConfig,
  TavernScenePromptOverrides,
  TavernSceneRelationshipOverride,
  TavernSceneStatus,
} from "@/features/pages/taverns/manage/model";

export type TavernStoryNodeType = "normal" | "failure" | "ending";

export type TavernStoryPathRole = "main" | "branch";

export type TavernStoryNodeStatus = "draft" | "ready" | "played";

export type TavernStoryNode = {
  id: string;
  sceneId?: string;
  title: string;
  type: TavernStoryNodeType;
  pathRole: TavernStoryPathRole;
  position: {
    x: number;
    y: number;
  };
  status: TavernStoryNodeStatus;
  createdAt: number;
  updatedAt: number;
};

export type TavernStoryEdge = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  label: string;
  reason?: string;
  isDefault?: boolean;
  priority: number;
  createdAt: number;
  updatedAt: number;
};

export type TavernStoryGraph = {
  version: 1;
  entryNodeId: string;
  activeNodeId: string;
  nodes: TavernStoryNode[];
  edges: TavernStoryEdge[];
};

export type TavernStoryBinding = {
  version: 1;
  storyId: string;
  source: "story";
  boundAt: number;
};

export type TavernScene = {
  id: string;
  order: number;
  title: string;
  scenePresetId: VisualPresetId;
  scene: string;
  sceneGoal: string;
  plot: string;
  storyDirection: string;
  transition: string;
  memory: string;
  relationshipOverrides: TavernSceneRelationshipOverride[];
  sceneStatus?: TavernSceneStatus;
  characterPublicStatuses: Record<string, TavernCharacterPublicStatus>;
  characterPrivateStatuses: Record<string, TavernCharacterPrivateStatus>;
  pendingInteractions: TavernPendingInteraction[];
  replyOptions: TavernReplyOption[];
  characterConfigs?: Record<string, TavernRoomCharacterConfig>;
  characterMemories: Record<string, string>;
  characterIds: string[];
  activeCharacterId: string;
  createdAt: number;
  updatedAt: number;
};

export type TavernSceneMemoryLayers = {
  required: string;
  private: string;
  public: string;
  directorSecret: string;
  entries?: TavernMemoryEntry[];
  updatedAt?: number;
};

export type TavernCharacterMemoryLayers = {
  required: string;
  public: string;
  known: string;
  privateSelf: string;
  directorSecret: string;
  entries?: TavernMemoryEntry[];
  updatedAt?: number;
};

export type TavernMemoryVisibility = "public" | "character_known" | "private_self" | "director" | "hidden";

export type TavernMemoryEntry = {
  id: string;
  text: string;
  visibility: TavernMemoryVisibility;
  secretId?: string;
  ownerCharacterId?: string;
  visibleToCharacterIds?: string[];
  sourceMessageIds?: string[];
  createdAt: number;
  updatedAt: number;
};

export type TavernSecretRevealScope =
  | { type: "scene"; sceneId: string }
  | { type: "node"; nodeId: string }
  | { type: "sceneInstance"; sceneInstanceId: string }
  | { type: "run"; runId: string };

export type TavernSecretReveal = {
  id: string;
  secretId: string;
  scope: TavernSecretRevealScope;
  visibility: "public" | "character";
  targetCharacterIds: string[];
  sourceMessageIds: string[];
  note?: string;
  revealedAt: number;
};

export type TavernStoryRun = {
  id: string;
  title: string;
  pathNodeIds: string[];
  pathEdgeIds: string[];
  activeNodeId: string;
  createdAt: number;
  updatedAt: number;
};

export type TavernSceneInstance = TavernScene & {
  sceneId: string;
  nodeId: string;
  runIds: string[];
  pathNodeIds: string[];
  pathEdgeIds: string[];
  promptOverrides: TavernScenePromptOverrides;
  memoryLayers: TavernSceneMemoryLayers;
  characterMemoryLayers: Record<string, TavernCharacterMemoryLayers>;
  secretReveals: TavernSecretReveal[];
};

export type TavernRuntimeRoom = TavernRoomConfig & {
  storyBinding?: TavernStoryBinding;
  storyOutline: string;
  storyGoal: string;
  storyGraph: TavernStoryGraph;
  storyRuns: TavernStoryRun[];
  activeRunId?: string;
  activeSceneInstanceId?: string;
  sceneInstances: TavernSceneInstance[];
  activeSceneId?: string;
  scenes?: TavernScene[];
  scene: string;
  sceneGoal: string;
  scenePlot: string;
  sceneDirection: string;
  sceneTransition: string;
  memory: string;
  relationshipOverrides: TavernSceneRelationshipOverride[];
  sceneStatus?: TavernSceneStatus;
  characterPublicStatuses: Record<string, TavernCharacterPublicStatus>;
  characterPrivateStatuses: Record<string, TavernCharacterPrivateStatus>;
  pendingInteractions: TavernPendingInteraction[];
  replyOptions: TavernReplyOption[];
  characterConfigs?: Record<string, TavernRoomCharacterConfig>;
  characterMemories: Record<string, string>;
  localCharacters?: TavernCharacter[];
  lorebookEntries: TavernLorebookEntry[];
  characterIds: string[];
  activeCharacterId: string;
  userPersonaName: string;
};

export type TavernRoomSessionState = {
  room: TavernRuntimeRoom | null;
  messages: TavernMessage[];
};
