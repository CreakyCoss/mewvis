import type { CSSProperties, FormEvent, KeyboardEvent } from "react";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Clapperboard, Download, RefreshCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  getActiveReferenceToken,
  loadContextResources,
  quoteReferencePath,
  resolveFileReferenceMatches,
  summarizeReferenceMatches,
} from "@/features/ai/components/context-tools";
import { tavernAvatarOptions } from "@/assets/agent-avatars";
import {
  requireRuntimeModelInput,
  type RuntimeModelOption,
} from "@/features/pages/settings/llm/store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MarkdownContent } from "@/features/ai/components/markdown";
import {
  readWorkspaceFile,
  type WorkspaceFileEntry,
} from "@/features/pages/workspace/files-api";
import { getVisualPreset, normalizeVisualPresetId } from "@/features/pages/tavern/visual-presets";
import type { Workspace } from "@/features/pages/workspace/types";
import { cn } from "@/lib/utils";
import { normalizeTavernPromptStyleId } from "../prompt-styles";
import {
  createTavernAssetDraft,
  createDefaultTavernState,
  createTavernIllustrationHint,
  createTavernLorebookEntry,
  createTavernMessage,
  createTavernRoomFromGeneratedPresetJson,
  createTavernRoomFromSystemPreset,
  createTavernRoom,
  createTavernScene,
  createTavernTimelineEvent,
  DEFAULT_TAVERN_PROGRESS_TRACKER,
  DEFAULT_TAVERN_PROGRESS_VIEWS,
  DEFAULT_TAVERN_ROOM_SETTINGS,
  DEFAULT_TAVERN_STATUS_DEFINITIONS,
  DEFAULT_TAVERN_STATUS_RULES,
  getTavernSystemPreset,
  loadTavernState,
  projectTavernSceneOntoRoom,
  saveTavernState,
  switchTavernRoomScene,
  syncTavernRoomActiveScene,
} from "../storage";
import {
  advanceTavernProgressFromFactEvents,
  canTavernCharacterUseNonverbalReply,
  createTavernProgressCheckpoint,
  createTavernRenderableMessages,
  extractTavernPendingInteractionsFromMessages,
  isTavernFixedOrderPhase,
  isTavernCharacterAvailableForSpeech,
  orderTavernRoundSpeakers,
  planTavernContinuation,
  rebuildTavernProgressFromHistory,
  resolveTavernScheduledSpeakers,
  resolveTavernPendingOutcomeEvent,
  resolveTavernPendingStatusEvent,
  shouldSuppressTavernAutoContinuation,
  tavernCharacterAgentRoleId,
} from "../core";
import {
  compactTavernAgentKnowledge,
} from "../runtime/bridge-session";
import type {
  TavernAssetDraft,
  TavernCharacter,
  TavernCondition,
  TavernEntityRef,
  TavernFactEvent,
  TavernMessage,
  TavernOutcomeEvent,
  TavernReferencedFile,
  TavernReplyOption,
  TavernRoom,
  TavernScene,
  TavernSceneOutcomeDefinition,
  TavernRoomSettings,
  TavernStatusEvent,
  TavernStatusTargetRef,
  TavernState,
  TavernTaskDefinition,
  TavernTaskEvent,
  TavernTaskState,
} from "../types";
import { runTavernInnerThought, runTavernReply } from "../runtime/tavern-runner";
import { runTavernDirector } from "../runtime/director";
import { runTavernAssetExtraction } from "../runtime/asset-extractor";
import { resolveTavernCharacterModel } from "../runtime/model-selection";
import {
  hasTavernReplyDialogueText,
  parseTavernReplyText,
} from "../runtime/reply-cleanup";
import { buildTavernCharacterTurnInstruction } from "../runtime/turn-instruction";
import { runTavernQuickNovel, runTavernQuickSummary } from "../runtime/quick-summary";
import {
  runTavernManagedUserReply,
  runTavernUserReplySuggestions,
} from "../runtime/user-reply-suggestions";
import { runTavernProgressTracking } from "../runtime/progress-tracker";
import {
  runTavernGeneratedPresetAgent,
  type TavernGeneratedPresetAgentDraft,
} from "../runtime/generated-preset-agent";
import {
  runTavernTextFieldAgent,
  type TavernTextFieldAgentRequest,
} from "../runtime/field-polish-agent";
import { parseTavernExternalImportJson } from "../import-formats";
import { uniqueFilesByPath } from "../utils";
import { TavernComposer } from "./tavern-composer";
import {
  TavernExecutionTrace,
  type TavernExecutionStep,
} from "./tavern-execution-trace";
import { TavernHeader } from "./tavern-header";
import { TavernManagementPage } from "./tavern-management-page";
import { TavernMessageRow } from "./tavern-message-row";
import { TavernProgressPanel } from "./tavern-progress-panel";
import { TavernSidePanel } from "./tavern-side-panel";

const REFERENCE_SUGGESTION_LIMIT = 8;
const TAVERN_ILLUSTRATION_HINT_LIMIT = 24;
const TAVERN_ROOM_EXPORT_SCHEMA = "novel-claw.tavern-room";
const TAVERN_RUNTIME_MODEL_UNAVAILABLE = "当前模型配置已不可用，请重新选择模型。";

const requireTavernRuntimeModelInput = (runtimeModel: RuntimeModelOption) =>
  requireRuntimeModelInput(runtimeModel, TAVERN_RUNTIME_MODEL_UNAVAILABLE);

const normalizeNarratorEchoText = (text: string) =>
  text
    .toLowerCase()
    .replace(/[\s*_`~"'“”‘’「」『』《》【】（）()[\]{}<>.,，。!?！？;；:：、—\-]/g, "");

const isNarratorEchoReply = (replyText: string, narratorTexts: string[]) => {
  const normalizedReply = normalizeNarratorEchoText(replyText);

  return normalizedReply.length > 0 && narratorTexts.some((narratorText) =>
    normalizeNarratorEchoText(narratorText) === normalizedReply
  );
};

type TavernPageProps = {
  workspace: Workspace;
  files: WorkspaceFileEntry[];
  runtimeModel: RuntimeModelOption | null;
  runtimeAgentId: string;
  onRoomImmersiveChange?: (isImmersive: boolean) => void;
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "未知错误";
};

const touchTavernRoomActiveScene = (room: TavernRoom): TavernRoom => ({
  ...syncTavernRoomActiveScene({
    ...room,
    updatedAt: Date.now(),
  }),
});

const hasAssetDraftItems = (draft: TavernAssetDraft) =>
  draft.timelineEvents.some((event) => event.title.trim() && event.summary.trim()) ||
  draft.characterMemories.some((memory) => memory.characterId.trim() && memory.note.trim()) ||
  draft.lorebookEntries.some((entry) => entry.title.trim() && entry.content.trim());

const confirmDangerousAction = (message: string, secondMessage: string) =>
  window.confirm(message) && window.confirm(secondMessage);

type TavernRoomExportV2 = {
  schema: typeof TAVERN_ROOM_EXPORT_SCHEMA;
  version: 2;
  exportedAt: string;
  room: TavernRoom;
  characters: TavernCharacter[];
  messages: TavernMessage[];
  messagesByScene: Record<string, TavernMessage[]>;
};

type QuickSummaryCache = {
  sceneId: string;
  signature: string;
  content: string;
  generatedAt: number;
  novelContent?: string;
  novelGeneratedAt?: number;
  novelSignature?: string;
};

type QuickSummaryCacheState = {
  workspaceId: string;
  entries: Record<string, QuickSummaryCache>;
};

type QuickNovelExportFormat = "txt" | "md";

const QUICK_SUMMARY_CACHE_STORAGE_PREFIX = "novel-claw:tavern:quick-summary";

const quickSummaryCacheStorageKey = (workspaceId: string) =>
  `${QUICK_SUMMARY_CACHE_STORAGE_PREFIX}:${workspaceId}`;

const normalizeQuickSummaryCacheItem = (value: unknown): QuickSummaryCache | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<QuickSummaryCache>;
  if (
    typeof candidate.sceneId !== "string" ||
    typeof candidate.signature !== "string" ||
    typeof candidate.generatedAt !== "number"
  ) {
    return null;
  }

  return {
    sceneId: candidate.sceneId,
    signature: candidate.signature,
    content: typeof candidate.content === "string" ? candidate.content : "",
    generatedAt: candidate.generatedAt,
    novelContent: typeof candidate.novelContent === "string" ? candidate.novelContent : undefined,
    novelGeneratedAt: typeof candidate.novelGeneratedAt === "number" ? candidate.novelGeneratedAt : undefined,
    novelSignature: typeof candidate.novelSignature === "string" ? candidate.novelSignature : undefined,
  };
};

const loadQuickSummaryCache = (workspaceId: string): Record<string, QuickSummaryCache> => {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(quickSummaryCacheStorageKey(workspaceId));
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).flatMap(([sceneId, value]) => {
        const item = normalizeQuickSummaryCacheItem(value);
        return item ? [[sceneId, item]] : [];
      }),
    );
  } catch {
    return {};
  }
};

const saveQuickSummaryCache = (
  workspaceId: string,
  cache: Record<string, QuickSummaryCache>,
) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      quickSummaryCacheStorageKey(workspaceId),
      JSON.stringify(cache),
    );
  } catch {
    // Ignore quota and private-mode storage failures; the in-memory cache still works.
  }
};

const createLocalId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

const getRoomActiveSceneId = (room: TavernRoom) =>
  room.activeSceneId ?? room.scenes?.[0]?.id ?? room.id;

const getSceneMessages = (
  room: TavernRoom,
  state: Pick<TavernState, "messagesByScene">,
) => {
  const sceneId = getRoomActiveSceneId(room);
  return state.messagesByScene[sceneId] ?? [];
};

const createMessagesByRoomIndex = (
  rooms: TavernRoom[],
  messagesByScene: Record<string, TavernMessage[]>,
) => Object.fromEntries(
  rooms.map((room) => [
    room.id,
    messagesByScene[getRoomActiveSceneId(room)] ?? [],
  ]),
);

const sanitizeFileName = (value: string) =>
  value.trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").slice(0, 80) || "tavern-room";

const createQuickNovelExportContent = ({
  format,
  roomTitle,
  sceneTitle,
  generatedAt,
  content,
}: {
  format: QuickNovelExportFormat;
  roomTitle: string;
  sceneTitle: string;
  generatedAt: number | undefined;
  content: string;
}) => {
  const trimmedContent = content.trim();
  if (format === "txt") {
    return `${trimmedContent}\n`;
  }

  const generatedAtText = generatedAt
    ? new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(generatedAt)
    : "";
  const metadataLines = [
    sceneTitle ? `场景：${sceneTitle}` : "",
    generatedAtText ? `生成时间：${generatedAtText}` : "",
  ].filter(Boolean);

  return [
    `# ${roomTitle}`,
    "",
    ...metadataLines,
    "",
    "---",
    "",
    trimmedContent,
    "",
  ].join("\n");
};

const createQuickSummarySignature = (
  room: TavernRoom,
  messages: TavernMessage[],
) => JSON.stringify({
  roomId: room.id,
  activeSceneId: room.activeSceneId ?? "",
  updatedAt: room.updatedAt,
  title: room.title,
  storyOutline: room.storyOutline,
  storyGoal: room.storyGoal,
  scene: room.scene,
  sceneGoal: room.sceneGoal,
  scenePlot: room.scenePlot,
  sceneDirection: room.sceneDirection,
  sceneTransition: room.sceneTransition,
  timelineScope: room.scenes?.find((scene) => scene.id === room.activeSceneId)?.timelineScope ?? { mode: "auto" },
  memory: room.memory,
  characterIds: room.characterIds,
  activeCharacterId: room.activeCharacterId,
  replyMode: room.replyMode,
  characterMemories: room.characterMemories,
  lorebookEntries: room.lorebookEntries.map((entry) => ({
    id: entry.id,
    title: entry.title,
    content: entry.content,
    keywords: entry.keywords,
    enabled: entry.enabled,
    alwaysOn: entry.alwaysOn,
    updatedAt: entry.updatedAt,
  })),
  timelineEvents: room.timelineEvents.map((event) => ({
    id: event.id,
    title: event.title,
    summary: event.summary,
    updatedAt: event.updatedAt,
  })),
  messages: messages.map((message) => ({
    id: message.id,
    role: message.role,
    characterId: message.characterId ?? "",
    content: message.content,
    status: message.status ?? "",
    referencedFiles: message.referencedFiles ?? [],
  })),
});

const clampInteger = (value: unknown, fallback: number, min: number, max: number) => {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(numberValue)));
};

const normalizeImportedRoomSettings = (value: unknown): TavernRoomSettings => {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_TAVERN_ROOM_SETTINGS };
  }

  const candidate = value as Partial<TavernRoomSettings>;
  return {
    ...DEFAULT_TAVERN_ROOM_SETTINGS,
    immersiveDescriptionEnabled: candidate.immersiveDescriptionEnabled !== false,
    showExecutionTrace: Boolean(candidate.showExecutionTrace),
    autoAssetExtractionEnabled: Boolean(candidate.autoAssetExtractionEnabled),
    assetExtractionIntervalTurns: clampInteger(
      candidate.assetExtractionIntervalTurns,
      DEFAULT_TAVERN_ROOM_SETTINGS.assetExtractionIntervalTurns,
      1,
      10,
    ),
    maxAssetDrafts: clampInteger(
      candidate.maxAssetDrafts,
      DEFAULT_TAVERN_ROOM_SETTINGS.maxAssetDrafts,
      1,
      20,
    ),
    directorMaxSpeakers: clampInteger(
      candidate.directorMaxSpeakers,
      DEFAULT_TAVERN_ROOM_SETTINGS.directorMaxSpeakers,
      1,
      6,
    ),
    agentKnowledgeCompactIntervalTurns: clampInteger(
      candidate.agentKnowledgeCompactIntervalTurns,
      DEFAULT_TAVERN_ROOM_SETTINGS.agentKnowledgeCompactIntervalTurns,
      0,
      50,
    ),
    directorScheduling: {
      ...DEFAULT_TAVERN_ROOM_SETTINGS.directorScheduling,
      ...(candidate.directorScheduling ?? {}),
      directorOnlyPhaseValues: Array.isArray(candidate.directorScheduling?.directorOnlyPhaseValues)
        ? candidate.directorScheduling.directorOnlyPhaseValues
        : DEFAULT_TAVERN_ROOM_SETTINGS.directorScheduling.directorOnlyPhaseValues,
      speakerMotivation: {
        ...DEFAULT_TAVERN_ROOM_SETTINGS.directorScheduling.speakerMotivation,
        ...(candidate.directorScheduling?.speakerMotivation ?? {}),
        rules: Array.isArray(candidate.directorScheduling?.speakerMotivation?.rules)
          ? candidate.directorScheduling.speakerMotivation.rules
          : DEFAULT_TAVERN_ROOM_SETTINGS.directorScheduling.speakerMotivation.rules,
      },
      fixedOrder: {
        ...DEFAULT_TAVERN_ROOM_SETTINGS.directorScheduling.fixedOrder,
        ...(candidate.directorScheduling?.fixedOrder ?? {}),
        phaseValues: Array.isArray(candidate.directorScheduling?.fixedOrder?.phaseValues)
          ? candidate.directorScheduling.fixedOrder.phaseValues
          : DEFAULT_TAVERN_ROOM_SETTINGS.directorScheduling.fixedOrder.phaseValues,
      },
    },
    continuation: {
      ...DEFAULT_TAVERN_ROOM_SETTINGS.continuation,
      ...(candidate.continuation ?? {}),
    },
    replyOptions: {
      ...DEFAULT_TAVERN_ROOM_SETTINGS.replyOptions,
      ...(candidate.replyOptions ?? {}),
    },
    statusTracking: {
      ...DEFAULT_TAVERN_ROOM_SETTINGS.statusTracking,
      ...(candidate.statusTracking ?? {}),
    },
    randomEvents: {
      ...DEFAULT_TAVERN_ROOM_SETTINGS.randomEvents,
      ...(candidate.randomEvents ?? {}),
    },
    illustrationHints: {
      ...DEFAULT_TAVERN_ROOM_SETTINGS.illustrationHints,
      ...(candidate.illustrationHints ?? {}),
    },
    informationPolicy: {
      ...DEFAULT_TAVERN_ROOM_SETTINGS.informationPolicy,
      ...(candidate.informationPolicy ?? {}),
      hiddenFacts: {
        ...DEFAULT_TAVERN_ROOM_SETTINGS.informationPolicy.hiddenFacts,
        ...(candidate.informationPolicy?.hiddenFacts ?? {}),
      },
      roleAssignment: {
        ...DEFAULT_TAVERN_ROOM_SETTINGS.informationPolicy.roleAssignment,
        ...(candidate.informationPolicy?.roleAssignment ?? {}),
        rolePool: Array.isArray(candidate.informationPolicy?.roleAssignment?.rolePool)
          ? candidate.informationPolicy.roleAssignment.rolePool
          : DEFAULT_TAVERN_ROOM_SETTINGS.informationPolicy.roleAssignment.rolePool,
      },
    },
  };
};

const remapImportedEntityRef = (
  entity: TavernEntityRef | undefined,
  characterIdMap: Map<string, string>,
): TavernEntityRef | undefined => {
  if (!entity) {
    return undefined;
  }

  if (entity.type === "character") {
    const mappedId = characterIdMap.get(entity.characterId);
    return mappedId ? { ...entity, characterId: mappedId } : entity;
  }

  return entity;
};

const remapImportedStatusTarget = (
  target: TavernStatusTargetRef,
  characterIdMap: Map<string, string>,
): TavernStatusTargetRef => {
  if (target.type === "character") {
    const mappedId = characterIdMap.get(target.characterId);
    return mappedId ? { ...target, characterId: mappedId } : target;
  }
  if (target.type === "relationship") {
    return {
      ...target,
      subject: remapImportedEntityRef(target.subject, characterIdMap) ?? target.subject,
      object: remapImportedEntityRef(target.object, characterIdMap) ?? target.object,
    };
  }
  return target;
};

