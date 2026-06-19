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

export type TavernEntityRef =
  | { type: "user"; userId: "user" }
  | { type: "character"; characterId: string }
  | { type: "team"; teamId: string }
  | { type: "faction"; factionId: string }
  | { type: "party"; partyId: string }
  | { type: "scene"; sceneId: string }
  | { type: "global" };

export type TavernStatusScope = "global" | "scene" | "party" | "character" | "relationship";
export type TavernStatusValueType = "number" | "text" | "enum" | "boolean" | "tags";
export type TavernStatusValue = number | string | boolean | string[] | null;
export type TavernProgressVisibility = "public" | "owner" | "team" | "private" | "director" | "hidden" | "debug";
export type TavernEventIntensity = "trivial" | "minor" | "moderate" | "major" | "critical";

export type TavernStatusTargetRef =
  | { type: "global" }
  | { type: "scene"; sceneId?: string }
  | { type: "party"; partyId: string }
  | { type: "character"; characterId: string }
  | {
      type: "relationship";
      subject: TavernEntityRef;
      object: TavernEntityRef;
    };

export type TavernStatusDefinition = {
  id: string;
  label: string;
  description?: string;
  scope: TavernStatusScope;
  valueType: TavernStatusValueType;
  defaultValue: TavernStatusValue;
  visibility: TavernProgressVisibility;
  min?: number;
  max?: number;
  enumOptions?: Array<{ value: string; label: string }>;
  relationship?: {
    directed: boolean;
    allowedSubjectTypes?: TavernEntityRef["type"][];
    allowedObjectTypes?: TavernEntityRef["type"][];
  };
  updatePolicy: {
    mode: "manualOnly" | "eventDriven" | "eventDrivenWithReview" | "llmSuggestedWithReview";
    requireFactEvent: boolean;
    allowedEventTypes?: string[];
    maxDeltaPerTurn?: number;
    confidenceThreshold?: number;
    manualReviewAboveDelta?: number;
  };
};

export type TavernFactEvent = {
  id: string;
  turnId: string;
  sourceMessageIds: string[];
  type: string;
  actor?: TavernEntityRef;
  target?: TavernEntityRef;
  intensity?: TavernEventIntensity;
  value?: number;
  evidence: string;
  confidence: number;
  createdAt: number;
};

export type TavernStatusRule = {
  id: string;
  label: string;
  when: {
    eventType: string;
    targetScope: TavernStatusScope;
  };
  apply: {
    statusId: string;
    target?: "eventTarget" | "eventActor" | "relationshipActorToTarget" | "relationshipTargetToActor";
    op: "add" | "set";
    value?: TavernStatusValue;
    valueByIntensity?: Partial<Record<TavernEventIntensity, number>>;
    clamp?: [number, number];
  };
  safeguards?: {
    maxDeltaPerTurn?: number;
    cooldownTurns?: number;
    requireExplicitEvidence?: boolean;
    manualReviewAboveDelta?: number;
  };
};

export type TavernStatusEvent = {
  id: string;
  turnId: string;
  sourceFactEventIds: string[];
  sourceMessageIds: string[];
  target: TavernStatusTargetRef;
  statusId: string;
  before: TavernStatusValue;
  after: TavernStatusValue;
  delta?: number;
  reason: string;
  confidence: number;
  visibility: TavernProgressVisibility;
  ruleId?: string;
  status: "applied" | "pending" | "rejected";
  createdBy: "status_tracker" | "rule_engine" | "manual" | "system";
  createdAt: number;
};

export type TavernStatusSnapshot = {
  turnId: string;
  global: Record<string, TavernStatusValue>;
  scene: Record<string, TavernStatusValue>;
  parties: Record<string, Record<string, TavernStatusValue>>;
  characters: Record<string, Record<string, TavernStatusValue>>;
  relationships: Record<string, Record<string, TavernStatusValue>>;
  updatedAt: number;
};

export type TavernCondition =
  | { all: TavernCondition[] }
  | { any: TavernCondition[] }
  | { not: TavernCondition }
  | {
      status: string;
      target: TavernStatusTargetRef;
      gte?: number;
      lte?: number;
      equals?: TavernStatusValue;
      notEquals?: TavernStatusValue;
      crossing?: "up" | "down";
    }
  | {
      factEvent: string;
      actor?: TavernEntityRef;
      target?: TavernEntityRef;
      countGte?: number;
      withinTurns?: number;
    }
  | {
      task: string;
      owner?: TavernEntityRef;
      status: "inactive" | "active" | "completed" | "failed";
    }
  | {
      flag: string;
      equals: TavernStatusValue;
    };

export type TavernProgressAction =
  | { type: "statusPatch"; statusEvents: TavernStatusEvent[] }
  | { type: "directorDirective"; instruction: string }
  | { type: "replyOptions"; options: TavernReplyOption[] }
  | { type: "sceneTransitionSuggestion"; targetSceneId: string; requiresUserConfirm: boolean }
  | { type: "messageInline"; visibility: TavernProgressVisibility; text: string };

export type TavernTaskDefinition = {
  id: string;
  title: string;
  description?: string;
  scope: "personal" | "team" | "party" | "scene" | "global";
  owner: TavernEntityRef;
  participants?: TavernEntityRef[];
  visibility: TavernProgressVisibility;
  required: boolean;
  optional: boolean;
  repeatable: boolean;
  lifecycle: {
    initialStatus: "inactive" | "active";
    startCondition?: TavernCondition;
    completeCondition: TavernCondition;
    failCondition?: TavernCondition;
  };
  progress?: {
    mode: "boolean" | "count" | "meter" | "checklist";
    target?: number;
  };
  onComplete?: TavernProgressAction[];
  onFail?: TavernProgressAction[];
};

