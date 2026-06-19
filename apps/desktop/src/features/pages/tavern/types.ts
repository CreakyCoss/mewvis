import type { VisualPresetId } from "@/features/pages/tavern/visual-presets";

export type TavernReplyMode = "active" | "round" | "director";

export type TavernRoomCharacterConfig = {
  characterId: string;
  memory?: string;
};

export type TavernCharacter = {
  id: string;
  systemPresetId?: string;
  systemPresetCharacterId?: string;
  systemPresetVersion?: number;
  name: string;
  avatar: string;
  description: string;
  speakingStyle: string;
  goals?: string;
  relationships?: string;
  createdAt: number;
  updatedAt: number;
};

export type TavernLorebookEntry = {
  id: string;
  title: string;
  content: string;
  keywords: string[];
  enabled: boolean;
  alwaysOn: boolean;
  createdAt: number;
  updatedAt: number;
};

export type TavernTimelineEvent = {
  id: string;
  title: string;
  summary: string;
  createdAt: number;
  updatedAt: number;
};

export type TavernTimelineDraft = {
  id: string;
  title: string;
  summary: string;
};

export type TavernCharacterMemoryDraft = {
  id: string;
  characterId: string;
  note: string;
};

export type TavernLorebookDraft = {
  id: string;
  title: string;
  content: string;
  keywords: string[];
  alwaysOn: boolean;
};

export type TavernAssetDraft = {
  id: string;
  sourceMessageIds: string[];
  timelineEvents: TavernTimelineDraft[];
  characterMemories: TavernCharacterMemoryDraft[];
  lorebookEntries: TavernLorebookDraft[];
  createdAt: number;
  updatedAt: number;
};

export type TavernRoomSettings = {
  immersiveDescriptionEnabled: boolean;
  showExecutionTrace: boolean;
  autoAssetExtractionEnabled: boolean;
  assetExtractionIntervalTurns: number;
  maxAssetDrafts: number;
  directorMaxSpeakers: number;
  agentKnowledgeCompactIntervalTurns: number;
  continuation: {
    enabled: boolean;
    maxAutoContinuationRounds: number;
    maxSpeakersPerContinuation: number;
    stopWhenUserTargeted: boolean;
  };
  replyOptions: {
    enabled: boolean;
    count: number;
  };
  statusTracking: {
    enabled: boolean;
    visibleToUser: boolean;
  };
  randomEvents: {
    enabled: boolean;
    probability: number;
  };
  illustrationHints: {
    enabled: boolean;
  };
};

export type TavernSceneStatus = {
  location?: string;
  timeLabel?: string;
  weather?: string;
  atmosphere?: string;
  scenePhase?: string;
  immediateThreat?: string;
  updatedAt: number;
};

export type TavernCharacterPublicStatus = {
  characterId: string;
  location?: string;
  posture?: string;
  visibleMood?: string;
  outfit?: string;
  visibleInjury?: string;
  holding?: string[];
  publicGoal?: string;
  updatedAt: number;
};

export type TavernCharacterPrivateStatus = {
  characterId: string;
  privateMood?: string;
  suspicion?: string;
  hiddenGoal?: string;
  privateKnowledge?: string[];
  relationshipNotes?: Record<string, string>;
  updatedAt: number;
};

export type TavernPendingInteraction = {
  id: string;
  sourceMessageId: string;
  source: {
    type: "user" | "character";
    characterId?: string;
  };
  target: {
    type: "user" | "character" | "group" | "unknown";
    characterIds?: string[];
  };
  kind: "question" | "request" | "challenge" | "invitation" | "answer";
  text: string;
  requiresResponse: boolean;
  status: "open" | "answered" | "expired";
  createdTurnId: string;
};

export type TavernReplyOption = {
  id: string;
  text: string;
  respondsToInteractionId?: string;
  targetCharacterIds: string[];
  intent: "answer" | "ask" | "act" | "interrupt" | "wait" | "inspect";
};

export type TavernTimelineScope = {
  mode: "auto" | "range" | "selected";
  startEventId?: string;
  endEventId?: string;
  eventIds?: string[];
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
  timelineScope: TavernTimelineScope;
  memory: string;
  sceneStatus?: TavernSceneStatus;
  characterPublicStatuses: Record<string, TavernCharacterPublicStatus>;
  characterPrivateStatuses: Record<string, TavernCharacterPrivateStatus>;
  pendingInteractions: TavernPendingInteraction[];
  replyOptions: TavernReplyOption[];
  characterConfigs?: Record<string, TavernRoomCharacterConfig>;
  characterMemories: Record<string, string>;
  assetDrafts: TavernAssetDraft[];
  characterIds: string[];
  activeCharacterId: string;
  createdAt: number;
  updatedAt: number;
};

export type TavernRoom = {
  id: string;
  workspaceId: string;
  systemPresetId?: string;
  systemPresetVersion?: number;
  locked: boolean;
  title: string;
  storyOutline: string;
  storyGoal: string;
  activeSceneId?: string;
  scenes?: TavernScene[];
  scenePresetId: VisualPresetId;
  scene: string;
  sceneGoal: string;
  scenePlot: string;
  sceneDirection: string;
  sceneTransition: string;
  memory: string;
  sceneStatus?: TavernSceneStatus;
  characterPublicStatuses: Record<string, TavernCharacterPublicStatus>;
  characterPrivateStatuses: Record<string, TavernCharacterPrivateStatus>;
  pendingInteractions: TavernPendingInteraction[];
  replyOptions: TavernReplyOption[];
  characterConfigs?: Record<string, TavernRoomCharacterConfig>;
  characterMemories: Record<string, string>;
  localCharacters?: TavernCharacter[];
  lorebookEntries: TavernLorebookEntry[];
  timelineEvents: TavernTimelineEvent[];
  assetDrafts: TavernAssetDraft[];
  characterIds: string[];
  activeCharacterId: string;
  replyMode: TavernReplyMode;
  userPersonaName: string;
  settings: TavernRoomSettings;
  createdAt: number;
  updatedAt: number;
};

export type TavernMessage = {
  id: string;
  roomId: string;
  sceneId?: string;
  turnId?: string;
  role: "user" | "character" | "narrator";
  characterId?: string;
  content: string;
  thought?: string;
  targetCharacterIds?: string[];
  respondsToInteractionIds?: string[];
  generatedInteractionIds?: string[];
  createdAt: number;
  status?: "streaming" | "done" | "error";
  referencedFiles?: Array<{ path: string }>;
};

export type TavernState = {
  version: 2;
  activeRoomId: string;
  rooms: TavernRoom[];
  messagesByScene: Record<string, TavernMessage[]>;
};

export type TavernReferencedFile = {
  path: string;
  content: string;
};
