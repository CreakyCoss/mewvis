import type { VisualPresetId } from "@/features/pages/tavern/visual-presets";

export type TavernReplyMode = "active" | "round" | "director";

export type TavernPresentationProfileId =
  | "dialogue-chat"
  | "third-person-prose"
  | "novel-prose";

export type TavernPresentationRenderStyle = "chat" | "prose";

export type TavernPresentationPerspective =
  | "dialogue"
  | "third_person_limited"
  | "third_person_omniscient";

export type TavernPresentationDialoguePolicy = "direct" | "indirect" | "mixed";

export type TavernPresentationUserInputMode = "speech" | "intent" | "story_directive";

export type TavernPresentationGenerationContract =
  | "character_reply_xml"
  | "character_narrative_beat";

export type TavernPresentationProfile = {
  id: TavernPresentationProfileId;
  label: string;
  description: string;
  perspective: TavernPresentationPerspective;
  dialoguePolicy: TavernPresentationDialoguePolicy;
  userInputMode: TavernPresentationUserInputMode;
  renderStyle: TavernPresentationRenderStyle;
  generationContract: TavernPresentationGenerationContract;
  bridgeSystemAddendum: string;
  directorAddendum: string;
  characterAddendum: string;
  composerPlaceholder: string;
};

export type TavernPresentationSettings = {
  profileId: TavernPresentationProfileId;
  profileVersion: 1;
  lockedAt?: number;
  lockedSceneId?: string;
};

export type TavernMessageActorRef =
  | { type: "user" }
  | { type: "character"; characterId: string }
  | { type: "narrator" };

export type TavernMessageSegment =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "dialogue";
      text: string;
      speaker: TavernMessageActorRef;
    }
  | {
      type: "action";
      text: string;
      actor?: TavernMessageActorRef;
    }
  | {
      type: "thought";
      text: string;
      owner: TavernMessageActorRef;
      visibility: "private" | "public";
    }
  | {
      type: "narration";
      text: string;
      actor?: TavernMessageActorRef;
    };

export type TavernMessageKind =
  | "user_input"
  | "character_reply"
  | "narration"
  | "narrative_beat";

export type TavernPromptStyleId =
  | "silent-law"
  | "novel"
  | "wuxia"
  | "light-novel"
  | "dramatic"
  | "grounded";

export type TavernPromptStylePreset = {
  id: TavernPromptStyleId;
  label: string;
  description: string;
  bridgeSystemAddendum: string;
  directorAddendum: string;
  characterAddendum: string;
};

export type TavernRoomCharacterConfig = {
  characterId: string;
  memory?: string;
};

export type TavernRelationshipTarget =
  | { type: "user" }
  | { type: "character"; characterId: string };

export type TavernCharacterRelationship = {
  id: string;
  target: TavernRelationshipTarget;
  label?: string;
  attitude?: string;
  publicNote?: string;
  privateNote?: string;
  tags: string[];
  updatedAt: number;
};

export type TavernSceneRelationshipOverride = {
  id: string;
  subjectCharacterId: string;
  target: TavernRelationshipTarget;
  label?: string;
  publicNote?: string;
  privateNote?: string;
  tags: string[];
  updatedAt: number;
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
  writingStyle?: string;
  replyStylePrompt?: string;
  goals?: string;
  relationships: TavernCharacterRelationship[];
  createdAt: number;
  updatedAt: number;
};

export type TavernDirectorSpeechBias = "very_low" | "low" | "balanced" | "high" | "very_high";

export type TavernDirectorReplyModePreference = "speech" | "nonverbal" | "ambient";

export type TavernDirectorCharacterProfile = {
  characterId: string;
  temperament?: string;
  speechBias: TavernDirectorSpeechBias;
  nonverbalBias?: TavernDirectorSpeechBias;
  interestTags: string[];
  goalTags: string[];
  knowledgeTags: string[];
  conflictStyle?: string;
  socialStrategy?: string;
  speechTriggers: string[];
  silenceTriggers: string[];
  notes?: string;
};