export type TavernTaskState = {
  taskId: string;
  owner: TavernEntityRef;
  status: "inactive" | "active" | "completed" | "failed";
  progress?: {
    current: number;
    target: number;
  };
  updatedTurnId?: string;
  updatedAt: number;
};

export type TavernTaskEvent = {
  id: string;
  turnId: string;
  taskId: string;
  owner: TavernEntityRef;
  type: "activated" | "progressed" | "completed" | "failed" | "reset";
  before?: TavernTaskState;
  after: TavernTaskState;
  sourceFactEventIds: string[];
  sourceStatusEventIds: string[];
  reason: string;
  createdAt: number;
};

export type TavernSceneOutcomeDefinition = {
  id: string;
  label: string;
  winner?: TavernEntityRef[];
  loser?: TavernEntityRef[];
  condition: TavernCondition;
  priority: number;
  exclusive: boolean;
  endScene: "none" | "suggest" | "auto";
  visibility: TavernProgressVisibility;
  onAchieved?: TavernProgressAction[];
};

export type TavernOutcomeEvent = {
  id: string;
  turnId: string;
  outcomeId: string;
  winners: TavernEntityRef[];
  losers: TavernEntityRef[];
  sourceTaskEventIds: string[];
  sourceStatusEventIds: string[];
  status: "pending" | "applied" | "dismissed";
  createdAt: number;
};

export type TavernProgressCheckpoint = {
  id: string;
  turnId: string;
  statusSnapshot: TavernStatusSnapshot;
  taskSnapshot: Record<string, TavernTaskState>;
  includedFactEventIds: string[];
  includedStatusEventIds: string[];
  includedTaskEventIds: string[];
  includedOutcomeEventIds: string[];
  reason: "initial" | "after_turn" | "before_context_trim" | "manual" | "compaction" | "rebuild";
  createdAt: number;
};

export type TavernProgressView = {
  id: string;
  label: string;
  kind: "status" | "task" | "outcome" | "mixed";
  placement: "globalHeader" | "sceneHeader" | "sidePanel" | "characterCard" | "composerBelow" | "messageInline";
  ownerBinding:
    | "global"
    | "scene"
    | "party"
    | "allCharacters"
    | "activeCharacter"
    | "activeCharacterOutgoing"
    | "activeCharacterToUser"
    | "allCharacterPairs"
    | "team"
    | "currentUser";
  layout: "compact" | "list" | "grid" | "bars" | "matrix" | "questLog";
  compareWith?: "none" | "previousTurn" | "lastChanged";
  items: Array<
    | {
        type: "status";
        statusId: string;
        display: "bar" | "meter" | "badge" | "tags" | "text" | "number" | "enum" | "switch";
        showDelta?: boolean;
        hiddenWhenDefault?: boolean;
        thresholds?: Array<{
          lte?: number;
          gte?: number;
          tone: "normal" | "info" | "success" | "warning" | "danger";
        }>;
      }
    | {
        type: "task";
        taskId: string;
        display: "checkbox" | "progress" | "badge" | "detail";
      }
    | {
        type: "outcome";
        outcomeId: string;
        display: "badge" | "banner";
      }
  >;
};

export type TavernProgressTrackerSettings = {
  enabled: boolean;
  mode: "manual" | "afterTurn" | "fixedTurns";
  intervalTurns: number;
  applyMode: "auto" | "review";
  factConfidenceThreshold: number;
  generateCheckpointBeforeContextTrim: boolean;
};

export type TavernIllustrationHint = {
  id: string;
  turnId?: string;
  source: "director";
  prompt: string;
  sourceMessageIds: string[];
  createdAt: number;
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
  factEvents: TavernFactEvent[];
  statusEvents: TavernStatusEvent[];
  statusSnapshot: TavernStatusSnapshot;
  previousStatusSnapshot?: TavernStatusSnapshot;
  statusCheckpoints: TavernProgressCheckpoint[];
  taskDefinitions: TavernTaskDefinition[];
  taskEvents: TavernTaskEvent[];
  taskSnapshot: Record<string, TavernTaskState>;
  sceneOutcomes: TavernSceneOutcomeDefinition[];
  outcomeEvents: TavernOutcomeEvent[];
  characterConfigs?: Record<string, TavernRoomCharacterConfig>;
  characterMemories: Record<string, string>;
  illustrationHints: TavernIllustrationHint[];
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
  statusDefinitions: TavernStatusDefinition[];
  statusRules: TavernStatusRule[];
  progressViews: TavernProgressView[];
  progressTracker: TavernProgressTrackerSettings;
  factEvents: TavernFactEvent[];
  statusEvents: TavernStatusEvent[];
  statusSnapshot: TavernStatusSnapshot;
  previousStatusSnapshot?: TavernStatusSnapshot;
  statusCheckpoints: TavernProgressCheckpoint[];
  taskDefinitions: TavernTaskDefinition[];
  taskEvents: TavernTaskEvent[];
  taskSnapshot: Record<string, TavernTaskState>;
  sceneOutcomes: TavernSceneOutcomeDefinition[];
  outcomeEvents: TavernOutcomeEvent[];
  characterConfigs?: Record<string, TavernRoomCharacterConfig>;
  characterMemories: Record<string, string>;
  localCharacters?: TavernCharacter[];
  lorebookEntries: TavernLorebookEntry[];
  timelineEvents: TavernTimelineEvent[];
  illustrationHints: TavernIllustrationHint[];
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