const remapImportedCondition = (
  condition: TavernCondition,
  characterIdMap: Map<string, string>,
): TavernCondition => {
  if ("all" in condition) {
    return { ...condition, all: condition.all.map((item) => remapImportedCondition(item, characterIdMap)) };
  }
  if ("any" in condition) {
    return { ...condition, any: condition.any.map((item) => remapImportedCondition(item, characterIdMap)) };
  }
  if ("not" in condition) {
    return { ...condition, not: remapImportedCondition(condition.not, characterIdMap) };
  }
  if ("status" in condition && "target" in condition) {
    return {
      ...condition,
      target: remapImportedStatusTarget(condition.target, characterIdMap),
    };
  }
  if ("factEvent" in condition) {
    return {
      ...condition,
      ...(condition.actor ? { actor: remapImportedEntityRef(condition.actor, characterIdMap) } : {}),
      ...(condition.target ? { target: remapImportedEntityRef(condition.target, characterIdMap) } : {}),
    };
  }
  if ("task" in condition) {
    return {
      ...condition,
      ...(condition.owner ? { owner: remapImportedEntityRef(condition.owner, characterIdMap) } : {}),
    };
  }
  return condition;
};

const remapImportedCharacterIds = (
  ids: string[] | undefined,
  characterIdMap: Map<string, string>,
) => ids?.flatMap((id) => {
  const mappedId = characterIdMap.get(id);
  return mappedId ? [mappedId] : [];
});

const remapImportedFactEvents = (
  factEvents: TavernFactEvent[] | undefined,
  characterIdMap: Map<string, string>,
) => Array.isArray(factEvents)
  ? factEvents.map((event) => ({
      ...event,
      ...(event.actor ? { actor: remapImportedEntityRef(event.actor, characterIdMap) } : {}),
      ...(event.target ? { target: remapImportedEntityRef(event.target, characterIdMap) } : {}),
      ...(event.visibleToCharacterIds
        ? { visibleToCharacterIds: remapImportedCharacterIds(event.visibleToCharacterIds, characterIdMap) }
        : {}),
    }))
  : [];

const remapImportedStatusEvents = (
  statusEvents: TavernStatusEvent[] | undefined,
  characterIdMap: Map<string, string>,
) => Array.isArray(statusEvents)
  ? statusEvents.map((event) => ({
      ...event,
      target: remapImportedStatusTarget(event.target, characterIdMap),
    }))
  : [];

const remapImportedTaskDefinitions = (
  tasks: TavernTaskDefinition[] | undefined,
  characterIdMap: Map<string, string>,
) => Array.isArray(tasks)
  ? tasks.map((task) => ({
      ...task,
      owner: remapImportedEntityRef(task.owner, characterIdMap) ?? task.owner,
      ...(task.participants
        ? { participants: task.participants.map((entity) => remapImportedEntityRef(entity, characterIdMap) ?? entity) }
        : {}),
      lifecycle: {
        ...task.lifecycle,
        ...(task.lifecycle.startCondition
          ? { startCondition: remapImportedCondition(task.lifecycle.startCondition, characterIdMap) }
          : {}),
        completeCondition: remapImportedCondition(task.lifecycle.completeCondition, characterIdMap),
        ...(task.lifecycle.failCondition
          ? { failCondition: remapImportedCondition(task.lifecycle.failCondition, characterIdMap) }
          : {}),
      },
    }))
  : [];

const remapImportedSceneOutcomes = (
  outcomes: TavernSceneOutcomeDefinition[] | undefined,
  characterIdMap: Map<string, string>,
) => Array.isArray(outcomes)
  ? outcomes.map((outcome) => ({
      ...outcome,
      ...(outcome.winner
        ? { winner: outcome.winner.map((entity) => remapImportedEntityRef(entity, characterIdMap) ?? entity) }
        : {}),
      ...(outcome.loser
        ? { loser: outcome.loser.map((entity) => remapImportedEntityRef(entity, characterIdMap) ?? entity) }
        : {}),
      condition: remapImportedCondition(outcome.condition, characterIdMap),
    }))
  : [];

const remapImportedOutcomeEvents = (
  events: TavernOutcomeEvent[] | undefined,
  characterIdMap: Map<string, string>,
) => Array.isArray(events)
  ? events.map((event) => ({
      ...event,
      winners: event.winners.map((entity) => remapImportedEntityRef(entity, characterIdMap) ?? entity),
      losers: event.losers.map((entity) => remapImportedEntityRef(entity, characterIdMap) ?? entity),
    }))
  : [];

const remapImportedTaskSnapshot = (
  snapshot: Record<string, TavernTaskState> | undefined,
  characterIdMap: Map<string, string>,
) => snapshot
  ? Object.fromEntries(Object.entries(snapshot).map(([taskId, state]) => [
      taskId,
      {
        ...state,
        owner: remapImportedEntityRef(state.owner, characterIdMap) ?? state.owner,
      },
    ]))
  : {};

const remapImportedTaskEvents = (
  events: TavernTaskEvent[] | undefined,
  characterIdMap: Map<string, string>,
) => Array.isArray(events)
  ? events.map((event) => ({
      ...event,
      owner: remapImportedEntityRef(event.owner, characterIdMap) ?? event.owner,
      before: event.before
        ? { ...event.before, owner: remapImportedEntityRef(event.before.owner, characterIdMap) ?? event.before.owner }
        : undefined,
      after: { ...event.after, owner: remapImportedEntityRef(event.after.owner, characterIdMap) ?? event.after.owner },
    }))
  : [];