export type TavernDirectorProfile = {
  version: 1;
  source: "system" | "preset" | "generated" | "manual";
  globalGoals: string[];
  globalRules: string[];
  characterProfiles: Record<string, TavernDirectorCharacterProfile>;
  updatedAt?: number;
};

export type TavernSchedulingSignal = {
  characterId: string;
  score: number;
  reasons: string[];
  suggestedModes: TavernDirectorReplyModePreference[];
  matchedRuleIds: string[];
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
  directorScheduling: {
    targetedReplyPolicy: "director" | "prefer" | "include" | "exclusive";
    maxExtraSpeakersOnTargetedReply: number;
    allowDirectorOnly: boolean;
    directorOnlyPhaseStatusId?: string;
    directorOnlyPhaseValues: string[];
    speakerMotivation: {
      enabled: boolean;
      maxMotivatedSpeakers: number;
      rules: Array<{
        id: string;
        label: string;
        when: string;
        priority: number;
        instruction: string;
      }>;
    };
    profile?: TavernDirectorProfile;
    fixedOrder: {
      enabled: boolean;
      phaseStatusId?: string;
      phaseValues: string[];
      stopAfterRound: boolean;
      includeUser: boolean;
      userPosition: "first" | "last";
    };
    autoContinuation: "enabled" | "disabled" | "disabledForFixedOrder";
    instruction: string;
  };
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
  informationPolicy: TavernInformationPolicy;
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
export type TavernInformationPolicyMode = "open" | "mystery" | "social_deduction" | "custom";
export type TavernInformationRevealMode = "manual" | "sceneOutcome" | "never";

export type TavernRoleAssignmentDefinition = {
  id: string;
  label: string;
  description?: string;
  factionId?: string;
  factionLabel?: string;
  count: number;
};

export type TavernInformationPolicy = {
  mode: TavernInformationPolicyMode;
  uiDefaultView: "public" | "reveal" | "director";
  hideCharacterThoughts: boolean;
  revealThoughts: TavernInformationRevealMode;
  hiddenFacts: {
    enabled: boolean;
    defaultVisibility: Extract<TavernProgressVisibility, "director" | "hidden" | "debug">;
    reveal: TavernInformationRevealMode;
  };
  roleAssignment: {
    enabled: boolean;
    strategy: "manual" | "director_random";
    includeUser: boolean;
    revealToAssignedCharacter: boolean;
    revealFactionMembers: boolean;
    rolePool: TavernRoleAssignmentDefinition[];
    opening: {
      autoStart: boolean;
      publicEventType: string;
      publicEventValue?: TavernStatusValue;
      globalStatusPatches: Array<{
        statusId: string;
        value: TavernStatusValue;
      }>;
    };
  };
};

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
  value?: TavernStatusValue;
  evidence: string;
  confidence: number;
  visibility?: TavernProgressVisibility;
  revealWhen?: TavernInformationRevealMode;
  visibleToUser?: boolean;
  visibleToCharacterIds?: string[];
  visibleToFactionIds?: string[];
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
    | "allCharactersToUser"
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
  relationshipOverrides: TavernSceneRelationshipOverride[];
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
  presentation: TavernPresentationSettings;
  promptStyleId?: TavernPromptStyleId;
  creationSource?: "manual" | "quick" | "imported" | "agent_generated";
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
  relationshipOverrides: TavernSceneRelationshipOverride[];
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
  kind?: TavernMessageKind;
  role: "user" | "character" | "narrator";
  characterId?: string;
  presentationProfileId?: TavernPresentationProfileId;
  content: string;
  segments?: TavernMessageSegment[];
  thought?: string;
  targetCharacterIds?: string[];
  respondsToInteractionIds?: string[];
  generatedInteractionIds?: string[];
  createdAt: number;
  status?: "streaming" | "done" | "error";
  referencedFiles?: Array<{ path: string }>;
};

