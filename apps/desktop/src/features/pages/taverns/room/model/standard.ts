import type { TavernMessage } from "@/features/pages/taverns/tavern/types";
import type { VisualPresetId } from "@/features/pages/taverns/tavern/visual-presets/types";
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

export type TavernSceneMemoryLayers = {
  required: string;
  private: string;
  public: string;
  directorSecret: string;
  updatedAt?: number;
};

export type TavernCharacterMemoryLayers = {
  required: string;
  public: string;
  known: string;
  privateSelf: string;
  directorSecret: string;
  updatedAt?: number;
};

export type TavernScene = {
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
  promptOverrides: TavernScenePromptOverrides;
  memoryLayers: TavernSceneMemoryLayers;
  characterMemoryLayers: Record<string, TavernCharacterMemoryLayers>;
  createdAt: number;
  updatedAt: number;
};

export type TavernRoomRuntime = {
  version: 1;
  identity: {
    id: string;
    workspaceId: string;
    title: string;
    creationSource: TavernRoomConfig["creationSource"];
    createdAt: number;
    updatedAt: number;
  };
  config: {
    room: TavernRoomConfig;
  };
  presentation: {
    profile: TavernRoomConfig["presentation"];
    prompt: TavernRoomConfig["prompt"];
    settings: TavernRoomConfig["settings"];
    scenePresetId: TavernRoomConfig["scenePresetId"];
    replyMode: TavernRoomConfig["replyMode"];
  };
  story: {
    binding?: TavernStoryBinding;
    outline: string;
    goal: string;
    graph: TavernStoryGraph;
    activeNodeId: string;
  };
  cast: {
    characters: TavernCharacter[];
    characterIds: string[];
    activeCharacterId: string;
    characterConfigs?: Record<string, TavernRoomCharacterConfig>;
    characterMemories: Record<string, string>;
  };
  scene: TavernScene;
  world: {
    lorebookEntries: TavernLorebookEntry[];
  };
  user: {
    personaName: string;
  };
};

export type TavernRoomSessionState = {
  runtime: TavernRoomRuntime | null;
  messages: TavernMessage[];
};