export const TavernPage = ({
  workspace,
  files,
  runtimeModel,
  runtimeAgentId,
  onRoomImmersiveChange,
}: TavernPageProps) => {
  const [state, setState] = useState<TavernState>(() => createDefaultTavernState(workspace.id));
  const [isTavernStateHydrated, setIsTavernStateHydrated] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftCursor, setDraftCursor] = useState(0);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState<"home" | "room">("home");
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
  const [isManagedModeEnabled, setIsManagedModeEnabled] = useState(false);
  const [isManagedAutoRunStarted, setIsManagedAutoRunStarted] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isExtractingAssets, setIsExtractingAssets] = useState(false);
  const [isTrackingProgress, setIsTrackingProgress] = useState(false);
  const [compactingCharacterIds, setCompactingCharacterIds] = useState<Set<string>>(() => new Set());
  const [isGeneratingReplySuggestions, setIsGeneratingReplySuggestions] = useState(false);
  const [replySuggestions, setReplySuggestions] = useState<TavernReplyOption[]>([]);
  const [isQuickSummaryOpen, setIsQuickSummaryOpen] = useState(false);
  const [quickSummaryTab, setQuickSummaryTab] = useState<"summary" | "novel">("summary");
  const [isGeneratingQuickSummary, setIsGeneratingQuickSummary] = useState(false);
  const [isGeneratingQuickNovel, setIsGeneratingQuickNovel] = useState(false);
  const [quickNovelExportFormat, setQuickNovelExportFormat] = useState<QuickNovelExportFormat>("md");
  const [quickSummaryError, setQuickSummaryError] = useState("");
  const [quickSummaryCacheState, setQuickSummaryCacheState] = useState<QuickSummaryCacheState>(
    () => ({
      workspaceId: workspace.id,
      entries: loadQuickSummaryCache(workspace.id),
    }),
  );
  const [turnStatus, setTurnStatus] = useState("");
  const [executionSteps, setExecutionSteps] = useState<TavernExecutionStep[]>([]);
  const [executionTraceAnchorMessageId, setExecutionTraceAnchorMessageId] = useState("");
  const workspaceIdRef = useRef(workspace.id);
  const draftInputRef = useRef<HTMLTextAreaElement | null>(null);
  const managedAutoRunTimerRef = useRef<number | null>(null);
  const messageViewportRef = useRef<HTMLDivElement | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (workspaceIdRef.current === workspace.id) {
      return;
    }

    workspaceIdRef.current = workspace.id;
    setState(createDefaultTavernState(workspace.id));
    setIsTavernStateHydrated(false);
    setDraft("");
    setDraftCursor(0);
    setError("");
    setViewMode("home");
    setIsSidePanelOpen(false);
    setIsManagedModeEnabled(false);
    setIsManagedAutoRunStarted(false);
    setIsSending(false);
    setIsExtractingAssets(false);
    setIsTrackingProgress(false);
    setCompactingCharacterIds(new Set());
    setIsGeneratingReplySuggestions(false);
    setReplySuggestions([]);
    setIsQuickSummaryOpen(false);
    setQuickSummaryTab("summary");
    setIsGeneratingQuickSummary(false);
    setIsGeneratingQuickNovel(false);
    setQuickNovelExportFormat("md");
    setQuickSummaryError("");
    setQuickSummaryCacheState({
      workspaceId: workspace.id,
      entries: loadQuickSummaryCache(workspace.id),
    });
    setTurnStatus("");
    setExecutionSteps([]);
    setExecutionTraceAnchorMessageId("");
  }, [workspace.id]);

  useEffect(() => {
    let isCancelled = false;
    setIsTavernStateHydrated(false);

    loadTavernState(workspace.path, workspace.id)
      .then((nextState) => {
        if (isCancelled) {
          return;
        }

        setState(nextState);
        setIsTavernStateHydrated(true);
      })
      .catch((loadError) => {
        if (isCancelled) {
          return;
        }

        console.error("Failed to load tavern state", loadError);
        toast.error("无法加载酒馆记录，已使用默认酒馆。");
        setState(createDefaultTavernState(workspace.id));
        setIsTavernStateHydrated(true);
      });

    return () => {
      isCancelled = true;
    };
  }, [workspace.id, workspace.path]);

  useEffect(() => {
    return () => {
      if (managedAutoRunTimerRef.current !== null) {
        window.clearTimeout(managedAutoRunTimerRef.current);
        managedAutoRunTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (
      isTavernStateHydrated &&
      state.rooms.some((room) => room.workspaceId === workspace.id)
    ) {
      void saveTavernState(workspace.path, workspace.id, state).catch((saveError) => {
        console.error("Failed to save tavern state", saveError);
      });
    }
  }, [isTavernStateHydrated, state, workspace.id, workspace.path]);

  useEffect(() => {
    if (quickSummaryCacheState.workspaceId !== workspace.id) {
      return;
    }

    saveQuickSummaryCache(workspace.id, quickSummaryCacheState.entries);
  }, [quickSummaryCacheState, workspace.id]);

  useEffect(() => {
    onRoomImmersiveChange?.(viewMode === "room");

    return () => onRoomImmersiveChange?.(false);
  }, [onRoomImmersiveChange, viewMode]);

  const activeRoom = useMemo(() => {
    const room = state.rooms.find((room) => room.id === state.activeRoomId) ?? state.rooms[0] ?? null;
    return room ? projectTavernSceneOntoRoom(room) : null;
  }, [state.activeRoomId, state.rooms]);
  const visualPreset = useMemo(
    () => getVisualPreset(activeRoom?.scenePresetId),
    [activeRoom?.scenePresetId],
  );
  const characterById = useMemo(() => (
    new Map([
      ...state.rooms.flatMap((room) =>
        (room.localCharacters ?? []).map((character) => [character.id, character] as const)
      ),
    ])
  ), [state.rooms]);
  const messagesByRoomId = useMemo(
    () => createMessagesByRoomIndex(state.rooms, state.messagesByScene),
    [state.messagesByScene, state.rooms],
  );
  const roomCharacters = useMemo(() => {
    if (!activeRoom) {
      return [];
    }

    return activeRoom.characterIds
      .map((characterId) => characterById.get(characterId))
      .filter((character): character is TavernCharacter => Boolean(character));
  }, [activeRoom, characterById]);
  const roomMessages = useMemo(() => (
    activeRoom
      ? getSceneMessages(activeRoom, state)
      : []
  ), [activeRoom, state]);
  const renderableRoomMessages = useMemo(() => (
    activeRoom
      ? createTavernRenderableMessages({
          messages: roomMessages,
          characters: roomCharacters,
          userPersonaName: activeRoom.userPersonaName,
          room: activeRoom,
        })
      : []
  ), [activeRoom, roomCharacters, roomMessages]);
  const quickSummarySignature = useMemo(() => (
    activeRoom ? createQuickSummarySignature(activeRoom, roomMessages) : ""
  ), [activeRoom, roomMessages]);
  const activeQuickSummaryCache = useMemo(() => (
    activeRoom ? quickSummaryCacheState.entries[getRoomActiveSceneId(activeRoom)] ?? null : null
  ), [activeRoom, quickSummaryCacheState.entries]);
  const isQuickSummaryCacheFresh = Boolean(
    activeQuickSummaryCache &&
    activeQuickSummaryCache.signature === quickSummarySignature,
  );
  const quickSummaryGeneratedAtText = useMemo(() => {
    if (!activeQuickSummaryCache?.content.trim()) {
      return "";
    }

    return new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(activeQuickSummaryCache.generatedAt);
  }, [activeQuickSummaryCache]);
  const quickNovelGeneratedAtText = useMemo(() => {
    if (!activeQuickSummaryCache?.novelContent?.trim() || !activeQuickSummaryCache.novelGeneratedAt) {
      return "";
    }

    return new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(activeQuickSummaryCache.novelGeneratedAt);
  }, [activeQuickSummaryCache]);
  const latestMessage = renderableRoomMessages[renderableRoomMessages.length - 1] ?? null;
  const activeCharacter = useMemo(() => (
    roomCharacters.find((character) => character.id === activeRoom?.activeCharacterId)
      ?? roomCharacters[0]
      ?? null
  ), [activeRoom?.activeCharacterId, roomCharacters]);
  const hasGlobalHeaderProgress = Boolean(
    activeRoom?.progressViews.some((view) => view.placement === "globalHeader"),
  );

  useEffect(() => {
    setIsGeneratingReplySuggestions(false);
    setReplySuggestions(activeRoom?.replyOptions ?? []);
    setIsQuickSummaryOpen(false);
    setIsGeneratingQuickSummary(false);
    setQuickSummaryError("");
    setIsManagedAutoRunStarted(false);
    if (managedAutoRunTimerRef.current !== null) {
      window.clearTimeout(managedAutoRunTimerRef.current);
      managedAutoRunTimerRef.current = null;
    }
  }, [activeRoom?.id, activeRoom?.activeSceneId]);

  const scrollMessagesToBottom = useCallback(() => {
    const viewport = messageViewportRef.current;
    if (!viewport) {
      messageEndRef.current?.scrollIntoView({ block: "end" });
      return;
    }

    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior: "auto",
    });
  }, []);

  useLayoutEffect(() => {
    scrollMessagesToBottom();

    const firstFrame = window.requestAnimationFrame(() => {
      scrollMessagesToBottom();
      window.requestAnimationFrame(scrollMessagesToBottom);
    });

    return () => window.cancelAnimationFrame(firstFrame);
  }, [
    activeRoom?.id,
    activeRoom?.activeSceneId,
    executionSteps.length,
    latestMessage?.content,
    latestMessage?.id,
    renderableRoomMessages.length,
    scrollMessagesToBottom,
    viewMode,
  ]);

  useEffect(() => {
    const messageList = messageListRef.current;
    if (!messageList || typeof ResizeObserver === "undefined") {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      scrollMessagesToBottom();
    });
    resizeObserver.observe(messageList);

    return () => resizeObserver.disconnect();
  }, [activeRoom?.id, activeRoom?.activeSceneId, scrollMessagesToBottom, viewMode]);

  const selectableFiles = useMemo(() => files.filter((file) => !file.isDirectory), [files]);
  const activeReferenceToken = useMemo(
    () => getActiveReferenceToken(draft, draftCursor),
    [draft, draftCursor],
  );
  const referenceSuggestions = useMemo(() => {
    if (!activeReferenceToken) {
      return [];
    }

    const query = activeReferenceToken.query.toLowerCase();
    return selectableFiles
      .filter((file) => {
        if (!query) {
          return true;
        }

        const path = file.path.toLowerCase();
        const name = file.name.toLowerCase();
        return path.includes(query) || name.includes(query);
      })
      .slice(0, REFERENCE_SUGGESTION_LIMIT);
  }, [activeReferenceToken, selectableFiles]);
  const fileReferenceMatches = useMemo(
    () => resolveFileReferenceMatches(draft, files),
    [draft, files],
  );
  const referencedFilePreviews = useMemo(
    () => uniqueFilesByPath(summarizeReferenceMatches(fileReferenceMatches)),
    [fileReferenceMatches],
  );
  const unresolvedFileReferences = useMemo(
    () => fileReferenceMatches.filter((match) => match.matches.length === 0),
    [fileReferenceMatches],
  );
  const ambiguousFileReferences = useMemo(
    () => fileReferenceMatches.filter((match) => match.matches.length > 1),
    [fileReferenceMatches],
  );

  const resetExecutionTrace = useCallback((steps: TavernExecutionStep[]) => {
    setExecutionSteps(steps);
  }, []);

  const patchExecutionStep = useCallback((
    stepId: string,
    patch: Partial<Omit<TavernExecutionStep, "id">>,
  ) => {
    setExecutionSteps((current) => current.map((step) =>
      step.id === stepId ? { ...step, ...patch } : step
    ));
  }, []);

  const appendExecutionStep = useCallback((step: TavernExecutionStep) => {
    setExecutionSteps((current) => [...current, step]);
  }, []);

  const shouldAutoExtractAssets = useCallback((
    room: TavernRoom,
    messagesAfterUser: TavernMessage[],
  ) => {
    if (!room.settings.autoAssetExtractionEnabled) {
      return false;
    }

    if (room.assetDrafts.length >= room.settings.maxAssetDrafts) {
      return false;
    }

    const userTurnCount = messagesAfterUser.filter((message) => message.role === "user").length;
    return userTurnCount > 0 &&
      userTurnCount % room.settings.assetExtractionIntervalTurns === 0;
  }, []);

  const shouldAutoTrackProgress = useCallback((
    room: TavernRoom,
    messagesAfterUser: TavernMessage[],
  ) => {
    if (
      !room.settings.statusTracking.enabled ||
      !room.progressTracker.enabled ||
      room.progressTracker.mode === "manual" ||
      room.statusDefinitions.length === 0 ||
      room.statusRules.length === 0
    ) {
      return false;
    }

    if (room.progressTracker.mode === "afterTurn") {
      return true;
    }

    const interval = Math.max(1, room.progressTracker.intervalTurns);
    const userTurnCount = messagesAfterUser.filter((message) => message.role === "user").length;
    return userTurnCount > 0 && userTurnCount % interval === 0;
  }, []);

  const appendProgressCheckpointToRoom = useCallback((
    room: TavernRoom,
    reason: Parameters<typeof createTavernProgressCheckpoint>[0]["reason"],
    turnId?: string,
  ): TavernRoom => {
    const checkpoint = createTavernProgressCheckpoint({
      room,
      turnId,
      reason,
      createdAt: Date.now(),
    });
    return syncTavernRoomActiveScene({
      ...room,
      statusCheckpoints: [...room.statusCheckpoints, checkpoint].slice(-20),
    });
  }, []);

  const shouldCompactCharacterKnowledgeAfterTurn = useCallback((
    room: TavernRoom,
    messages: TavernMessage[],
    characterId: string,
  ) => {
    const interval = room.settings.agentKnowledgeCompactIntervalTurns;
    if (!interval || interval <= 0) {
      return false;
    }

    const completedTurns = messages.filter((message) =>
      message.role === "character" &&
      message.characterId === characterId &&
      message.status !== "streaming" &&
      message.status !== "error" &&
      message.content.trim()
    ).length;
    return completedTurns > 0 && completedTurns % interval === 0;
  }, []);

  const patchRoom = useCallback((roomId: string, patch: Partial<TavernRoom>) => {
    setState((current) => {
      let patchedRoom: TavernRoom | null = null;
      const nextRooms = current.rooms.map((room) => {
        if (room.id !== roomId) {
          return room;
        }

        patchedRoom = syncTavernRoomActiveScene({
          ...projectTavernSceneOntoRoom(room),
          ...patch,
          updatedAt: Date.now(),
        });
        return patchedRoom;
      });

      if (!patchedRoom) {
        return current;
      }

      return {
        ...current,
        rooms: nextRooms,
      };
    });
  }, []);

  const appendMessagesToRoom = useCallback((roomId: string, messages: TavernMessage[]) => {
    setState((current) => {
      const room = current.rooms.find((item) => item.id === roomId);
      const sceneId = room ? getRoomActiveSceneId(room) : roomId;
      const nextSceneMessages = [
        ...(current.messagesByScene[sceneId] ?? []),
        ...messages,
      ];

      return {
        ...current,
        rooms: current.rooms.map((room) =>
          room.id === roomId ? { ...room, updatedAt: Date.now() } : room,
        ),
        messagesByScene: {
          ...current.messagesByScene,
          [sceneId]: nextSceneMessages,
        },
      };
    });
  }, []);

  const patchMessage = useCallback((messageId: string, patch: Partial<TavernMessage>) => {
    setState((current) => {
      let patchedSceneId = "";
      const sourceMessagesByScene = current.messagesByScene;
      const nextMessagesByScene = Object.fromEntries(
        Object.entries(sourceMessagesByScene).map(([sceneId, messages]) => {
          const nextMessages = messages.map((message) => {
            if (message.id !== messageId) {
              return message;
            }

            patchedSceneId = sceneId;
            return {
              ...message,
              ...patch,
            };
          });
          return [sceneId, nextMessages];
        }),
      );

      if (!patchedSceneId) {
        return current;
      }
      return {
        ...current,
        messagesByScene: nextMessagesByScene,
      };
    });
  }, []);

  const removeMessage = useCallback((messageId: string) => {
    setState((current) => {
      let removedSceneId = "";
      const sourceMessagesByScene = current.messagesByScene;
      const nextMessagesByScene = Object.fromEntries(
        Object.entries(sourceMessagesByScene).map(([sceneId, messages]) => {
          const nextMessages = messages.filter((message) => {
            const shouldKeep = message.id !== messageId;

            if (!shouldKeep) {
              removedSceneId = sceneId;
            }

            return shouldKeep;
          });
          return [sceneId, nextMessages];
        }),
      );

      if (!removedSceneId) {
        return current;
      }
      const removedRoom = current.rooms.find((room) => getRoomActiveSceneId(room) === removedSceneId);

      return {
        ...current,
        rooms: current.rooms.map((room) =>
          removedRoom && room.id === removedRoom.id ? { ...room, updatedAt: Date.now() } : room
        ),
        messagesByScene: nextMessagesByScene,
      };
    });
  }, []);

  const clearRoomMessages = useCallback((roomId: string) => {
    const targetRoom = state.rooms.find((room) => room.id === roomId);
    if (targetRoom?.locked) {
      return;
    }

    if (!targetRoom) {
      return;
    }

    const sceneId = getRoomActiveSceneId(targetRoom);
    const resetMessage = createTavernMessage({
      roomId: targetRoom.id,
      role: "narrator",
      content: "这个场景的桌面被重新擦亮，旧谈话暂时收进抽屉。",
      status: "done",
    });
    setState((current) => {
      const currentRoom = current.rooms.find((room) => room.id === targetRoom.id);
      const currentSceneId = currentRoom ? getRoomActiveSceneId(currentRoom) : sceneId;

      return {
        ...current,
        rooms: current.rooms.map((room) =>
          room.id === targetRoom.id
            ? appendProgressCheckpointToRoom(
                touchTavernRoomActiveScene(room),
                "before_context_trim",
                resetMessage.id,
              )
            : room,
        ),
        messagesByScene: {
          ...current.messagesByScene,
          [currentSceneId]: [resetMessage],
        },
      };
    });
  }, [appendProgressCheckpointToRoom, state.rooms]);

  const deleteRoom = useCallback((roomId: string) => {
    const targetRoom = state.rooms.find((room) => room.id === roomId);
    if (!targetRoom || targetRoom.locked || state.rooms.length <= 1) {
      return;
    }

    setState((current) => {
      const currentTargetRoom = current.rooms.find((room) => room.id === roomId);
      if (!currentTargetRoom || currentTargetRoom.locked || current.rooms.length <= 1) {
        return current;
      }

      const nextRooms = current.rooms.filter((room) => room.id !== roomId);
      const nextMessagesByScene = { ...current.messagesByScene };
      for (const scene of currentTargetRoom.scenes ?? []) {
        delete nextMessagesByScene[scene.id];
      }
      const activeRoomId = current.activeRoomId === roomId
        ? nextRooms[0]?.id ?? current.activeRoomId
        : current.activeRoomId;

      return {
        ...current,
        activeRoomId,
        rooms: nextRooms,
        messagesByScene: nextMessagesByScene,
      };
    });
    if (activeRoom?.id === roomId) {
      setIsSidePanelOpen(false);
      setViewMode("home");
    }
  }, [activeRoom?.id, state.rooms]);

  const copyRoom = useCallback((roomId: string) => {
    setState((current) => {
      const sourceRoom = current.rooms.find((room) => room.id === roomId);
      if (!sourceRoom) {
        return current;
      }

      const createdAt = Date.now();
      const copiedRoomId = createLocalId("room");
      const sourceScenes = sourceRoom.scenes?.length
        ? sourceRoom.scenes
        : [createTavernScene({}, sourceRoom)];
      const sourceCharacterById = new Map([
        ...current.rooms.flatMap((room) =>
          (room.localCharacters ?? []).map((character) => [character.id, character] as const)
        ),
      ]);
      const characterIdMap = new Map<string, string>();
      const referencedCharacterIds = [
        ...new Set(sourceScenes.flatMap((scene) => scene.characterIds)),
      ];
      const copiedCharacters = referencedCharacterIds.flatMap((characterId) => {
        const character = sourceCharacterById.get(characterId);
        if (!character) {
          return [];
        }

        const copiedCharacterId = createLocalId("character");
        characterIdMap.set(character.id, copiedCharacterId);
        return [{
          ...character,
          id: copiedCharacterId,
          systemPresetId: undefined,
          systemPresetCharacterId: undefined,
          systemPresetVersion: undefined,
          createdAt,
          updatedAt: createdAt,
        }];
      });

      const sceneIdMap = new Map<string, string>();
      const sourceTimelineEvents = sourceRoom.timelineEvents;
      const timelineEventIdMap = new Map<string, string>();
      const copiedTimelineEvents = sourceTimelineEvents.map((event) => {
        const copiedEventId = createLocalId("event");
        timelineEventIdMap.set(event.id, copiedEventId);
        return {
          ...event,
          id: copiedEventId,
          createdAt,
          updatedAt: createdAt,
        };
      });
      const remapTimelineScope = (scope: TavernScene["timelineScope"]) => {
        if (scope.mode === "range") {
          return {
            mode: "range" as const,
            startEventId: scope.startEventId ? timelineEventIdMap.get(scope.startEventId) : undefined,
            endEventId: scope.endEventId ? timelineEventIdMap.get(scope.endEventId) : undefined,
          };
        }

        if (scope.mode === "selected") {
          return {
            mode: "selected" as const,
            eventIds: (scope.eventIds ?? []).flatMap((eventId) => {
              const copiedEventId = timelineEventIdMap.get(eventId);
              return copiedEventId ? [copiedEventId] : [];
            }),
          };
        }

        return { mode: "auto" as const };
      };
      const copiedMessagesByScene: Record<string, TavernMessage[]> = {};
      const copiedScenes = sourceScenes.map((scene) => {
        const copiedSceneId = createLocalId("scene");
        sceneIdMap.set(scene.id, copiedSceneId);
        const sourceMessages = current.messagesByScene[scene.id] ?? [];
        const messageIdMap = new Map<string, string>();
        const copiedMessages = sourceMessages.flatMap((message) => {
          const copiedMessageId = createLocalId("message");
          messageIdMap.set(message.id, copiedMessageId);

          if (message.role === "character") {
            const copiedCharacterId = message.characterId
              ? characterIdMap.get(message.characterId)
              : undefined;
            if (!copiedCharacterId) {
              return [];
            }

            return [{
              ...message,
              id: copiedMessageId,
              roomId: copiedRoomId,
              characterId: copiedCharacterId,
              createdAt,
              status: message.status === "streaming" ? "done" as const : message.status,
              referencedFiles: message.referencedFiles?.map((file) => ({ ...file })),
            }];
          }

          return [{
            ...message,
            id: copiedMessageId,
            roomId: copiedRoomId,
            createdAt,
            status: message.status === "streaming" ? "done" as const : message.status,
            referencedFiles: message.referencedFiles?.map((file) => ({ ...file })),
          }];
        });
        copiedMessagesByScene[copiedSceneId] = copiedMessages.length > 0
          ? copiedMessages
          : [
              createTavernMessage({
                roomId: copiedRoomId,
                role: "narrator",
                content: "这个场景从另一个酒馆复制而来，灯光重新亮起。",
                status: "done",
              }),
            ];
        const characterIds = scene.characterIds.flatMap((characterId) => {
          const copiedCharacterId = characterIdMap.get(characterId);
          return copiedCharacterId ? [copiedCharacterId] : [];
        });
        const characterMemories = Object.fromEntries(
          Object.entries(scene.characterMemories).flatMap(([characterId, memory]) => {
            const copiedCharacterId = characterIdMap.get(characterId);
            return copiedCharacterId && memory.trim() ? [[copiedCharacterId, memory]] : [];
          }),
        );
        const characterConfigs = Object.fromEntries(
          scene.characterIds.flatMap((sourceCharacterId) => {
            const copiedCharacterId = characterIdMap.get(sourceCharacterId);
            if (!copiedCharacterId) {
              return [];
            }
            return [[
              copiedCharacterId,
            {
              characterId: copiedCharacterId,
              memory: characterMemories[copiedCharacterId],
            },
            ]];
          }),
        );

        return {
          ...scene,
          id: copiedSceneId,
          characterConfigs,
          characterMemories,
          timelineScope: remapTimelineScope(scene.timelineScope),
          illustrationHints: scene.illustrationHints.map((hint) => ({
            ...hint,
            id: createLocalId("illustration"),
            sourceMessageIds: hint.sourceMessageIds.flatMap((messageId) => {
              const copiedMessageId = messageIdMap.get(messageId);
              return copiedMessageId ? [copiedMessageId] : [];
            }),
            createdAt,
          })),
          assetDrafts: scene.assetDrafts.map((draft) => ({
            ...draft,
            id: createLocalId("draft"),
            sourceMessageIds: draft.sourceMessageIds.flatMap((messageId) => {
              const copiedMessageId = messageIdMap.get(messageId);
              return copiedMessageId ? [copiedMessageId] : [];
            }),
            timelineEvents: draft.timelineEvents.map((event) => ({
              ...event,
              id: createLocalId("timeline-draft"),
            })),
            characterMemories: draft.characterMemories.flatMap((memory) => {
              const copiedCharacterId = characterIdMap.get(memory.characterId);
              return copiedCharacterId
                ? [{
                    ...memory,
                    id: createLocalId("memory-draft"),
                    characterId: copiedCharacterId,
                  }]
                : [];
            }),
            lorebookEntries: draft.lorebookEntries.map((entry) => ({
              ...entry,
              id: createLocalId("lore-draft"),
              keywords: [...entry.keywords],
            })),
            createdAt,
            updatedAt: createdAt,
          })),
          characterIds,
          activeCharacterId: characterIdMap.get(scene.activeCharacterId) ?? characterIds[0] ?? "",
          createdAt,
          updatedAt: createdAt,
        } satisfies TavernScene;
      });
      const copiedLorebookEntries = sourceRoom.lorebookEntries.map((entry) => ({
        ...entry,
        id: createLocalId("lore"),
        keywords: [...entry.keywords],
        createdAt,
        updatedAt: createdAt,
      }));
      const activeSceneId = sceneIdMap.get(sourceRoom.activeSceneId ?? "") ?? copiedScenes[0]?.id ?? "";
      const copiedRoom: TavernRoom = projectTavernSceneOntoRoom({
        ...sourceRoom,
        id: copiedRoomId,
        workspaceId: workspace.id,
        systemPresetId: undefined,
        systemPresetVersion: undefined,
        locked: false,
        title: `${sourceRoom.title}（副本）`,
        activeSceneId,
        scenes: copiedScenes,
        localCharacters: copiedCharacters,
        lorebookEntries: copiedLorebookEntries,
        timelineEvents: copiedTimelineEvents,
        createdAt,
        updatedAt: createdAt,
      });

      return {
        ...current,
        activeRoomId: copiedRoomId,
        rooms: [...current.rooms, copiedRoom],
        messagesByScene: {
          ...current.messagesByScene,
          ...copiedMessagesByScene,
        },
      };
    });
    setError("");
  }, [activeRoom, workspace.id]);

  const restoreSystemPresetRoom = useCallback((roomId: string) => {
    const room = state.rooms.find((item) => item.id === roomId);
    const preset = getTavernSystemPreset(room?.systemPresetId);
    if (!room || room.locked || !preset) {
      return;
    }

    if (!window.confirm(
      `再次确认恢复「${preset.label}」为系统默认？当前场景、角色、记忆、剧情资产和对话记录都会被系统预设覆盖。`,
    )) {
      return;
    }

    setState((current) => {
      const sourceRoom = current.rooms.find((item) => item.id === roomId);
      const sourcePreset = getTavernSystemPreset(sourceRoom?.systemPresetId);
      if (!sourceRoom || sourceRoom.locked || !sourcePreset) {
        return current;
      }

        const restored = createTavernRoomFromSystemPreset(workspace.id, sourcePreset.id, {
          roomId: sourceRoom.id,
          roomCreatedAt: sourceRoom.createdAt,
        });

      return {
        ...current,
        activeRoomId: sourceRoom.id,
        rooms: current.rooms.map((item) =>
          item.id === sourceRoom.id ? restored.room : item
        ),
        messagesByScene: {
          ...current.messagesByScene,
          [restored.room.activeSceneId ?? sourceRoom.id]: restored.messages,
        },
      };
    });
    setError("");
  }, [state.rooms, workspace.id]);

  const setRoomLocked = useCallback((roomId: string, locked: boolean) => {
    const room = state.rooms.find((item) => item.id === roomId);
    if (!room || room.locked === locked) {
      return false;
    }

    const actionLabel = locked ? "锁定" : "解锁";
    const consequence = locked
      ? "锁定后将不能删除该酒馆、恢复系统默认或清空对话。"
      : "解锁后将重新允许删除该酒馆、恢复系统默认或清空对话。";
    if (!window.confirm(`再次确认${actionLabel}「${room.title}」？${consequence}`)) {
      return false;
    }

    setState((current) => ({
      ...current,
      rooms: current.rooms.map((item) =>
        item.id === roomId
          ? {
              ...item,
              locked,
              updatedAt: Date.now(),
            }
          : item,
      ),
    }));
    setError("");
    return true;
  }, [state.rooms]);

  const applyAssetDraft = useCallback((draftId: string) => {
    if (!activeRoom) {
      return;
    }

    setState((current) => ({
      ...current,
      rooms: current.rooms.map((room) => {
        if (room.id !== activeRoom.id) {
          return room;
        }

        const draft = room.assetDrafts.find((item) => item.id === draftId);
        if (!draft) {
          return room;
        }

        const timelineEvents = draft.timelineEvents.filter((event) =>
          event.title.trim() && event.summary.trim()
        );
        const memoryDrafts = draft.characterMemories.filter((memory) =>
          memory.characterId.trim() && memory.note.trim()
        );
        const lorebookEntries = draft.lorebookEntries.filter((entry) =>
          entry.title.trim() && entry.content.trim()
        );
        const characterMemories = { ...room.characterMemories };
        const characterConfigs = { ...(room.characterConfigs ?? {}) };
        for (const memory of memoryDrafts) {
          const existing = characterMemories[memory.characterId]?.trim() ?? "";
          const nextNote = memory.note.trim();
          characterMemories[memory.characterId] = existing
            ? [existing, nextNote].join("\n")
            : nextNote;
          characterConfigs[memory.characterId] = {
            ...(characterConfigs[memory.characterId] ?? { characterId: memory.characterId }),
            memory: characterMemories[memory.characterId],
          };
        }

        return syncTavernRoomActiveScene({
          ...room,
          characterConfigs,
          characterMemories,
          timelineEvents: [
            ...room.timelineEvents,
            ...timelineEvents.map((event) => createTavernTimelineEvent(event)),
          ],
          lorebookEntries: [
            ...room.lorebookEntries,
            ...lorebookEntries.map((entry) => createTavernLorebookEntry(entry)),
          ],
          assetDrafts: room.assetDrafts.filter((item) => item.id !== draftId),
          updatedAt: Date.now(),
        });
      }),
    }));
  }, [activeRoom]);

  const deleteAssetDraft = useCallback((draftId: string) => {
    if (!activeRoom) {
      return;
    }

    const draft = activeRoom.assetDrafts.find((item) => item.id === draftId);
    if (!draft || !confirmDangerousAction(
      "忽略这份待确认草稿？",
      "再次确认忽略草稿？草稿中的时间线、记忆和世界书建议都会被删除。",
    )) {
      return;
    }

    setState((current) => ({
      ...current,
      rooms: current.rooms.map((room) =>
        room.id === activeRoom.id
          ? syncTavernRoomActiveScene({
              ...projectTavernSceneOntoRoom(room),
              assetDrafts: projectTavernSceneOntoRoom(room).assetDrafts.filter((draft) =>
                draft.id !== draftId
              ),
              updatedAt: Date.now(),
            })
          : room,
      ),
    }));
  }, [activeRoom]);

  const clearIllustrationHints = useCallback(() => {
    if (!activeRoom || activeRoom.illustrationHints.length === 0) {
      return;
    }

    if (!confirmDangerousAction(
      "清空当前场景的插图提示？",
      "再次确认清空插图提示？这些导演生成的画面提示会从当前场景中移除。",
    )) {
      return;
    }

    patchRoom(activeRoom.id, {
      illustrationHints: [],
    });
  }, [activeRoom, patchRoom]);

  const exportRoom = useCallback((roomId: string) => {
    const targetRoom = state.rooms.find((room) => room.id === roomId);
    if (!targetRoom) {
      return false;
    }

    try {
      const projectedTargetRoom = projectTavernSceneOntoRoom(targetRoom);
      const targetCharacters = projectedTargetRoom.localCharacters ?? [];
      const targetMessages = getSceneMessages(projectedTargetRoom, state);
      const messagesByScene = Object.fromEntries(
        (projectedTargetRoom.scenes ?? []).map((scene) => [
          scene.id,
          state.messagesByScene[scene.id] ??
            (scene.id === projectedTargetRoom.activeSceneId ? targetMessages : []),
        ]),
      );
      const payload: TavernRoomExportV2 = {
        schema: TAVERN_ROOM_EXPORT_SCHEMA,
        version: 2,
        exportedAt: new Date().toISOString(),
        room: projectedTargetRoom,
        characters: targetCharacters,
        messages: targetMessages,
        messagesByScene,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${sanitizeFileName(targetRoom.title)}.tavern-room.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      return true;
    } catch {
      return false;
    }
  }, [state]);

  const importRoomExport = useCallback((raw: string) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      return "房间文件不是有效 JSON。";
    }

    const importExternalPayload = () => {
      try {
        return parseTavernExternalImportJson(raw);
      } catch (error) {
        return getErrorMessage(error);
      }
    };
    const parsedRoomExport = parsed as Partial<TavernRoomExportV2>;
    if (
      parsedRoomExport.schema !== TAVERN_ROOM_EXPORT_SCHEMA ||
      parsedRoomExport.version !== 2 ||
      !parsedRoomExport.room ||
      !Array.isArray(parsedRoomExport.characters)
    ) {
      const externalPayload = importExternalPayload();
      if (typeof externalPayload === "string") {
        return externalPayload;
      }

      if (
        externalPayload.kind === "generatedPreset" ||
        externalPayload.kind === "characterCard"
      ) {
        try {
          const materialized = createTavernRoomFromGeneratedPresetJson(
            workspace.id,
            externalPayload.preset,
            {
              creationSource: externalPayload.kind === "characterCard"
                ? "imported"
                : "agent_generated",
            },
          );
          setState((current) => ({
            ...current,
            activeRoomId: materialized.room.id,
            rooms: [...current.rooms, materialized.room],
            messagesByScene: {
              ...current.messagesByScene,
              [getRoomActiveSceneId(materialized.room)]: materialized.messages,
            },
          }));
          setError("");
          return null;
        } catch (error) {
          return getErrorMessage(error);
        }
      }

      if (externalPayload.kind === "worldBook") {
        if (!activeRoom || activeRoom.locked) {
          return activeRoom?.locked ? "当前房间已锁定，不能导入世界书。" : "没有可导入世界书的当前房间。";
        }

        const lorebookEntries = externalPayload.entries.map((entry) => ({
          ...createTavernLorebookEntry({
            title: entry.title,
            content: entry.content,
            keywords: entry.keywords,
            alwaysOn: entry.alwaysOn,
          }),
          enabled: entry.enabled,
        }));
        const importMessage = createTavernMessage({
          roomId: activeRoom.id,
          role: "narrator",
          content: `已导入世界书「${externalPayload.label}」，新增 ${lorebookEntries.length} 条设定。`,
          status: "done",
        });
        setState((current) => {
          const targetRoom = current.rooms.find((room) => room.id === activeRoom.id);
          if (!targetRoom || targetRoom.locked) {
            return current;
          }

          const sceneId = getRoomActiveSceneId(targetRoom);
          const nextRoom = syncTavernRoomActiveScene({
            ...projectTavernSceneOntoRoom(targetRoom),
            lorebookEntries: [
              ...targetRoom.lorebookEntries,
              ...lorebookEntries,
            ],
            updatedAt: Date.now(),
          });
          return {
            ...current,
            rooms: current.rooms.map((room) =>
              room.id === targetRoom.id ? nextRoom : room
            ),
            messagesByScene: {
              ...current.messagesByScene,
              [sceneId]: [
                ...(current.messagesByScene[sceneId] ?? []),
                importMessage,
              ],
            },
          };
        });
        setError("");
        return null;
      }

      return "导入文件格式不受支持。";
    }

    const parsedExport = parsed as TavernRoomExportV2;
    const createdAt = Date.now();
    const roomId = createLocalId("room");
    const characterIdMap = new Map<string, string>();
    const importedCharacters = parsedExport.characters
      .flatMap((character) => {
        const name = typeof character.name === "string" ? character.name.trim() : "";
        const description = typeof character.description === "string" ? character.description.trim() : "";
        const speakingStyle = typeof character.speakingStyle === "string" ? character.speakingStyle.trim() : "";
        if (!character.id || !name || !description || !speakingStyle) {
          return [];
        }

        const nextId = createLocalId("character");
        characterIdMap.set(character.id, nextId);
        return [{
          id: nextId,
          name,
          avatar: character.avatar || tavernAvatarOptions[0]?.id || "",
          description,
          speakingStyle,
          writingStyle: character.writingStyle?.trim() || undefined,
          replyStylePrompt: character.replyStylePrompt?.trim() || undefined,
          goals: character.goals?.trim() || undefined,
          relationships: character.relationships?.trim() || undefined,
          createdAt,
          updatedAt: createdAt,
        } satisfies TavernCharacter];
      });

    if (importedCharacters.length === 0) {
      return "房间文件里没有可导入的角色。";
    }

    const importedCharacterIds = parsedExport.room.characterIds
      .flatMap((characterId) => {
        const mappedId = characterIdMap.get(characterId);
        return mappedId ? [mappedId] : [];
      });
    const characterIds = importedCharacterIds.length > 0
      ? importedCharacterIds
      : importedCharacters.map((character) => character.id);
    const activeCharacterId = characterIdMap.get(parsedExport.room.activeCharacterId) ?? characterIds[0] ?? "";
    const characterMemories = Object.fromEntries(
      Object.entries(parsedExport.room.characterMemories ?? {})
        .flatMap(([characterId, memory]) => {
          const mappedId = characterIdMap.get(characterId);
          return mappedId && typeof memory === "string" && memory.trim()
            ? [[mappedId, memory.trim()]]
            : [];
        }),
    );
    const characterConfigs = Object.fromEntries(
      parsedExport.room.characterIds.flatMap((sourceCharacterId) => {
        const mappedId = characterIdMap.get(sourceCharacterId);
        if (!mappedId) {
          return [];
        }
        return [[
          mappedId,
          {
            characterId: mappedId,
            memory: characterMemories[mappedId],
          },
        ]];
      }),
    );
    const importedTimelineEvents = (parsedExport.room.timelineEvents ?? [])
      .flatMap((event) => (
        event.title?.trim() && event.summary?.trim()
          ? [createTavernTimelineEvent({
              title: event.title,
              summary: event.summary,
            })]
          : []
      ));
    const importedLorebookEntries = (parsedExport.room.lorebookEntries ?? [])
      .flatMap((entry) => (
        entry.title?.trim() && entry.content?.trim()
          ? [createTavernLorebookEntry({
              title: entry.title,
              content: entry.content,
              keywords: Array.isArray(entry.keywords) ? entry.keywords : [],
              alwaysOn: Boolean(entry.alwaysOn),
            })]
          : []
      ));
    const importedAssetDrafts = (parsedExport.room.assetDrafts ?? [])
      .flatMap((draft) => {
        const assetDraft = createTavernAssetDraft({
          sourceMessageIds: [],
          timelineEvents: draft.timelineEvents,
          characterMemories: draft.characterMemories.flatMap((memory) => {
            const mappedId = characterIdMap.get(memory.characterId);
            return mappedId
              ? [{
                  characterId: mappedId,
                  note: memory.note,
                }]
              : [];
          }),
          lorebookEntries: draft.lorebookEntries,
        });
        return hasAssetDraftItems(assetDraft) ? [assetDraft] : [];
      });
    const importedIllustrationHints = (parsedExport.room.illustrationHints ?? [])
      .flatMap((hint) => hint.prompt?.trim()
        ? [createTavernIllustrationHint({
            prompt: hint.prompt,
            turnId: hint.turnId,
            sourceMessageIds: [],
          })]
        : []);
    const title = parsedExport.room.title?.trim() || "导入酒馆";
    const importedScene = createTavernScene({
      title: parsedExport.room.scenes?.find((scene) => scene.id === parsedExport.room.activeSceneId)?.title ?? "默认场景",
      order: 0,
      scenePresetId: normalizeVisualPresetId(parsedExport.room.scenePresetId),
      scene: parsedExport.room.scene?.trim() || "一间刚被导入的酒馆房间。",
      sceneGoal: parsedExport.room.sceneGoal?.trim() || "",
      plot: parsedExport.room.scenePlot?.trim() || "",
      storyDirection: parsedExport.room.sceneDirection?.trim() || "",
      transition: parsedExport.room.sceneTransition?.trim() || "",
      memory: parsedExport.room.memory?.trim() || "",
      characterConfigs,
      characterMemories,
      illustrationHints: importedIllustrationHints,
      assetDrafts: importedAssetDrafts.slice(0, DEFAULT_TAVERN_ROOM_SETTINGS.maxAssetDrafts),
      characterIds,
      activeCharacterId,
      createdAt,
      updatedAt: createdAt,
    });
    const importedRoom: TavernRoom = projectTavernSceneOntoRoom({
      id: roomId,
      workspaceId: workspace.id,
      title: `${title}（导入）`,
      promptStyleId: normalizeTavernPromptStyleId(parsedExport.room.promptStyleId),
      creationSource: "imported",
      storyOutline: parsedExport.room.storyOutline?.trim() || "",
      storyGoal: parsedExport.room.storyGoal?.trim() || "",
      activeSceneId: importedScene.id,
      scenes: [importedScene],
      scenePresetId: importedScene.scenePresetId,
      scene: importedScene.scene,
      sceneGoal: importedScene.sceneGoal,
      scenePlot: importedScene.plot,
      sceneDirection: importedScene.storyDirection,
      sceneTransition: importedScene.transition,
      locked: false,
      memory: importedScene.memory,
      sceneStatus: importedScene.sceneStatus,
      characterPublicStatuses: importedScene.characterPublicStatuses,
      characterPrivateStatuses: importedScene.characterPrivateStatuses,
      pendingInteractions: importedScene.pendingInteractions,
      replyOptions: importedScene.replyOptions,
      statusDefinitions: Array.isArray(parsedExport.room.statusDefinitions)
        ? parsedExport.room.statusDefinitions
        : [...DEFAULT_TAVERN_STATUS_DEFINITIONS],
      statusRules: Array.isArray(parsedExport.room.statusRules)
        ? parsedExport.room.statusRules
        : [...DEFAULT_TAVERN_STATUS_RULES],
      progressViews: Array.isArray(parsedExport.room.progressViews)
        ? parsedExport.room.progressViews
        : [...DEFAULT_TAVERN_PROGRESS_VIEWS],
      progressTracker: parsedExport.room.progressTracker ?? { ...DEFAULT_TAVERN_PROGRESS_TRACKER },
      factEvents: remapImportedFactEvents(parsedExport.room.factEvents, characterIdMap),
      statusEvents: remapImportedStatusEvents(parsedExport.room.statusEvents, characterIdMap),
      statusSnapshot: importedScene.statusSnapshot,
      previousStatusSnapshot: importedScene.previousStatusSnapshot,
      statusCheckpoints: importedScene.statusCheckpoints,
      taskDefinitions: remapImportedTaskDefinitions(parsedExport.room.taskDefinitions, characterIdMap),
      taskEvents: remapImportedTaskEvents(parsedExport.room.taskEvents, characterIdMap),
      taskSnapshot: remapImportedTaskSnapshot(parsedExport.room.taskSnapshot, characterIdMap),
      sceneOutcomes: remapImportedSceneOutcomes(parsedExport.room.sceneOutcomes, characterIdMap),
      outcomeEvents: remapImportedOutcomeEvents(parsedExport.room.outcomeEvents, characterIdMap),
      characterConfigs,
      characterMemories,
      localCharacters: importedCharacters,
      lorebookEntries: importedLorebookEntries,
      timelineEvents: importedTimelineEvents,
      illustrationHints: importedScene.illustrationHints,
      assetDrafts: importedAssetDrafts.slice(0, DEFAULT_TAVERN_ROOM_SETTINGS.maxAssetDrafts),
      characterIds,
      activeCharacterId,
      replyMode: parsedExport.room.replyMode === "round" || parsedExport.room.replyMode === "director"
        ? parsedExport.room.replyMode
        : "active",
      userPersonaName: parsedExport.room.userPersonaName?.trim() || "我",
      settings: normalizeImportedRoomSettings(parsedExport.room.settings),
      createdAt,
      updatedAt: createdAt,
    });
    const importedMessages = Array.isArray(parsedExport.messages)
      ? parsedExport.messages.flatMap((message) => {
          if (!message.content?.trim()) {
            return [];
          }

          if (message.role === "character") {
            const mappedCharacterId = message.characterId
              ? characterIdMap.get(message.characterId)
              : undefined;
            if (!mappedCharacterId) {
              return [];
            }

            return [createTavernMessage({
              roomId,
              role: "character",
              characterId: mappedCharacterId,
              content: message.content,
              status: "done",
              referencedFiles: message.referencedFiles,
            })];
          }

          return [createTavernMessage({
            roomId,
            role: message.role === "user" ? "user" : "narrator",
            content: message.content,
            status: "done",
            referencedFiles: message.referencedFiles,
          })];
        })
      : [];
    const messages = importedMessages.length > 0
      ? importedMessages
      : [
          createTavernMessage({
            roomId,
            role: "narrator",
            content: "这个房间从外部文件导入，灯光重新亮起。",
            status: "done",
          }),
        ];

    setState((current) => ({
      ...current,
      activeRoomId: roomId,
      rooms: [...current.rooms, importedRoom],
      messagesByScene: {
        ...current.messagesByScene,
        [importedScene.id]: messages,
      },
    }));
    setError("");
    return null;
  }, [workspace.id]);

  const handleCreateRoom = useCallback(() => {
    setState((current) => {
      const room = createTavernRoom(workspace.id, current.rooms.length + 1);
      const nextRoom = {
        ...room,
      };
      const openingMessage = createTavernMessage({
        roomId: nextRoom.id,
        role: "narrator",
        content: "新的桌边留出空位，灯光落在还没有写下的第一行。",
        status: "done",
      });

      return {
        ...current,
        activeRoomId: nextRoom.id,
        rooms: [...current.rooms, nextRoom],
        messagesByScene: {
          ...current.messagesByScene,
          [getRoomActiveSceneId(nextRoom)]: [openingMessage],
        },
      };
    });
  }, [workspace.id]);

  const handleQuickCreateRoom = useCallback(async (
    quickDraft: TavernGeneratedPresetAgentDraft,
  ) => {
    if (!runtimeModel) {
      return TAVERN_RUNTIME_MODEL_UNAVAILABLE;
    }

    if (!runtimeAgentId) {
      return "当前 Agent 运行时不可用，请稍后重试。";
    }

    try {
      const result = await runTavernGeneratedPresetAgent({
        workspacePath: workspace.path,
        agentId: runtimeAgentId,
        runtimeModel: requireTavernRuntimeModelInput(runtimeModel),
        draft: quickDraft,
      });
      const materialized = createTavernRoomFromGeneratedPresetJson(
        workspace.id,
        result.preset,
        {
          creationSource: "quick",
        },
      );
      setState((current) => ({
        ...current,
        activeRoomId: materialized.room.id,
        rooms: [...current.rooms, materialized.room],
        messagesByScene: {
          ...current.messagesByScene,
          [getRoomActiveSceneId(materialized.room)]: materialized.messages,
        },
      }));
      setError("");
      return null;
    } catch (quickCreateError) {
      return getErrorMessage(quickCreateError);
    }
  }, [runtimeAgentId, runtimeModel, workspace.id, workspace.path]);

  const handleRunTextFieldAgent = useCallback(async (
    request: TavernTextFieldAgentRequest,
  ) => {
    if (!runtimeModel) {
      throw new Error(TAVERN_RUNTIME_MODEL_UNAVAILABLE);
    }

    if (!runtimeAgentId) {
      throw new Error("当前 Agent 运行时不可用，请稍后重试。");
    }

    return runTavernTextFieldAgent({
      ...request,
      workspacePath: workspace.path,
      agentId: runtimeAgentId,
      runtimeModel: requireTavernRuntimeModelInput(runtimeModel),
    });
  }, [runtimeAgentId, runtimeModel, workspace.path]);

  const selectRoomScene = useCallback((roomId: string, sceneId: string) => {
    setState((current) => {
      const targetRoom = current.rooms.find((room) => room.id === roomId);
      if (!targetRoom || !targetRoom.scenes?.some((scene) => scene.id === sceneId)) {
        return current;
      }

      const nextRoom = switchTavernRoomScene(targetRoom, sceneId);
      return {
        ...current,
        rooms: current.rooms.map((room) => room.id === roomId ? nextRoom : room),
      };
    });
    setReplySuggestions([]);
    setIsQuickSummaryOpen(false);
    setQuickSummaryError("");
    setIsManagedAutoRunStarted(false);
    if (managedAutoRunTimerRef.current !== null) {
      window.clearTimeout(managedAutoRunTimerRef.current);
      managedAutoRunTimerRef.current = null;
    }
  }, []);

  const insertReference = useCallback((file: WorkspaceFileEntry) => {
    const reference = `${quoteReferencePath(file.path)} `;
    const start = activeReferenceToken?.start ?? draftCursor;
    const end = activeReferenceToken?.end ?? draftCursor;
    const nextCursor = start + reference.length;

    setDraft((current) => `${current.slice(0, start)}${reference}${current.slice(end)}`);
    setDraftCursor(nextCursor);
    window.setTimeout(() => {
      draftInputRef.current?.focus();
      draftInputRef.current?.setSelectionRange(nextCursor, nextCursor);
    }, 0);
  }, [activeReferenceToken, draftCursor]);

  const readReferencedFiles = useCallback(async (): Promise<TavernReferencedFile[]> => {
    const resources = await loadContextResources({
      references: referencedFilePreviews.map((file) => ({ path: file.path })),
      loadFile: async ({ path }) => {
        const workspaceFile = await readWorkspaceFile(workspace.path, path);
        return {
          path: workspaceFile.path,
          content: workspaceFile.content,
          updatedAt: workspaceFile.updatedAt,
        };
      },
    });
    return resources.references.map((file) => ({
      path: file.path,
      content: file.content,
    }));
  }, [referencedFilePreviews, workspace.path]);

  const extractRecentAssets = useCallback(async () => {
    if (isSending || isExtractingAssets) {
      return;
    }

    if (!runtimeModel) {
      setError("请先在设置中选择模型，再整理剧情资产。");
      return;
    }

    if (!runtimeAgentId) {
      setError("请先选择可用的 Agent 运行配置。");
      return;
    }

    if (!activeRoom || roomCharacters.length === 0) {
      setError("当前房间还没有可整理的角色。");
      return;
    }

    if (activeRoom.assetDrafts.length >= activeRoom.settings.maxAssetDrafts) {
      setError("待确认草稿已达上限，请先应用或忽略一部分草稿。");
      return;
    }

    const availableMessages = roomMessages.filter((message) =>
      message.status !== "streaming" && message.status !== "error"
    );
    const contextMessages = availableMessages.slice(-30);
    const sourceMessages = availableMessages.slice(-12);
    if (sourceMessages.length === 0) {
      setError("当前房间还没有可整理的对话。");
      return;
    }

    setIsExtractingAssets(true);
    setError("");
    if (activeRoom.settings.showExecutionTrace) {
      setExecutionTraceAnchorMessageId(roomMessages.at(-1)?.id ?? "");
      resetExecutionTrace([{
        id: "manual-asset-extraction",
        label: "整理最近对话",
        detail: "从最近对话中提取待确认剧情资产。",
        status: "running",
      }]);
    }
    try {
      const extractedDraft = await runTavernAssetExtraction({
        workspacePath: workspace.path,
        runtimeAgentId,
        runtimeModel: requireTavernRuntimeModelInput(runtimeModel),
        room: activeRoom,
        characters: roomCharacters,
        messages: contextMessages,
        sourceMessages,
        references: [],
        currentUserText: "手动整理最近对话中值得沉淀的剧情资产。",
      });
      const assetDraft = createTavernAssetDraft(extractedDraft);
      if (!hasAssetDraftItems(assetDraft)) {
        patchExecutionStep("manual-asset-extraction", {
          status: "done",
          detail: "没有发现新的稳定剧情资产。",
        });
        setError("最近对话没有整理出新的剧情资产。");
        return;
      }

      setState((current) => ({
        ...current,
        rooms: current.rooms.map((room) =>
          room.id === activeRoom.id
            ? syncTavernRoomActiveScene({
                ...projectTavernSceneOntoRoom(room),
                assetDrafts: [...projectTavernSceneOntoRoom(room).assetDrafts, assetDraft]
                  .slice(-room.settings.maxAssetDrafts),
                updatedAt: Date.now(),
              })
          : room,
        ),
      }));
      patchExecutionStep("manual-asset-extraction", {
        status: "done",
        detail: "已生成待确认草稿。",
      });
    } catch (assetError) {
      patchExecutionStep("manual-asset-extraction", {
        status: "error",
        detail: getErrorMessage(assetError),
      });
      setError(`剧情资产整理失败：${getErrorMessage(assetError)}`);
    } finally {
      setIsExtractingAssets(false);
    }
  }, [
    activeRoom,
    isExtractingAssets,
    isSending,
    patchExecutionStep,
    resetExecutionTrace,
    roomCharacters,
    roomMessages,
    runtimeModel,
    runtimeAgentId,
    workspace.path,
  ]);

  const trackRecentProgress = useCallback(async () => {
    if (isSending || isTrackingProgress) {
      return;
    }

    if (!runtimeModel) {
      setError("请先在设置中选择模型，再更新状态。");
      return;
    }

    if (!runtimeAgentId) {
      setError("请先选择可用的 Agent 运行配置。");
      return;
    }

    if (!activeRoom || roomCharacters.length === 0) {
      setError("当前房间还没有可更新状态的角色。");
      return;
    }

    if (activeRoom.statusDefinitions.length === 0 || activeRoom.statusRules.length === 0) {
      setError("当前房间还没有状态定义或状态规则。");
      return;
    }

    const availableMessages = roomMessages.filter((message) =>
      message.status !== "streaming" && message.status !== "error"
    );
    const contextMessages = availableMessages.slice(-30);
    const sourceMessages = availableMessages.slice(-12);
    if (sourceMessages.length === 0) {
      setError("当前房间还没有可更新状态的对话。");
      return;
    }

    const progressTurnId = sourceMessages.at(-1)?.turnId ?? sourceMessages.at(-1)?.id ?? `manual-${Date.now()}`;
    setIsTrackingProgress(true);
    setError("");
    if (activeRoom.settings.showExecutionTrace) {
      setExecutionTraceAnchorMessageId(sourceMessages.at(-1)?.id ?? "");
      resetExecutionTrace([{
        id: "manual-progress-tracking",
        label: "手动更新状态",
        detail: "从最近对话中抽取事实事件并应用状态规则。",
        status: "running",
      }]);
    }

    try {
      const factEvents = await runTavernProgressTracking({
        workspacePath: workspace.path,
        runtimeAgentId,
        runtimeModel: requireTavernRuntimeModelInput(runtimeModel),
        room: activeRoom,
        characters: roomCharacters,
        messages: contextMessages,
        sourceMessages,
        references: [],
        currentUserText: "手动更新最近对话中的状态、任务与结局。",
        turnId: progressTurnId,
      });

      if (factEvents.length === 0) {
        patchExecutionStep("manual-progress-tracking", {
          status: "done",
          detail: "最近对话没有明确状态事件。",
        });
        toast.info("最近对话没有明确状态事件。");
        return;
      }

      const progressPatch = advanceTavernProgressFromFactEvents({
        room: activeRoom,
        factEvents,
        turnId: progressTurnId,
        createdAt: Date.now(),
      });
      const { actionMessages, ...progressRoomPatch } = progressPatch;
      const progressedRoom = appendProgressCheckpointToRoom(
        syncTavernRoomActiveScene({
          ...projectTavernSceneOntoRoom(activeRoom),
          ...progressRoomPatch,
          updatedAt: Date.now(),
        }),
        "manual",
        progressTurnId,
      );
      patchRoom(activeRoom.id, {
        ...progressRoomPatch,
        statusCheckpoints: progressedRoom.statusCheckpoints,
        updatedAt: Date.now(),
      });
      if (actionMessages.length > 0) {
        appendMessagesToRoom(activeRoom.id, actionMessages);
      }
      patchExecutionStep("manual-progress-tracking", {
        status: "done",
        detail: `已抽取 ${factEvents.length} 个事实事件。`,
      });
      toast.success("状态面板已更新。");
    } catch (progressError) {
      patchExecutionStep("manual-progress-tracking", {
        status: "error",
        detail: getErrorMessage(progressError),
      });
      setError(`状态更新失败：${getErrorMessage(progressError)}`);
    } finally {
      setIsTrackingProgress(false);
    }
  }, [
    activeRoom,
    appendProgressCheckpointToRoom,
    appendMessagesToRoom,
    isSending,
    isTrackingProgress,
    patchExecutionStep,
    patchRoom,
    resetExecutionTrace,
    roomCharacters,
    roomMessages,
    runtimeAgentId,
    runtimeModel,
    workspace.path,
  ]);

  const rebuildProgressFromHistory = useCallback(() => {
    if (!activeRoom) {
      return;
    }

    const rebuiltProgress = rebuildTavernProgressFromHistory({
      room: activeRoom,
      createdAt: Date.now(),
    });
    const rebuiltRoom = appendProgressCheckpointToRoom(
      syncTavernRoomActiveScene({
        ...projectTavernSceneOntoRoom(activeRoom),
        ...rebuiltProgress,
        updatedAt: Date.now(),
      }),
      "rebuild",
      rebuiltProgress.statusSnapshot.turnId,
    );
    patchRoom(activeRoom.id, {
      ...rebuiltProgress,
      statusCheckpoints: rebuiltRoom.statusCheckpoints,
      updatedAt: Date.now(),
    });
    toast.success("状态面板已从 checkpoint 和事件历史重建。");
  }, [activeRoom, appendProgressCheckpointToRoom, patchRoom]);

  const resolvePendingStatusEvent = useCallback((
    statusEventId: string,
    resolution: "applied" | "rejected",
  ) => {
    if (!activeRoom) {
      return;
    }

    const progressPatch = resolveTavernPendingStatusEvent({
      room: activeRoom,
      statusEventId,
      resolution,
      createdAt: Date.now(),
    });
    if (!progressPatch) {
      setError("未找到可处理的待确认状态事件。");
      return;
    }

    const { actionMessages, ...progressRoomPatch } = progressPatch;
    const progressedRoom = appendProgressCheckpointToRoom(
      syncTavernRoomActiveScene({
        ...projectTavernSceneOntoRoom(activeRoom),
        ...progressRoomPatch,
        updatedAt: Date.now(),
      }),
      "manual",
      progressRoomPatch.statusSnapshot.turnId,
    );
    patchRoom(activeRoom.id, {
      ...progressRoomPatch,
      statusCheckpoints: progressedRoom.statusCheckpoints,
      updatedAt: Date.now(),
    });
    if (actionMessages.length > 0) {
      appendMessagesToRoom(activeRoom.id, actionMessages);
    }
    toast.success(resolution === "applied" ? "状态事件已应用。" : "状态事件已拒绝。");
  }, [activeRoom, appendMessagesToRoom, appendProgressCheckpointToRoom, patchRoom]);

  const resolvePendingOutcomeEvent = useCallback((
    outcomeEventId: string,
    resolution: "applied" | "dismissed",
  ) => {
    if (!activeRoom) {
      return;
    }

    const progressPatch = resolveTavernPendingOutcomeEvent({
      room: activeRoom,
      outcomeEventId,
      resolution,
    });
    if (!progressPatch) {
      setError("未找到可处理的待确认结局事件。");
      return;
    }

    const progressedRoom = appendProgressCheckpointToRoom(
      syncTavernRoomActiveScene({
        ...projectTavernSceneOntoRoom(activeRoom),
        ...progressPatch,
        updatedAt: Date.now(),
      }),
      "manual",
      activeRoom.statusSnapshot.turnId,
    );
    patchRoom(activeRoom.id, {
      ...progressPatch,
      statusCheckpoints: progressedRoom.statusCheckpoints,
      updatedAt: Date.now(),
    });
    toast.success(resolution === "applied" ? "结局已应用，复盘视角可用。" : "结局已忽略。");
  }, [activeRoom, appendProgressCheckpointToRoom, patchRoom]);

  const compactCharacterKnowledge = useCallback(async (characterId: string) => {
    if (!activeRoom) {
      return;
    }

    const character = roomCharacters.find((item) => item.id === characterId);
    if (!character) {
      setError("未找到要压缩知识的角色。");
      return;
    }

    if (!runtimeModel) {
      setError("请先在设置中选择模型，再压缩角色知识。");
      return;
    }

    if (!runtimeAgentId) {
      setError("请先选择可用的 Agent 运行配置。");
      return;
    }

    setCompactingCharacterIds((current) => new Set([...current, characterId]));
    setError("");
    try {
      const result = await compactTavernAgentKnowledge({
        workspacePath: workspace.path,
        room: activeRoom,
        runtimeAgentId,
        runtimeModel: requireTavernRuntimeModelInput(runtimeModel),
        agentRoleId: tavernCharacterAgentRoleId(activeRoom, character),
        compactInstruction: [
          `压缩「${character.name}」在当前酒馆中的长期角色知识。`,
          "保留角色已经知道的公开事实、自己产生过的心理与承诺、与其他角色的关系变化。",
          "不要引入其他角色未公开的心理描写。",
        ].join("\n"),
      });
      toast.success(result?.compacted === false
        ? `${character.name} 的底层 session 暂无可压缩内容。`
        : `已压缩 ${character.name} 的角色知识。`);
    } catch (compactError) {
      setError(`压缩角色知识失败：${getErrorMessage(compactError)}`);
    } finally {
      setCompactingCharacterIds((current) => {
        const next = new Set(current);
        next.delete(characterId);
        return next;
      });
    }
  }, [
    activeRoom,
    roomCharacters,
    runtimeAgentId,
    runtimeModel,
    workspace.path,
  ]);

  const handleGenerateReplySuggestions = useCallback(async () => {
    if (isSending || isGeneratingReplySuggestions) {
      return;
    }

    if (!runtimeModel) {
      setError("请先在设置中选择模型，再生成候选回复。");
      return;
    }

    if (!runtimeAgentId) {
      setError("请先选择可用的 Agent 运行配置。");
      return;
    }

    if (!activeRoom) {
      setError("当前房间还没有可生成回复的场景。");
      return;
    }

    if (!activeRoom.settings.replyOptions.enabled) {
      setError("当前房间已关闭候选回复。");
      return;
    }

    setError("");
    setIsGeneratingReplySuggestions(true);
    try {
      const suggestions = await runTavernUserReplySuggestions({
        workspacePath: workspace.path,
        runtimeAgentId,
        runtimeModel: requireTavernRuntimeModelInput(runtimeModel),
        room: activeRoom,
        characters: roomCharacters,
        messages: roomMessages,
        currentDraft: draft,
      });
      setReplySuggestions(suggestions);
      patchRoom(activeRoom.id, {
        replyOptions: suggestions,
      });
      if (suggestions.length === 0) {
        setError("暂时没有生成可用候选回复，请再试一次。");
      }
    } catch (suggestionError) {
      setError(`生成候选回复失败：${getErrorMessage(suggestionError)}`);
    } finally {
      setIsGeneratingReplySuggestions(false);
    }
  }, [
    activeRoom,
    draft,
    isGeneratingReplySuggestions,
    isSending,
    patchRoom,
    roomCharacters,
    roomMessages,
    runtimeModel,
    runtimeAgentId,
    workspace.path,
  ]);

  const handleFillReplySuggestion = useCallback((suggestion: TavernReplyOption) => {
    const nextDraft = suggestion.text.trim();
    if (!nextDraft) {
      return;
    }

    setDraft(nextDraft);
    setDraftCursor(nextDraft.length);
    setReplySuggestions([]);
    if (activeRoom) {
      patchRoom(activeRoom.id, {
        replyOptions: [],
      });
    }
    window.setTimeout(() => {
      draftInputRef.current?.focus();
      draftInputRef.current?.setSelectionRange(nextDraft.length, nextDraft.length);
    }, 0);
  }, [activeRoom, patchRoom]);

  const handleOpenQuickSummary = useCallback(async ({
    force = false,
  }: {
    force?: boolean;
  } = {}) => {
    if (!activeRoom) {
      return;
    }

    setQuickSummaryTab("summary");

    if (isGeneratingQuickSummary) {
      setIsQuickSummaryOpen(true);
      return;
    }

    if (!force && activeQuickSummaryCache?.content.trim()) {
      setQuickSummaryError("");
      setIsQuickSummaryOpen(true);
      return;
    }

    setIsQuickSummaryOpen(true);
    setQuickSummaryError("");

    if (isSending) {
      setQuickSummaryError("请等待本轮回应完成后再总结当前进展。");
      return;
    }

    if (!runtimeModel) {
      setQuickSummaryError("请先在设置中选择模型，再总结当前进展。");
      return;
    }

    if (!runtimeAgentId) {
      setQuickSummaryError("请先选择可用的 Agent 运行配置。");
      return;
    }

    const summaryMessages = roomMessages.filter((message) =>
      message.status !== "streaming" && message.content.trim()
    );
    const sceneId = getRoomActiveSceneId(activeRoom);
    const signature = quickSummarySignature;

    setIsGeneratingQuickSummary(true);
    try {
      const content = await runTavernQuickSummary({
        workspacePath: workspace.path,
        runtimeAgentId,
        runtimeModel: requireTavernRuntimeModelInput(runtimeModel),
        room: activeRoom,
        characters: roomCharacters,
        messages: summaryMessages,
      });
      setQuickSummaryCacheState((current) => ({
        workspaceId: workspace.id,
        entries: (() => {
          const currentEntries = current.workspaceId === workspace.id
            ? current.entries
            : loadQuickSummaryCache(workspace.id);

          return {
            ...currentEntries,
            [sceneId]: (() => {
              const previous = currentEntries[sceneId];
              const shouldKeepNovel = previous?.novelSignature === signature;

              return {
                sceneId,
                signature,
                content,
                generatedAt: Date.now(),
                ...(shouldKeepNovel
                  ? {
                      novelContent: previous.novelContent,
                      novelGeneratedAt: previous.novelGeneratedAt,
                      novelSignature: previous.novelSignature,
                    }
                  : {}),
              };
            })(),
          };
        })(),
      }));
    } catch (summaryError) {
      setQuickSummaryError(`总结当前进展失败：${getErrorMessage(summaryError)}`);
    } finally {
      setIsGeneratingQuickSummary(false);
    }
  }, [
    activeQuickSummaryCache,
    activeRoom,
    isGeneratingQuickSummary,
    isQuickSummaryCacheFresh,
    isSending,
    quickSummarySignature,
    roomCharacters,
    roomMessages,
    runtimeModel,
    runtimeAgentId,
    workspace.id,
    workspace.path,
  ]);

  const handleGenerateQuickNovel = useCallback(async () => {
    if (!activeRoom) {
      return;
    }

    setQuickSummaryTab("novel");

    if (isGeneratingQuickNovel) {
      setIsQuickSummaryOpen(true);
      return;
    }

    setIsQuickSummaryOpen(true);
    setQuickSummaryError("");

    if (isSending) {
      setQuickSummaryError("请等待本轮回应完成后再生成小说。");
      return;
    }

    if (!runtimeModel) {
      setQuickSummaryError("请先在设置中选择模型，再生成小说。");
      return;
    }

    if (!runtimeAgentId) {
      setQuickSummaryError("请先选择可用的 Agent 运行配置。");
      return;
    }

    const novelMessages = roomMessages.filter((message) =>
      message.status !== "streaming" && message.content.trim()
    );
    const sceneId = getRoomActiveSceneId(activeRoom);
    const signature = quickSummarySignature;

    setIsGeneratingQuickNovel(true);
    try {
      const novelContent = await runTavernQuickNovel({
        workspacePath: workspace.path,
        runtimeAgentId,
        runtimeModel: requireTavernRuntimeModelInput(runtimeModel),
        room: activeRoom,
        characters: roomCharacters,
        messages: novelMessages,
      });
      setQuickSummaryCacheState((current) => ({
        workspaceId: workspace.id,
        entries: (() => {
          const currentEntries = current.workspaceId === workspace.id
            ? current.entries
            : loadQuickSummaryCache(workspace.id);

          return {
            ...currentEntries,
            [sceneId]: (() => {
              const previous = currentEntries[sceneId];
              const shouldKeepSummary = previous?.signature === signature;

              return {
                sceneId,
                signature,
                content: shouldKeepSummary ? previous.content : "",
                generatedAt: shouldKeepSummary ? previous.generatedAt : Date.now(),
                novelContent,
                novelGeneratedAt: Date.now(),
                novelSignature: signature,
              };
            })(),
          };
        })(),
      }));
    } catch (novelError) {
      setQuickSummaryError(`生成小说失败：${getErrorMessage(novelError)}`);
    } finally {
      setIsGeneratingQuickNovel(false);
    }
  }, [
    activeRoom,
    isGeneratingQuickNovel,
    isSending,
    quickSummarySignature,
    roomCharacters,
    roomMessages,
    runtimeModel,
    runtimeAgentId,
    workspace.id,
    workspace.path,
  ]);

  const handleExportQuickNovel = useCallback(() => {
    if (!activeRoom) {
      return;
    }

    const novelContent = activeQuickSummaryCache?.novelContent?.trim() ?? "";
    if (!novelContent) {
      setQuickSummaryError("暂无小说正文可导出。");
      return;
    }

    try {
      const activeSceneTitle = activeRoom.scenes?.find((scene) =>
        scene.id === activeRoom.activeSceneId
      )?.title ?? "当前场景";
      const exportContent = createQuickNovelExportContent({
        format: quickNovelExportFormat,
        roomTitle: activeRoom.title,
        sceneTitle: activeSceneTitle,
        generatedAt: activeQuickSummaryCache?.novelGeneratedAt,
        content: novelContent,
      });
      const blob = new Blob([exportContent], {
        type: quickNovelExportFormat === "md"
          ? "text/markdown;charset=utf-8"
          : "text/plain;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
      link.href = url;
      link.download = `${sanitizeFileName(`${activeRoom.title}-${activeSceneTitle}-小说-${timestamp}`)}.${quickNovelExportFormat}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setQuickSummaryError("");
      toast.success(`已导出小说为 ${quickNovelExportFormat.toUpperCase()} 文件`);
    } catch (exportError) {
      setQuickSummaryError(`导出小说失败：${getErrorMessage(exportError)}`);
    }
  }, [
    activeQuickSummaryCache?.novelContent,
    activeQuickSummaryCache?.novelGeneratedAt,
    activeRoom,
    quickNovelExportFormat,
  ]);

  const handleSubmit = useCallback(async (
    event?: FormEvent,
    submittedText?: string,
    selectedReplyOption?: TavernReplyOption,
  ) => {
    event?.preventDefault();
    const draftText = (submittedText ?? draft).trim();
    if (isSending) {
      return;
    }

    if (!runtimeModel) {
      setError("请先在设置中选择模型，再进入酒馆对话。");
      return;
    }

    if (!runtimeAgentId) {
      setError("请先选择可用的 Agent 运行配置。");
      return;
    }

    if (!activeRoom) {
      setError("当前房间还没有可回应的角色。");
      return;
    }

    const replyMode = activeRoom.replyMode ?? "active";
    const isManagedMode = isManagedModeEnabled;
    const isDirectorLikeMode = replyMode === "director" || isManagedMode;
    if (!draftText && !isManagedMode) {
      return;
    }

    const availableRoomCharacters = orderTavernRoundSpeakers({
      room: activeRoom,
      characters: roomCharacters,
      activeCharacterId: activeCharacter?.id,
    });
    const availableActiveCharacter = activeCharacter &&
        isTavernCharacterAvailableForSpeech(activeRoom, activeCharacter)
      ? activeCharacter
      : availableRoomCharacters[0] ?? null;
    const candidateSpeakers = replyMode === "round" || isDirectorLikeMode
      ? availableRoomCharacters
      : availableActiveCharacter ? [availableActiveCharacter] : [];
    if (candidateSpeakers.length === 0) {
      setError("当前房间还没有可回应的角色。");
      return;
    }
    const candidateSpeakerModels = candidateSpeakers.map((speaker) => ({
      speaker,
      resolvedModel: resolveTavernCharacterModel({
        fallbackRuntimeModel: runtimeModel,
      }),
    }));
    const missingModelSpeaker = candidateSpeakerModels.find((item) => !item.resolvedModel);
    if (missingModelSpeaker) {
      setError(`角色 ${missingModelSpeaker.speaker.name} 还没有可用模型。`);
      return;
    }
    let speakers = candidateSpeakers;
    const requireSpeakerRuntimeModel = (speaker: TavernCharacter) => {
      const resolvedModel = resolveTavernCharacterModel({
        fallbackRuntimeModel: runtimeModel,
      });
      if (!resolvedModel) {
        throw new Error(`角色 ${speaker.name} 还没有可用模型。`);
      }
      return resolvedModel.runtimeModel;
    };

    const shouldUseDraftReferences = submittedText === undefined;
    const currentReferencedFilePreviews = shouldUseDraftReferences ? referencedFilePreviews : [];

    if (shouldUseDraftReferences && unresolvedFileReferences.length > 0) {
      setError(`未找到引用文件：${unresolvedFileReferences.map((match) => `@${match.token}`).join("、")}`);
      return;
    }

    if (shouldUseDraftReferences && ambiguousFileReferences.length > 0) {
      setError(`引用文件不唯一：${ambiguousFileReferences.map((match) => `@${match.token}`).join("、")}`);
      return;
    }

    if (isManagedMode) {
      setIsManagedAutoRunStarted(true);
    }
    setIsSending(true);
    setError("");
    setReplySuggestions([]);
    patchRoom(activeRoom.id, {
      replyOptions: [],
    });
    setTurnStatus(isManagedMode
      ? "导演正在调度你的回复..."
      : isDirectorLikeMode
      ? "导演正在接收你的消息..."
      : "正在发送消息...");

    let references: TavernReferencedFile[] = [];
    try {
      if (currentReferencedFilePreviews.length > 0) {
        setTurnStatus("正在读取引用文件...");
        references = await readReferencedFiles();
      }
    } catch (readError) {
      setError(`读取引用文件失败：${getErrorMessage(readError)}`);
      if (isManagedMode) {
        setIsManagedAutoRunStarted(false);
      }
      setIsSending(false);
      setTurnStatus("");
      return;
    }

    const referencedFiles = currentReferencedFilePreviews.map((file) => ({ path: file.path }));
    let text = draftText;
    if (isManagedMode) {
      try {
        setTurnStatus("导演正在代你生成本轮回复...");
        text = await runTavernManagedUserReply({
          workspacePath: workspace.path,
          runtimeAgentId,
          runtimeModel: requireTavernRuntimeModelInput(runtimeModel),
          room: activeRoom,
          characters: roomCharacters,
          messages: roomMessages,
          currentDraft: draftText,
        });
      } catch (managedError) {
        setError(`全托管生成回复失败：${getErrorMessage(managedError)}`);
        setIsManagedAutoRunStarted(false);
        setIsSending(false);
        setTurnStatus("");
        return;
      }

      if (!text.trim()) {
        setError("全托管没有生成可发送的回复，请重试或输入方向提示。");
        setIsManagedAutoRunStarted(false);
        setIsSending(false);
        setTurnStatus("");
        return;
      }
    }
    const userMessage = createTavernMessage({
      roomId: activeRoom.id,
      role: "user",
      content: text,
      status: "done",
      referencedFiles,
      targetCharacterIds: selectedReplyOption?.targetCharacterIds,
      respondsToInteractionIds: selectedReplyOption?.respondsToInteractionId
        ? [selectedReplyOption.respondsToInteractionId]
        : undefined,
    });
    let runtimeRoom = activeRoom;
    let runtimeMessages = [...roomMessages, userMessage];
    const turnMessages: TavernMessage[] = [userMessage];
    const shouldRunAssetExtraction = shouldAutoExtractAssets(activeRoom, runtimeMessages);
    const shouldRunProgressTracking = shouldAutoTrackProgress(activeRoom, runtimeMessages);
    const shouldShowProgressTrace = activeRoom.settings.showExecutionTrace || isDirectorLikeMode;
    let activeReplyMessage: TavernMessage | null = null;
    let activeReplyText = "";

    try {
      setTurnStatus(isDirectorLikeMode ? "导演正在准备角色状态..." : "正在准备对话...");
      if (shouldShowProgressTrace) {
        setExecutionTraceAnchorMessageId(userMessage.id);
        resetExecutionTrace([
          {
            id: "context",
            label: "准备对话",
            detail: "读取本轮用户输入与引用文件。",
            status: "running",
          },
        ]);
      } else {
        setExecutionTraceAnchorMessageId("");
        resetExecutionTrace([]);
      }
      setDraft("");
      setDraftCursor(0);
      appendMessagesToRoom(activeRoom.id, [userMessage]);

      patchExecutionStep("context", {
        status: "done",
        detail: references.length
          ? `已加载 ${references.length} 个引用文件。`
          : "已准备本轮对话。",
      });

      let directorReason = "";
      let directorNonverbalReplyIds: string[] = [];
      const turnNarratorTexts: string[] = [];
      if (isDirectorLikeMode) {
        setTurnStatus("导演正在判断本轮发言顺序...");
        appendExecutionStep({
          id: "director",
          label: "导演调度",
          detail: "导演正在判断本轮发言顺序...",
          status: "running",
        });
        const directorDecision = await runTavernDirector({
          workspacePath: workspace.path,
          runtimeAgentId,
          runtimeModel: requireTavernRuntimeModelInput(runtimeModel),
          room: runtimeRoom,
          characters: availableRoomCharacters,
          messages: turnMessages,
          references,
          currentUserText: text,
          selectedTargetCharacterIds: selectedReplyOption?.targetCharacterIds,
          maxSpeakers: isTavernFixedOrderPhase(runtimeRoom)
            ? Math.max(1, availableRoomCharacters.length)
            : Math.min(
                activeRoom.settings.directorMaxSpeakers,
                Math.max(1, roomCharacters.length),
              ),
        });
        directorNonverbalReplyIds = directorDecision.nonverbalReplyIds ?? [];
        speakers = resolveTavernScheduledSpeakers({
          room: runtimeRoom,
          availableCharacters: availableRoomCharacters,
          activeCharacterId: activeCharacter?.id,
          directorSpeakerIds: directorDecision.speakerIds,
          directorNonverbalReplyIds,
          selectedTargetCharacterIds: selectedReplyOption?.targetCharacterIds,
          currentUserText: text,
          fallbackCharacter: availableActiveCharacter,
        });
        const directedSpeakerModels = speakers.map((speaker) => ({
          speaker,
          resolvedModel: resolveTavernCharacterModel({
            fallbackRuntimeModel: runtimeModel,
          }),
        }));
        const missingDirectedModel = directedSpeakerModels.find((item) => !item.resolvedModel);
        if (missingDirectedModel) {
          throw new Error(`角色 ${missingDirectedModel.speaker.name} 还没有可用模型。`);
        }
        directorReason = directorDecision.reason ?? "";
        setTurnStatus(speakers.length > 0
          ? `导演安排 ${speakers.map((speaker) => speaker.name).join("、")} 发言。`
          : "导演仅推进公开流程。");
        patchExecutionStep("director", {
          status: "done",
          detail: speakers.length > 0
            ? speakers.map((speaker) => speaker.name).join(" -> ")
            : "仅旁白/阶段推进",
        });

        const narratorText = directorDecision.narrator?.trim();
        if (narratorText) {
          const narratorMessage = createTavernMessage({
            roomId: activeRoom.id,
            role: "narrator",
            content: narratorText,
            status: "done",
          });
          appendMessagesToRoom(activeRoom.id, [narratorMessage]);
          runtimeMessages = [...runtimeMessages, narratorMessage];
          turnMessages.push(narratorMessage);
          turnNarratorTexts.push(narratorText);
        }
        const randomEventText = directorDecision.randomEvent?.trim();
        if (randomEventText) {
          const randomEventMessage = createTavernMessage({
            roomId: activeRoom.id,
            role: "narrator",
            content: randomEventText,
            status: "done",
          });
          appendMessagesToRoom(activeRoom.id, [randomEventMessage]);
          runtimeMessages = [...runtimeMessages, randomEventMessage];
          turnMessages.push(randomEventMessage);
          turnNarratorTexts.push(randomEventText);
        }
        const ambientActionMessages = (directorDecision.ambientActions ?? [])
          .map((action) => {
            const actionText = action.action.trim();
            if (!actionText) {
              return null;
            }

            return createTavernMessage({
              roomId: activeRoom.id,
              role: "narrator",
              characterId: action.characterId,
              content: actionText,
              status: "done",
            });
          })
          .filter((message): message is TavernMessage => Boolean(message));
        if (ambientActionMessages.length > 0) {
          appendMessagesToRoom(activeRoom.id, ambientActionMessages);
          runtimeMessages = [...runtimeMessages, ...ambientActionMessages];
          turnMessages.push(...ambientActionMessages);
          turnNarratorTexts.push(...ambientActionMessages.map((message) => message.content));
        }
        const illustrationHints = activeRoom.settings.illustrationHints.enabled
          ? (directorDecision.illustrationHints ?? [])
              .map((hint) => hint.trim())
              .filter(Boolean)
              .map((prompt) => createTavernIllustrationHint({
                prompt,
                turnId: userMessage.turnId ?? userMessage.id,
                sourceMessageIds: [userMessage.id],
              }))
          : [];
        if (illustrationHints.length > 0) {
          const nextIllustrationHints = [
            ...runtimeRoom.illustrationHints,
            ...illustrationHints,
          ].slice(-TAVERN_ILLUSTRATION_HINT_LIMIT);
          runtimeRoom = syncTavernRoomActiveScene({
            ...projectTavernSceneOntoRoom(runtimeRoom),
            illustrationHints: nextIllustrationHints,
            updatedAt: Date.now(),
          });
          patchRoom(activeRoom.id, {
            illustrationHints: nextIllustrationHints,
          });
          patchExecutionStep("director", {
            status: "done",
            detail: `${speakers.length > 0 ? speakers.map((speaker) => speaker.name).join(" -> ") : "仅旁白/阶段推进"}；插图 ${illustrationHints.length} 条`,
          });
        }
      }

      let speakerQueue = speakers;
      let continuationRound = 0;
      let speakerRunIndex = 0;
      let latestPendingInteractions = activeRoom.pendingInteractions ?? [];
      let currentContinuationInteractionIds: string[] = [];
      const closedInteractionIds = new Set<string>();
      const continuationInstructionBySpeakerId = new Map<string, string>();

      while (speakerQueue.length > 0) {
        speakers = speakerQueue;
        speakerQueue = [];
        const activeContinuationInteractionIds = currentContinuationInteractionIds;
        currentContinuationInteractionIds = [];

      for (const [speakerIndex, speaker] of speakers.entries()) {
        const speakerRuntimeModel = requireSpeakerRuntimeModel(speaker);
        const currentSpeakerRunIndex = speakerRunIndex++;
        const speakerStepId = `speaker-${speaker.id}-${currentSpeakerRunIndex}`;
        const continuationInstruction = continuationInstructionBySpeakerId.get(speaker.id);
        const nonverbalReplyAllowed = canTavernCharacterUseNonverbalReply({
          room: runtimeRoom,
          characterId: speaker.id,
          selectedTargetCharacterIds: selectedReplyOption?.targetCharacterIds,
          directorNonverbalReplyIds,
          currentUserText: text,
          directorReason: [
            directorReason,
            continuationInstruction,
          ].filter(Boolean).join("\n"),
        });
        setTurnStatus(isDirectorLikeMode
          ? `${speaker.name} 正在按导演调度回应...`
          : `${speaker.name} 正在回应...`);
        appendExecutionStep({
          id: speakerStepId,
          label: `${speaker.name} 回复`,
          detail: `${speakerIndex + 1}/${speakers.length}`,
          status: "running",
        });
        const replyMessage = createTavernMessage({
          roomId: activeRoom.id,
          role: "character",
          characterId: speaker.id,
          content: "",
          status: "streaming",
          respondsToInteractionIds: activeContinuationInteractionIds.length > 0
            ? activeContinuationInteractionIds
            : undefined,
        });
        activeReplyMessage = replyMessage;
        activeReplyText = "";
        appendMessagesToRoom(activeRoom.id, [replyMessage]);

        let streamedText = "";
        const turnInstruction = buildTavernCharacterTurnInstruction({
          room: activeRoom,
          speaker,
          speakerIndex,
          speakerCount: speakers.length,
          replyMode,
          isDirectorLikeMode,
          isManagedMode,
          directorReason,
          allowNonverbalReply: nonverbalReplyAllowed,
        });
        const effectiveTurnInstruction = continuationInstruction
          ? [
              turnInstruction,
              "",
              "<continuation_instruction>",
              continuationInstruction,
              "这是一次自动续调度，只回应对应待回应事项；不要替其他角色或用户发言，回答后把控制权留给现场。",
              "</continuation_instruction>",
            ].join("\n")
          : turnInstruction;
        const handleReplyTextDelta = (delta: string) => {
          streamedText += delta;
          const streamedReply = parseTavernReplyText({
            text: streamedText,
            activeCharacter: speaker,
            characters: roomCharacters,
            userPersonaName: runtimeRoom.userPersonaName,
          });
          activeReplyText = streamedReply.content;
          patchMessage(replyMessage.id, {
            content: streamedReply.content,
            thought: streamedReply.thought,
            status: "streaming",
          });
        };

        let result = await runTavernReply({
          workspacePath: workspace.path,
          runtimeAgentId,
          runtimeModel: requireTavernRuntimeModelInput(
            speakerRuntimeModel,
          ),
          room: runtimeRoom,
          activeCharacter: speaker,
          characters: roomCharacters,
          messages: turnMessages,
          references,
          currentUserText: text,
          turnInstruction: effectiveTurnInstruction,
          allowNonverbalReply: nonverbalReplyAllowed,
          onTextDelta: handleReplyTextDelta,
        });
        let finalReply = parseTavernReplyText({
          text: result.text || streamedText,
          activeCharacter: speaker,
          characters: roomCharacters,
          userPersonaName: runtimeRoom.userPersonaName,
        });
        const isFinalReplyUsable = (reply: typeof finalReply) =>
          nonverbalReplyAllowed
            ? Boolean(reply.content.trim())
            : Boolean(reply.content.trim() && hasTavernReplyDialogueText(reply.content));

        if (!isFinalReplyUsable(finalReply)) {
          patchExecutionStep(speakerStepId, {
            status: "running",
            detail: "公开回复不完整，正在重试...",
          });
          streamedText = "";
          activeReplyText = "";
          patchMessage(replyMessage.id, {
            content: "",
            thought: undefined,
            status: "streaming",
          });
          const retryTurnInstruction = [
            effectiveTurnInstruction,
            "",
            "<retry_instruction>",
            nonverbalReplyAllowed
              ? "上一次输出没有可展示的公开动作。"
              : "上一次输出的 <reply> 为空或只有动作标注，不能作为公开回复。",
            nonverbalReplyAllowed
              ? `请重新以${speaker.name}身份输出完整 XML：<inner_thought>当前角色自己的心理短句</inner_thought><reply>*一个可被观察到的动作，不写直接对白。*</reply>。`
              : `请重新以${speaker.name}身份输出完整 XML：<inner_thought>当前角色自己的心理短句</inner_thought><reply>一句非空直接对白，可选一个动作。</reply>。`,
            nonverbalReplyAllowed
              ? "本轮允许不开口，但必须给出用户能看到的动作或神态。"
              : "不能只点头、沉默、看向某处或只写动作；如果角色只想确认，也要先说一句短对白。",
            "</retry_instruction>",
          ].filter(Boolean).join("\n");
          result = await runTavernReply({
            workspacePath: workspace.path,
            runtimeAgentId,
            runtimeModel: requireTavernRuntimeModelInput(
              speakerRuntimeModel,
            ),
            room: runtimeRoom,
            activeCharacter: speaker,
            characters: roomCharacters,
            messages: turnMessages,
            references,
            currentUserText: text,
            turnInstruction: retryTurnInstruction,
            allowNonverbalReply: nonverbalReplyAllowed,
            onTextDelta: handleReplyTextDelta,
          });
          finalReply = parseTavernReplyText({
            text: result.text || streamedText,
            activeCharacter: speaker,
            characters: roomCharacters,
            userPersonaName: runtimeRoom.userPersonaName,
          });
        }
        const finalText = nonverbalReplyAllowed
          ? (finalReply.content.trim()
              ? finalReply.content
              : `*${speaker.name}短暂沉默，没有开口。*`)
          : finalReply.content.trim() && hasTavernReplyDialogueText(finalReply.content)
          ? finalReply.content
          : "（对方短暂沉默，杯沿映着灯光。）";
        if (isNarratorEchoReply(finalText, turnNarratorTexts)) {
          removeMessage(replyMessage.id);
          patchExecutionStep(speakerStepId, {
            status: "done",
            detail: "已跳过重复旁白。",
          });
          activeReplyMessage = null;
          activeReplyText = "";
          continue;
        }
        let finalThought = finalReply.thought;
        if (!finalThought && finalText.trim()) {
          try {
            finalThought = await runTavernInnerThought({
              workspacePath: workspace.path,
              runtimeAgentId,
              runtimeModel: requireTavernRuntimeModelInput(
                speakerRuntimeModel,
              ),
              room: runtimeRoom,
              activeCharacter: speaker,
              characters: roomCharacters,
              messages: turnMessages,
              currentUserText: text,
              replyContent: finalText,
            });
          } catch {
            finalThought = undefined;
          }
        }

        const finalizedMessage: TavernMessage = {
          ...replyMessage,
          content: finalText,
          thought: finalThought,
          status: "done",
        };
        patchMessage(replyMessage.id, {
          content: finalText,
          thought: finalThought,
          status: "done",
        });
        runtimeMessages = [...runtimeMessages, finalizedMessage];
        turnMessages.push(finalizedMessage);
        patchExecutionStep(speakerStepId, {
          status: "done",
          detail: finalText.slice(0, 120),
        });
        if (shouldCompactCharacterKnowledgeAfterTurn(activeRoom, runtimeMessages, speaker.id)) {
          const compactStepId = `compact-${speaker.id}-${currentSpeakerRunIndex}`;
          setTurnStatus(`${speaker.name} 正在压缩角色知识...`);
          appendExecutionStep({
            id: compactStepId,
            label: `${speaker.name} 知识压缩`,
            detail: "达到固定轮次，调用底层压缩。",
            status: "running",
          });
          try {
            const compactResult = await compactTavernAgentKnowledge({
              workspacePath: workspace.path,
              room: activeRoom,
              runtimeAgentId,
              runtimeModel: requireTavernRuntimeModelInput(
                speakerRuntimeModel,
              ),
              agentRoleId: tavernCharacterAgentRoleId(activeRoom, speaker),
              compactInstruction: [
                `压缩「${speaker.name}」在当前酒馆中的长期角色知识。`,
                "保留角色已经知道的公开事实、自己产生过的心理与承诺、与其他角色的关系变化。",
                "不要引入其他角色未公开的心理描写。",
              ].join("\n"),
            });
            patchExecutionStep(compactStepId, {
              status: "done",
              detail: compactResult?.compacted === false
                ? "底层 session 暂无可压缩内容。"
                : "底层压缩已完成。",
            });
          } catch (compactError) {
            patchExecutionStep(compactStepId, {
              status: "error",
              detail: getErrorMessage(compactError),
            });
            setError(`压缩 ${speaker.name} 的角色知识失败：${getErrorMessage(compactError)}`);
          }
        }
        activeReplyMessage = null;
        activeReplyText = "";
      }

        latestPendingInteractions = extractTavernPendingInteractionsFromMessages({
          messages: turnMessages,
          characters: roomCharacters,
          userPersonaName: runtimeRoom.userPersonaName,
          turnId: userMessage.turnId ?? userMessage.id,
        }).filter((interaction) => !closedInteractionIds.has(interaction.id));
        const continuationPlan = activeRoom.settings.continuation.enabled &&
            !shouldSuppressTavernAutoContinuation(runtimeRoom)
          ? planTavernContinuation({
              pendingInteractions: latestPendingInteractions,
              characters: availableRoomCharacters,
              continuationRound,
              maxAutoContinuationRounds: activeRoom.settings.continuation.maxAutoContinuationRounds,
              maxSpeakersPerContinuation: activeRoom.settings.continuation.maxSpeakersPerContinuation,
              stopWhenUserTargeted: activeRoom.settings.continuation.stopWhenUserTargeted,
            })
          : {
              shouldContinue: false,
              speakerIds: [],
              interactionIds: [],
              reason: "none" as const,
            };

        if (!continuationPlan.shouldContinue) {
          break;
        }

        continuationRound += 1;
        currentContinuationInteractionIds = continuationPlan.interactionIds;
        for (const interactionId of continuationPlan.interactionIds) {
          closedInteractionIds.add(interactionId);
        }
        const interactionText = latestPendingInteractions.find((interaction) =>
          continuationPlan.interactionIds.includes(interaction.id)
        )?.text;
        speakerQueue = continuationPlan.speakerIds
          .map((characterId) => availableRoomCharacters.find((character) => character.id === characterId))
          .filter((character): character is TavernCharacter => Boolean(character));
        for (const speaker of speakerQueue) {
          continuationInstructionBySpeakerId.set(
            speaker.id,
            interactionText
              ? `回应刚才指向你的待回应事项：「${interactionText}」。`
              : "回应刚才指向你的待回应事项。",
          );
        }
        if (speakerQueue.length > 0) {
          setTurnStatus(`自动续调度 ${speakerQueue.map((speaker) => speaker.name).join("、")} 回应待回应事项...`);
          appendExecutionStep({
            id: `continuation-${continuationRound}`,
            label: "自动续调度",
            detail: speakerQueue.map((speaker) => speaker.name).join("、"),
            status: "done",
          });
        }
      }

      const openPendingInteractions = latestPendingInteractions.filter((interaction) =>
        !closedInteractionIds.has(interaction.id)
      );
      setState((current) => ({
        ...current,
        rooms: current.rooms.map((room) =>
          room.id === activeRoom.id
            ? syncTavernRoomActiveScene({
                ...projectTavernSceneOntoRoom(room),
                pendingInteractions: openPendingInteractions,
                updatedAt: Date.now(),
              })
            : room
        ),
      }));

      if (shouldRunProgressTracking) {
        setTurnStatus("正在更新状态面板...");
        if (shouldShowProgressTrace) {
          appendExecutionStep({
            id: "progress-tracking",
            label: "状态更新",
            detail: "抽取本轮事实事件并应用状态规则。",
            status: "running",
          });
        }

        try {
          const progressTurnId = userMessage.turnId ?? userMessage.id;
          const progressFactEvents = await runTavernProgressTracking({
            workspacePath: workspace.path,
            runtimeAgentId,
            runtimeModel: requireTavernRuntimeModelInput(runtimeModel),
            room: runtimeRoom,
            characters: roomCharacters,
            messages: runtimeMessages,
            sourceMessages: turnMessages,
            references,
            currentUserText: text,
            turnId: progressTurnId,
          });

          if (progressFactEvents.length > 0) {
            const progressPatch = advanceTavernProgressFromFactEvents({
              room: runtimeRoom,
              factEvents: progressFactEvents,
              turnId: progressTurnId,
              createdAt: Date.now(),
            });
            const { actionMessages, ...progressRoomPatch } = progressPatch;
            runtimeRoom = appendProgressCheckpointToRoom(
              syncTavernRoomActiveScene({
                ...projectTavernSceneOntoRoom(runtimeRoom),
                ...progressRoomPatch,
                updatedAt: Date.now(),
              }),
              "after_turn",
              progressTurnId,
            );
            setState((current) => {
              const currentRoom = current.rooms.find((room) => room.id === activeRoom.id);
              const sceneId = currentRoom ? getRoomActiveSceneId(currentRoom) : activeRoom.id;
              return {
                ...current,
                rooms: current.rooms.map((room) =>
                  room.id === activeRoom.id
                    ? appendProgressCheckpointToRoom(
                        syncTavernRoomActiveScene({
                          ...projectTavernSceneOntoRoom(room),
                          ...progressRoomPatch,
                          updatedAt: Date.now(),
                        }),
                        "after_turn",
                        progressTurnId,
                      )
                    : room
                ),
                messagesByScene: actionMessages.length > 0
                  ? {
                      ...current.messagesByScene,
                      [sceneId]: [
                        ...(current.messagesByScene[sceneId] ?? []),
                        ...actionMessages,
                      ],
                    }
                  : current.messagesByScene,
              };
            });
          }

          if (shouldShowProgressTrace) {
            patchExecutionStep("progress-tracking", {
              status: "done",
              detail: progressFactEvents.length > 0
                ? `已抽取 ${progressFactEvents.length} 个事实事件。`
                : "本轮没有明确状态事件。",
            });
          }
        } catch (progressError) {
          if (shouldShowProgressTrace) {
            patchExecutionStep("progress-tracking", {
              status: "error",
              detail: getErrorMessage(progressError),
            });
          }
          setError(`状态更新失败：${getErrorMessage(progressError)}`);
        }
      }

      if (shouldRunAssetExtraction) {
        setTurnStatus("正在整理本轮剧情资产...");
        appendExecutionStep({
          id: "asset-extraction",
          label: "整理剧情资产",
          detail: "从本轮对话提取待确认草稿。",
          status: "running",
        });
        try {
          const extractedDraft = await runTavernAssetExtraction({
            workspacePath: workspace.path,
            runtimeAgentId,
            runtimeModel: requireTavernRuntimeModelInput(runtimeModel),
            room: runtimeRoom,
            characters: roomCharacters,
            messages: runtimeMessages,
            sourceMessages: turnMessages,
            references,
            currentUserText: text,
          });
          const assetDraft = createTavernAssetDraft(extractedDraft);
          if (hasAssetDraftItems(assetDraft)) {
            setState((current) => ({
              ...current,
              rooms: current.rooms.map((room) =>
                room.id === activeRoom.id
                  ? syncTavernRoomActiveScene({
                      ...projectTavernSceneOntoRoom(room),
                      assetDrafts: [...projectTavernSceneOntoRoom(room).assetDrafts, assetDraft]
                        .slice(-room.settings.maxAssetDrafts),
                      updatedAt: Date.now(),
                    })
                  : room,
              ),
            }));
            patchExecutionStep("asset-extraction", {
              status: "done",
              detail: "已生成待确认草稿。",
            });
          } else {
            patchExecutionStep("asset-extraction", {
              status: "done",
              detail: "没有发现新的稳定剧情资产。",
            });
          }
        } catch (assetError) {
          patchExecutionStep("asset-extraction", {
            status: "error",
            detail: getErrorMessage(assetError),
          });
          setError(`剧情资产整理失败：${getErrorMessage(assetError)}`);
          if (isManagedMode) {
            setIsManagedAutoRunStarted(false);
          }
        }
      }
    } catch (runError) {
      const message = getErrorMessage(runError);
      setExecutionSteps((current) => current.map((step) =>
        step.status === "running" ? { ...step, status: "error", detail: message } : step
      ));
      if (activeReplyMessage) {
        patchMessage(activeReplyMessage.id, {
          content: activeReplyText.trim()
            ? `${activeReplyText}\n\n酒馆回应失败：${message}`
            : `酒馆回应失败：${message}`,
          status: "error",
        });
      } else {
        appendMessagesToRoom(activeRoom.id, [
          createTavernMessage({
            roomId: activeRoom.id,
            role: "narrator",
            content: `酒馆回应失败：${message}`,
            status: "error",
          }),
        ]);
      }
      setError(message);
      if (isManagedMode) {
        setIsManagedAutoRunStarted(false);
      }
    } finally {
      setIsSending(false);
      setTurnStatus("");
    }
  }, [
    activeCharacter,
    activeRoom,
    ambiguousFileReferences,
    appendMessagesToRoom,
    appendProgressCheckpointToRoom,
    draft,
    isManagedModeEnabled,
    isSending,
    patchMessage,
    patchRoom,
    removeMessage,
    runtimeModel,
    resetExecutionTrace,
    patchExecutionStep,
    appendExecutionStep,
    readReferencedFiles,
    referencedFilePreviews,
    roomCharacters,
    roomMessages,
    runtimeAgentId,
    shouldAutoExtractAssets,
    shouldAutoTrackProgress,
    shouldCompactCharacterKnowledgeAfterTurn,
    unresolvedFileReferences,
    workspace.path,
  ]);

  const handleComposerKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void handleSubmit();
    }
  }, [handleSubmit]);

  const handleToggleManagedMode = useCallback(() => {
    setIsManagedModeEnabled((current) => {
      const next = !current;
      if (!next) {
        setIsManagedAutoRunStarted(false);
        if (managedAutoRunTimerRef.current !== null) {
          window.clearTimeout(managedAutoRunTimerRef.current);
          managedAutoRunTimerRef.current = null;
        }
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (
      !isManagedModeEnabled ||
      !isManagedAutoRunStarted ||
      isSending ||
      viewMode !== "room" ||
      !activeRoom ||
      error
    ) {
      if (managedAutoRunTimerRef.current !== null) {
        window.clearTimeout(managedAutoRunTimerRef.current);
        managedAutoRunTimerRef.current = null;
      }
      return;
    }

    const lastMessage = roomMessages[roomMessages.length - 1] ?? null;
    if (
      !lastMessage ||
      lastMessage.role === "user" ||
      lastMessage.status === "streaming" ||
      lastMessage.status === "error"
    ) {
      return;
    }

    managedAutoRunTimerRef.current = window.setTimeout(() => {
      managedAutoRunTimerRef.current = null;
      void handleSubmit();
    }, 800);

    return () => {
      if (managedAutoRunTimerRef.current !== null) {
        window.clearTimeout(managedAutoRunTimerRef.current);
        managedAutoRunTimerRef.current = null;
      }
    };
  }, [
    activeRoom,
    error,
    handleSubmit,
    isManagedAutoRunStarted,
    isManagedModeEnabled,
    isSending,
    roomMessages,
    viewMode,
  ]);

  if (!activeRoom) {
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-background px-6">
        <div className="rounded-md border bg-card px-5 py-4 text-sm text-muted-foreground">
          酒馆初始化失败，请重新进入工作区。
        </div>
      </div>
    );
  }

  if (viewMode === "home") {
    return (
      <TavernManagementPage
        rooms={state.rooms}
        activeRoom={activeRoom}
        characterById={characterById}
        messagesByRoomId={messagesByRoomId}
        globalRuntimeModel={runtimeModel}
        canDeleteRoom={state.rooms.length > 1}
        onCreateRoom={handleCreateRoom}
        onQuickCreateRoom={handleQuickCreateRoom}
        onRunTextFieldAgent={handleRunTextFieldAgent}
        onSelectRoom={(roomId) => setState((current) => ({
          ...current,
          activeRoomId: roomId,
        }))}
        onOpenRoom={(roomId) => {
          setState((current) => ({
            ...current,
            activeRoomId: roomId,
          }));
          setIsSidePanelOpen(false);
          setViewMode("room");
        }}
        onPatchRoom={patchRoom}
        onCopyRoom={copyRoom}
        onRestoreSystemPresetRoom={restoreSystemPresetRoom}
        onSetRoomLocked={setRoomLocked}
        onDeleteRoom={deleteRoom}
        onClearRoomMessages={clearRoomMessages}
        onExportRoom={exportRoom}
        onImportRoom={importRoomExport}
      />
    );
  }

  const shouldShowExecutionTrace = (
    activeRoom.settings.showExecutionTrace ||
    ((activeRoom.replyMode === "director" || isManagedModeEnabled) && isSending)
  ) && executionSteps.length > 0;
  const hasExecutionTraceAnchor = shouldShowExecutionTrace && renderableRoomMessages.some((message) =>
    message.id === executionTraceAnchorMessageId
  );
  const backgroundStyle = {
    backgroundImage: `${visualPreset.tavern.backgroundOverlay}, url(${visualPreset.tavern.backgroundImage})`,
    backgroundPosition: visualPreset.tavern.backgroundPosition,
    backgroundRepeat: "no-repeat",
    backgroundSize: visualPreset.tavern.backgroundSize,
  } satisfies CSSProperties;
  const quickSummaryContent = activeQuickSummaryCache?.content ?? "";
  const quickNovelContent = activeQuickSummaryCache?.novelContent ?? "";
  const isQuickNovelFresh = Boolean(
    activeQuickSummaryCache?.novelContent?.trim() &&
    activeQuickSummaryCache.novelSignature === quickSummarySignature,
  );
  const quickSummaryDescription = activeQuickSummaryCache && quickSummaryGeneratedAtText
    ? isQuickSummaryCacheFresh
      ? `生成于 ${quickSummaryGeneratedAtText}`
      : `生成于 ${quickSummaryGeneratedAtText}，内容已有变化，可手动重新生成。`
    : isGeneratingQuickSummary
      ? "正在生成当前进展..."
      : "基于当前酒馆内容生成。";
  const quickNovelDescription = quickNovelGeneratedAtText
    ? isQuickNovelFresh
      ? `生成于 ${quickNovelGeneratedAtText}`
      : `生成于 ${quickNovelGeneratedAtText}，内容已有变化，可重新生成。`
    : "";

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-1 text-foreground",
        visualPreset.tavern.page,
      )}
    >
      <div
        className={[
          "grid h-full min-h-0 w-full grid-cols-1",
          isSidePanelOpen ? "lg:grid-cols-[minmax(0,1fr)_280px]" : "lg:grid-cols-1",
        ].join(" ")}
      >
        <main className="flex min-h-0 min-w-0 flex-col">
          <TavernHeader
            activeRoom={activeRoom}
            scenes={activeRoom.scenes ?? []}
            visualPreset={visualPreset}
            isSidePanelOpen={isSidePanelOpen}
            isGeneratingQuickSummary={isGeneratingQuickSummary}
            isManagedModeEnabled={isManagedModeEnabled}
            onBack={() => {
              setIsSidePanelOpen(false);
              setIsManagedAutoRunStarted(false);
              if (managedAutoRunTimerRef.current !== null) {
                window.clearTimeout(managedAutoRunTimerRef.current);
                managedAutoRunTimerRef.current = null;
              }
              setViewMode("home");
            }}
            onOpenQuickSummary={() => {
              void handleOpenQuickSummary();
            }}
            onSelectScene={(sceneId) => selectRoomScene(activeRoom.id, sceneId)}
            onToggleManagedMode={handleToggleManagedMode}
            onToggleSidePanel={() => setIsSidePanelOpen((current) => !current)}
          />

          {hasGlobalHeaderProgress && (
            <TavernProgressPanel
              activeRoom={activeRoom}
              roomCharacters={roomCharacters}
              activeCharacter={activeCharacter}
              placement="globalHeader"
              className="mx-auto w-full max-w-3xl px-4 py-2 sm:px-5"
            />
          )}

          <ScrollArea
            viewportRef={messageViewportRef}
            className={cn(
              "min-h-0 flex-1",
              visualPreset.tavern.scrollArea,
            )}
            style={backgroundStyle}
          >
            <div
              ref={messageListRef}
              className={cn(
                "mx-auto flex w-full flex-col gap-4 px-4 py-6 sm:px-5",
                visualPreset.tavern.messageList,
              )}
            >
              <section
                className={cn(
                  "rounded-md border px-4 py-3 sm:px-5",
                  visualPreset.tavern.sceneCard,
                )}
              >
                  <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    <span
                      className={cn(
                        "rounded-md px-2 py-1 text-xs",
                        visualPreset.tavern.sceneBadge,
                      )}
                    >
                      {visualPreset.label}
                    </span>
                    <span>{activeRoom.title}</span>
                    <span className="text-xs font-medium opacity-60">
                      {activeRoom.scenes?.find((scene) => scene.id === activeRoom.activeSceneId)?.title ??
                        "默认场景"}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 md:hidden">
                    <div className="flex items-center gap-1.5">
                      <Clapperboard className="size-4 shrink-0 opacity-70" />
                      <NativeSelect
                        value={activeRoom.activeSceneId ?? activeRoom.scenes?.[0]?.id ?? ""}
                        className="h-9 min-w-0 bg-current/5 text-xs text-current"
                        aria-label="选择场景"
                        onChange={(event) => selectRoomScene(activeRoom.id, event.target.value)}
                      >
                        {(activeRoom.scenes ?? []).map((scene) => (
                          <NativeSelectOption key={scene.id} value={scene.id}>
                            {scene.title}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </div>
                  </div>
                <TavernProgressPanel
                  activeRoom={activeRoom}
                  roomCharacters={roomCharacters}
                  activeCharacter={activeCharacter}
                  placement="sceneHeader"
                  className="mt-3"
                />
                {(activeRoom.storyOutline.trim() || activeRoom.storyGoal.trim()) && (
                  <div className="mt-3 grid gap-2 rounded-md border border-current/10 bg-current/[0.03] p-3 text-xs leading-5 opacity-75 md:grid-cols-2">
                    {activeRoom.storyOutline.trim() && (
                      <div className="whitespace-pre-wrap">
                        {activeRoom.storyOutline.trim()}
                      </div>
                    )}
                    {activeRoom.storyGoal.trim() && (
                      <div className="whitespace-pre-wrap">
                        {activeRoom.storyGoal.trim()}
                      </div>
                    )}
                  </div>
                )}
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 opacity-80">
                  {activeRoom.scene.trim() || "这个房间还没有场景描述。"}
                </p>
                {activeRoom.scenePlot.trim() && (
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 opacity-80">
                    {activeRoom.scenePlot}
                  </p>
                )}
                {activeRoom.sceneGoal.trim() && (
                  <p className="mt-2 text-xs leading-5 opacity-65">
                    {activeRoom.sceneGoal}
                  </p>
                )}
                {(activeRoom.sceneDirection.trim() || activeRoom.sceneTransition.trim()) && (
                  <div className="mt-2 grid gap-2 text-xs leading-5 opacity-65 md:grid-cols-2">
                    {activeRoom.sceneDirection.trim() && (
                      <p className="whitespace-pre-wrap">{activeRoom.sceneDirection}</p>
                    )}
                    {activeRoom.sceneTransition.trim() && (
                      <p className="whitespace-pre-wrap">{activeRoom.sceneTransition}</p>
                    )}
                  </div>
                )}
              </section>
              {renderableRoomMessages.map((message) => (
                <Fragment key={message.id}>
                  <TavernMessageRow
                    message={message}
                    room={activeRoom}
                    visualPreset={visualPreset}
                    character={message.characterId ? characterById.get(message.characterId) : null}
                    isSending={isSending}
                  />
                  {shouldShowExecutionTrace && message.id === executionTraceAnchorMessageId && (
                    <TavernExecutionTrace
                      steps={executionSteps}
                      visualPreset={visualPreset}
                      statusText={turnStatus}
                    />
                  )}
                </Fragment>
              ))}
              {shouldShowExecutionTrace && !hasExecutionTraceAnchor && (
                <TavernExecutionTrace
                  steps={executionSteps}
                  visualPreset={visualPreset}
                  statusText={turnStatus}
                />
              )}
              <div ref={messageEndRef} />
            </div>
          </ScrollArea>

          <TavernComposer
            draft={draft}
            error={error}
            isSending={isSending}
            isGeneratingReplySuggestions={isGeneratingReplySuggestions}
            replySuggestions={replySuggestions}
            visualPreset={visualPreset}
            activeCharacter={activeCharacter}
            replyMode={activeRoom.replyMode ?? "active"}
            isManagedModeEnabled={isManagedModeEnabled}
            isManagedAutoRunStarted={isManagedAutoRunStarted}
            speakerCount={roomCharacters.length}
            referencedFilePreviews={referencedFilePreviews}
            referenceSuggestions={referenceSuggestions}
            progressSlot={(
              <TavernProgressPanel
                activeRoom={activeRoom}
                roomCharacters={roomCharacters}
                activeCharacter={activeCharacter}
                placement="composerBelow"
              />
            )}
            inputRef={draftInputRef}
            onDraftChange={(value, cursor) => {
              setDraft(value);
              setDraftCursor(cursor);
            }}
            onCursorChange={setDraftCursor}
            onInsertReference={insertReference}
            onGenerateReplySuggestions={handleGenerateReplySuggestions}
            onSelectReplySuggestion={(suggestion) => {
              void handleSubmit(undefined, suggestion.text, suggestion);
            }}
            onFillReplySuggestion={handleFillReplySuggestion}
            onSubmit={(event) => {
              void handleSubmit(event);
            }}
            onKeyDown={handleComposerKeyDown}
          />
        </main>

        {isSidePanelOpen && (
          <TavernSidePanel
            activeRoom={activeRoom}
            visualPreset={visualPreset}
            activeCharacter={activeCharacter}
            roomCharacters={roomCharacters}
            isSending={isSending}
            isExtractingAssets={isExtractingAssets}
            isTrackingProgress={isTrackingProgress}
            onPatchRoom={patchRoom}
            onApplyAssetDraft={applyAssetDraft}
            onDeleteAssetDraft={deleteAssetDraft}
            onExtractRecentAssets={extractRecentAssets}
            onTrackRecentProgress={trackRecentProgress}
            onRebuildProgress={rebuildProgressFromHistory}
            onResolvePendingStatusEvent={resolvePendingStatusEvent}
            onResolvePendingOutcomeEvent={resolvePendingOutcomeEvent}
            onClearIllustrationHints={clearIllustrationHints}
            onCompactCharacterKnowledge={compactCharacterKnowledge}
            compactingCharacterIds={compactingCharacterIds}
          />
        )}
      </div>

      <Dialog open={isQuickSummaryOpen} onOpenChange={setIsQuickSummaryOpen}>
        <DialogContent
          className={cn(
            "flex max-h-[min(780px,calc(100vh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl",
            visualPreset.tavern.sidePanel,
          )}
          overlayClassName="bg-black/35 backdrop-blur-sm"
        >
          <DialogHeader
            className={cn(
              "shrink-0 border-b px-5 py-4 pr-12",
              visualPreset.tavern.header,
            )}
          >
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-md border",
                  visualPreset.tavern.headerIcon,
                )}
              >
                <Sparkles className="size-4" />
              </span>
              <div className="min-w-0">
                <DialogTitle className="truncate text-base text-current">
                  当前进展总结
                </DialogTitle>
                <DialogDescription className="mt-1 text-xs text-current opacity-65">
                  {quickSummaryDescription}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-4 text-current">
            {quickSummaryError && (
              <div className="mb-3 shrink-0 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {quickSummaryError}
              </div>
            )}
            <Tabs
              value={quickSummaryTab}
              onValueChange={(value) => setQuickSummaryTab(value === "novel" ? "novel" : "summary")}
              className="min-h-0 flex-1 overflow-hidden"
            >
              <TabsList className="grid w-full grid-cols-2 bg-current/10 text-current/65">
                <TabsTrigger value="summary">总结</TabsTrigger>
                <TabsTrigger value="novel">写作</TabsTrigger>
              </TabsList>

              <TabsContent value="summary" className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
                {quickSummaryContent ? (
                  <section
                    className={cn(
                      "rounded-md border border-current/10 bg-current/5 px-4 py-3 text-current shadow-sm",
                    )}
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-medium opacity-70">
                      <span>当前进展总结</span>
                      {quickSummaryGeneratedAtText && <span>{quickSummaryDescription}</span>}
                    </div>
                    <MarkdownContent content={quickSummaryContent} />
                  </section>
                ) : (
                  <div className="flex min-h-56 items-center justify-center rounded-md border border-current/10 bg-current/5 px-4 py-6 text-sm opacity-70">
                    {isGeneratingQuickSummary ? "正在生成当前进展..." : "暂无可显示的总结。"}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="novel" className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
                <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
                  <NativeSelect
                    size="sm"
                    value={quickNovelExportFormat}
                    className="w-24 bg-current/5 text-xs text-current"
                    aria-label="小说导出格式"
                    disabled={!quickNovelContent.trim()}
                    onChange={(event) => {
                      setQuickNovelExportFormat(event.target.value === "txt" ? "txt" : "md");
                    }}
                  >
                    <NativeSelectOption value="md">MD</NativeSelectOption>
                    <NativeSelectOption value="txt">TXT</NativeSelectOption>
                  </NativeSelect>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 border-current/20 bg-current/5 text-xs text-current hover:bg-current/10 hover:text-current focus-visible:text-current dark:hover:bg-current/10 dark:hover:text-current"
                    disabled={!quickNovelContent.trim()}
                    onClick={handleExportQuickNovel}
                  >
                    <Download className="size-3.5" />
                    导出小说
                  </Button>
                </div>
                {quickNovelContent ? (
                  <section
                    className={cn(
                      "rounded-md border border-current/10 bg-current/5 px-4 py-3 text-current shadow-sm",
                    )}
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-medium opacity-70">
                      <span>小说正文</span>
                      {quickNovelDescription && <span>{quickNovelDescription}</span>}
                    </div>
                    <MarkdownContent content={quickNovelContent} />
                  </section>
                ) : (
                  <div className="flex min-h-56 items-center justify-center rounded-md border border-current/10 bg-current/5 px-4 py-6 text-sm opacity-70">
                    {isGeneratingQuickNovel ? "正在按小说口吻写作..." : "暂无小说正文。"}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>

          <DialogFooter
            className={cn(
              "shrink-0 border-t px-5 py-4",
              visualPreset.tavern.header,
            )}
          >
            <Button
              type="button"
              variant="outline"
              className="border-current/20 bg-current/5 text-current hover:bg-current/10 hover:text-current focus-visible:text-current dark:hover:bg-current/10 dark:hover:text-current"
              disabled={isGeneratingQuickSummary || isGeneratingQuickNovel || isSending}
              onClick={() => {
                void handleOpenQuickSummary({ force: true });
              }}
            >
              <RefreshCcw className="size-4" />
              重新生成
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-current/20 bg-current/5 text-current hover:bg-current/10 hover:text-current focus-visible:text-current dark:hover:bg-current/10 dark:hover:text-current"
              disabled={isGeneratingQuickSummary || isGeneratingQuickNovel || isSending}
              onClick={() => {
                void handleGenerateQuickNovel();
              }}
            >
              <BookOpen className="size-4" />
              {isGeneratingQuickNovel ? "写作中" : quickNovelContent ? "重新写作" : "生成小说"}
            </Button>
            <Button
              type="button"
              onClick={() => setIsQuickSummaryOpen(false)}
            >
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