export type TavernGeneratedPresetCharacter = {
  id?: string;
  name?: string;
  avatar?: string;
  description?: string;
  speakingStyle?: string;
  writingStyle?: string;
  replyStylePrompt?: string;
  goals?: string;
  relationships?: TavernCharacterRelationship[];
  memory?: string;
  publicStatus?: Partial<TavernCharacterPublicStatus>;
  privateStatus?: Partial<TavernCharacterPrivateStatus>;
};

export type TavernGeneratedPresetScene = {
  title?: string;
  order?: number;
  scenePresetId?: unknown;
  scene?: string;
  sceneGoal?: string;
  plot?: string;
  storyDirection?: string;
  transition?: string;
  memory?: string;
  relationshipOverrides?: TavernSceneRelationshipOverride[];
  sceneStatus?: Partial<TavernSceneStatus>;
  characterPublicStatuses?: Record<string, Partial<TavernCharacterPublicStatus>>;
  characterPrivateStatuses?: Record<string, Partial<TavernCharacterPrivateStatus>>;
  statusSnapshot?: Partial<TavernStatusSnapshot>;
  factEvents?: Array<Partial<TavernFactEvent> & {
    type: string;
    evidence: string;
  }>;
  taskDefinitions?: TavernTaskDefinition[];
  sceneOutcomes?: TavernSceneOutcomeDefinition[];
  characterMemories?: Record<string, string>;
  lorebookEntries?: Array<{
    title: string;
    content: string;
    keywords?: string[];
    enabled?: boolean;
    alwaysOn?: boolean;
  }>;
  timelineEvents?: Array<{
    title: string;
    summary: string;
  }>;
  characterIds?: string[];
  activeCharacterId?: string;
};

export type TavernGeneratedPresetRoom = {
  title?: string;
  presentation?: Partial<TavernPresentationSettings> & {
    profileId?: unknown;
  };
  presentationProfileId?: unknown;
  promptStyleId?: unknown;
  storyOutline?: string;
  storyGoal?: string;
  scenePresetId?: unknown;
  scene?: string;
  sceneGoal?: string;
  plot?: string;
  storyDirection?: string;
  transition?: string;
  memory?: string;
  relationshipOverrides?: TavernSceneRelationshipOverride[];
  sceneStatus?: Partial<TavernSceneStatus>;
  characterPublicStatuses?: Record<string, Partial<TavernCharacterPublicStatus>>;
  characterPrivateStatuses?: Record<string, Partial<TavernCharacterPrivateStatus>>;
  statusDefinitions?: TavernStatusDefinition[];
  statusRules?: TavernStatusRule[];
  progressViews?: TavernProgressView[];
  progressTracker?: Partial<TavernProgressTrackerSettings>;
  statusSnapshot?: Partial<TavernStatusSnapshot>;
  factEvents?: Array<Partial<TavernFactEvent> & {
    type: string;
    evidence: string;
  }>;
  taskDefinitions?: TavernTaskDefinition[];
  sceneOutcomes?: TavernSceneOutcomeDefinition[];
  scenes?: TavernGeneratedPresetScene[];
  characterMemories?: Record<string, string>;
  lorebookEntries?: Array<{
    title: string;
    content: string;
    keywords?: string[];
    enabled?: boolean;
    alwaysOn?: boolean;
  }>;
  timelineEvents?: Array<{
    title: string;
    summary: string;
  }>;
  characterIds?: string[];
  activeCharacterId?: string;
  replyMode?: TavernReplyMode;
  userPersonaName?: string;
  settings?: Partial<TavernRoomSettings>;
};

export type TavernGeneratedPresetJson = {
  version?: 1;
  label?: string;
  description?: string;
  room?: TavernGeneratedPresetRoom;
  characters?: TavernGeneratedPresetCharacter[];
  messages?: Array<{
    role: TavernMessage["role"];
    characterId?: string;
    content: string;
  }>;
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
