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
import {
  createTavernAssetDraft,
  createDefaultTavernState,
  createTavernLorebookEntry,
  createTavernMessage,
  createTavernRoomFromSystemPreset,
  createTavernRoom,
  createTavernScene,
  createTavernTimelineEvent,
  DEFAULT_TAVERN_ROOM_SETTINGS,
  getTavernSystemPreset,
  loadTavernState,
  projectTavernSceneOntoRoom,
  saveTavernState,
  switchTavernRoomScene,
  syncTavernRoomActiveScene,
} from "../storage";
import type {
  TavernAssetDraft,
  TavernCharacter,
  TavernMessage,
  TavernReferencedFile,
  TavernRoom,
  TavernScene,
  TavernRoomSettings,
  TavernState,
} from "../types";
import { runTavernInnerThought, runTavernReply } from "../runtime/tavern-runner";
import { runTavernDirector } from "../runtime/director";
import { runTavernAssetExtraction } from "../runtime/asset-extractor";
import { resolveTavernCharacterModel } from "../runtime/model-selection";
import { parseTavernReplyText } from "../runtime/reply-cleanup";
import { runTavernQuickNovel, runTavernQuickSummary } from "../runtime/quick-summary";
import {
  runTavernManagedUserReply,
  runTavernUserReplySuggestions,
} from "../runtime/user-reply-suggestions";
import { uniqueFilesByPath } from "../utils";
import { TavernComposer } from "./tavern-composer";
import {
  TavernExecutionTrace,
  type TavernExecutionStep,
} from "./tavern-execution-trace";
import { TavernHeader } from "./tavern-header";
import { TavernManagementPage } from "./tavern-management-page";
import { TavernMessageRow } from "./tavern-message-row";
import { TavernSidePanel } from "./tavern-side-panel";

const REFERENCE_SUGGESTION_LIMIT = 8;
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

const narratorEnvironmentSubjectPattern =
  /^(?:热汤机|噪声|灯(?:光)?|门|舱门|舷窗|屏幕|频道|频段|补给站|酒馆|吧台|圆桌|空气|风|雨|雾|雪|火(?:盆)?|钟|影子|光线|冷藏柜|地板|墙面|舰桥|船舱|走廊|大厅|房间|窗外|门外|夜色|沉默|广播|警报|引擎|电流|蒸汽|纸页|档案|木匣|牌面|杯沿|灯火|炉火|水汽|寒意|潮气|金属|机器|系统|环境)/;
const narratorEnvironmentMotionPattern =
  /(?:压低|沉下|低沉|回荡|响起|停住|晃动|闪烁|亮起|暗下|落下|浮出|渗出|掠过|侧耳|屏息|等待|安静|静了|静下来)/;
const characterIntentPattern =
  /(?:我|你|您|咱|需要|知道|认为|确定|确认|决定|可以|不能|不会|必须|别|请|问|答|说|记得|退场|授权|失踪|航线|结局|核心|流程)/;
const characterBodyActionPattern =
  /(?:指下|手|掌|袖口|胸口|眼|嘴角|肩|背|脚|步|抬|放|抽出|摸|推|拿|递|看|笑|皱眉|点头|摇头)/;

const isLikelyNarratorOnlyCharacterMessage = (
  message: TavernMessage,
  characters: TavernCharacter[],
  userPersonaName: string,
) => {
  if (
    message.role !== "character" ||
    message.status === "streaming" ||
    message.status === "error"
  ) {
    return false;
  }

  const content = message.content.trim();
  if (
    content.length < 8 ||
    content.length > 90 ||
    content.includes("\n") ||
    /[?？]/.test(content) ||
    /[*_`]/.test(content)
  ) {
    return false;
  }

  const labels = [
    userPersonaName,
    ...characters.map((character) => character.name),
  ].map((label) => label.trim()).filter(Boolean);
  if (labels.some((label) => content.includes(label))) {
    return false;
  }

  if (
    characterIntentPattern.test(content) ||
    characterBodyActionPattern.test(content)
  ) {
    return false;
  }

  return narratorEnvironmentSubjectPattern.test(content) &&
    narratorEnvironmentMotionPattern.test(content);
};

const toNarratorMessage = (message: TavernMessage): TavernMessage => {
  const { characterId: _characterId, ...messageWithoutCharacter } = message;

  return {
    ...messageWithoutCharacter,
    role: "narrator",
  };
};

const normalizeTavernMessagesForDisplay = (
  messages: TavernMessage[],
  characters: TavernCharacter[],
  userPersonaName: string,
) => {
  const turnNarratorTexts: string[] = [];

  return messages.flatMap((message) => {
    if (message.role === "user") {
      turnNarratorTexts.length = 0;
      return [message];
    }

    if (message.role === "narrator") {
      turnNarratorTexts.push(message.content);
      return [message];
    }

    if (isNarratorEchoReply(message.content, turnNarratorTexts)) {
      return [];
    }

    if (isLikelyNarratorOnlyCharacterMessage(message, characters, userPersonaName)) {
      const narratorMessage = toNarratorMessage(message);
      turnNarratorTexts.push(narratorMessage.content);
      return [narratorMessage];
    }

    return [message];
  });
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

const orderRoundCharacters = (
  characters: TavernCharacter[],
  activeCharacterId?: string,
) => {
  if (!activeCharacterId) {
    return characters;
  }

  const activeIndex = characters.findIndex((character) => character.id === activeCharacterId);
  if (activeIndex <= 0) {
    return characters;
  }

  return [
    ...characters.slice(activeIndex),
    ...characters.slice(0, activeIndex),
  ];
};

const invalidateRoomAutoMemory = (room: TavernRoom): TavernRoom => ({
  ...syncTavernRoomActiveScene({
    ...room,
    autoMemory: "",
    autoMemoryUpdatedAt: undefined,
    summarizedMessageIds: [],
    updatedAt: Date.now(),
  }),
});

const hasAssetDraftItems = (draft: TavernAssetDraft) =>
  draft.timelineEvents.some((event) => event.title.trim() && event.summary.trim()) ||
  draft.characterMemories.some((memory) => memory.characterId.trim() && memory.note.trim()) ||
  draft.lorebookEntries.some((entry) => entry.title.trim() && entry.content.trim());

const confirmDangerousAction = (message: string, secondMessage: string) =>
  window.confirm(message) && window.confirm(secondMessage);

type TavernRoomExportV1 = {
  schema: typeof TAVERN_ROOM_EXPORT_SCHEMA;
  version: 1;
  exportedAt: string;
  room: TavernRoom;
  characters: TavernCharacter[];
  messages: TavernMessage[];
  messagesByScene?: Record<string, TavernMessage[]>;
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
  state: Pick<TavernState, "messagesByRoom" | "messagesByScene">,
) => {
  const sceneId = getRoomActiveSceneId(room);
  return state.messagesByScene?.[sceneId] ?? state.messagesByRoom[room.id] ?? [];
};

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
  autoMemory: room.autoMemory,
  autoMemoryUpdatedAt: room.autoMemoryUpdatedAt ?? null,
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
  };
};

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
  const [isGeneratingReplySuggestions, setIsGeneratingReplySuggestions] = useState(false);
  const [replySuggestions, setReplySuggestions] = useState<string[]>([]);
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
      ? normalizeTavernMessagesForDisplay(
          getSceneMessages(activeRoom, state),
          roomCharacters,
          activeRoom.userPersonaName,
        )
      : []
  ), [activeRoom, roomCharacters, state]);
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
  const latestMessage = roomMessages[roomMessages.length - 1] ?? null;
  const activeCharacter = useMemo(() => (
    roomCharacters.find((character) => character.id === activeRoom?.activeCharacterId)
      ?? roomCharacters[0]
      ?? null
  ), [activeRoom?.activeCharacterId, roomCharacters]);

  useEffect(() => {
    setIsGeneratingReplySuggestions(false);
    setReplySuggestions([]);
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
    roomMessages.length,
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

      const sceneId = getRoomActiveSceneId(patchedRoom);
      return {
        ...current,
        rooms: nextRooms,
        messagesByRoom: {
          ...current.messagesByRoom,
          [roomId]: current.messagesByScene?.[sceneId] ?? current.messagesByRoom[roomId] ?? [],
        },
      };
    });
  }, []);

  const appendMessagesToRoom = useCallback((roomId: string, messages: TavernMessage[]) => {
    setState((current) => {
      const room = current.rooms.find((item) => item.id === roomId);
      const sceneId = room ? getRoomActiveSceneId(room) : roomId;
      const nextSceneMessages = [
        ...(current.messagesByScene?.[sceneId] ?? current.messagesByRoom[roomId] ?? []),
        ...messages,
      ];

      return {
        ...current,
        rooms: current.rooms.map((room) =>
          room.id === roomId ? { ...room, updatedAt: Date.now() } : room,
        ),
        messagesByRoom: {
          ...current.messagesByRoom,
          [roomId]: nextSceneMessages,
        },
        messagesByScene: {
          ...(current.messagesByScene ?? {}),
          [sceneId]: nextSceneMessages,
        },
      };
    });
  }, []);

  const patchMessage = useCallback((messageId: string, patch: Partial<TavernMessage>) => {
    setState((current) => {
      let patchedSceneId = "";
      const sourceMessagesByScene = current.messagesByScene ?? {};
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
      const patchedRoom = current.rooms.find((room) => getRoomActiveSceneId(room) === patchedSceneId);

      return {
        ...current,
        messagesByRoom: patchedRoom
          ? {
              ...current.messagesByRoom,
              [patchedRoom.id]: nextMessagesByScene[patchedSceneId] ?? [],
            }
          : current.messagesByRoom,
        messagesByScene: nextMessagesByScene,
      };
    });
  }, []);

  const removeMessage = useCallback((messageId: string) => {
    setState((current) => {
      let removedSceneId = "";
      const sourceMessagesByScene = current.messagesByScene ?? {};
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
        messagesByRoom: removedRoom
          ? {
              ...current.messagesByRoom,
              [removedRoom.id]: nextMessagesByScene[removedSceneId] ?? [],
            }
          : current.messagesByRoom,
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
    setState((current) => ({
      ...current,
      rooms: current.rooms.map((room) =>
        room.id === targetRoom.id ? invalidateRoomAutoMemory(room) : room,
      ),
      messagesByRoom: {
        ...current.messagesByRoom,
        [targetRoom.id]: [resetMessage],
      },
      messagesByScene: {
        ...(current.messagesByScene ?? {}),
        [sceneId]: [resetMessage],
      },
    }));
  }, [state.rooms]);

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
      const nextMessagesByRoom = { ...current.messagesByRoom };
      const nextMessagesByScene = { ...(current.messagesByScene ?? {}) };
      delete nextMessagesByRoom[roomId];
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
        messagesByRoom: nextMessagesByRoom,
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
        const sourceMessages = current.messagesByScene?.[scene.id] ??
          (scene.id === sourceRoom.activeSceneId ? current.messagesByRoom[sourceRoom.id] : []) ??
          [];
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
        messagesByRoom: {
          ...current.messagesByRoom,
          [copiedRoomId]: copiedMessagesByScene[activeSceneId] ?? [],
        },
        messagesByScene: {
          ...(current.messagesByScene ?? {}),
          ...copiedMessagesByScene,
        },
      };
    });
    setError("");
  }, [workspace.id]);

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
        messagesByRoom: {
          ...current.messagesByRoom,
          [sourceRoom.id]: restored.messages,
        },
        messagesByScene: {
          ...(current.messagesByScene ?? {}),
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
          state.messagesByScene?.[scene.id] ??
            (scene.id === projectedTargetRoom.activeSceneId ? targetMessages : []),
        ]),
      );
      const payload: TavernRoomExportV1 = {
        schema: TAVERN_ROOM_EXPORT_SCHEMA,
        version: 1,
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
    let parsed: TavernRoomExportV1;
    try {
      parsed = JSON.parse(raw) as TavernRoomExportV1;
    } catch {
      return "房间文件不是有效 JSON。";
    }

    if (
      parsed.schema !== TAVERN_ROOM_EXPORT_SCHEMA ||
      parsed.version !== 1 ||
      !parsed.room ||
      !Array.isArray(parsed.characters)
    ) {
      return "房间文件格式不受支持。";
    }

    const createdAt = Date.now();
    const roomId = createLocalId("room");
    const characterIdMap = new Map<string, string>();
    const importedCharacters = parsed.characters
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
          goals: character.goals?.trim() || undefined,
          relationships: character.relationships?.trim() || undefined,
          createdAt,
          updatedAt: createdAt,
        } satisfies TavernCharacter];
      });

    if (importedCharacters.length === 0) {
      return "房间文件里没有可导入的角色。";
    }

    const importedCharacterIds = parsed.room.characterIds
      .flatMap((characterId) => {
        const mappedId = characterIdMap.get(characterId);
        return mappedId ? [mappedId] : [];
      });
    const characterIds = importedCharacterIds.length > 0
      ? importedCharacterIds
      : importedCharacters.map((character) => character.id);
    const activeCharacterId = characterIdMap.get(parsed.room.activeCharacterId) ?? characterIds[0] ?? "";
    const characterMemories = Object.fromEntries(
      Object.entries(parsed.room.characterMemories ?? {})
        .flatMap(([characterId, memory]) => {
          const mappedId = characterIdMap.get(characterId);
          return mappedId && typeof memory === "string" && memory.trim()
            ? [[mappedId, memory.trim()]]
            : [];
        }),
    );
    const characterConfigs = Object.fromEntries(
      parsed.room.characterIds.flatMap((sourceCharacterId) => {
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
    const importedTimelineEvents = (parsed.room.timelineEvents ?? [])
      .flatMap((event) => (
        event.title?.trim() && event.summary?.trim()
          ? [createTavernTimelineEvent({
              title: event.title,
              summary: event.summary,
            })]
          : []
      ));
    const importedLorebookEntries = (parsed.room.lorebookEntries ?? [])
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
    const importedAssetDrafts = (parsed.room.assetDrafts ?? [])
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
    const title = parsed.room.title?.trim() || "导入酒馆";
    const importedScene = createTavernScene({
      title: parsed.room.scenes?.find((scene) => scene.id === parsed.room.activeSceneId)?.title ?? "默认场景",
      order: 0,
      scenePresetId: normalizeVisualPresetId(parsed.room.scenePresetId),
      scene: parsed.room.scene?.trim() || "一间刚被导入的酒馆房间。",
      sceneGoal: parsed.room.sceneGoal?.trim() || "",
      plot: parsed.room.scenePlot?.trim() || "",
      storyDirection: parsed.room.sceneDirection?.trim() || "",
      transition: parsed.room.sceneTransition?.trim() || "",
      memory: parsed.room.memory?.trim() || "",
      autoMemory: parsed.room.autoMemory?.trim() || "",
      autoMemoryUpdatedAt: typeof parsed.room.autoMemoryUpdatedAt === "number"
        ? parsed.room.autoMemoryUpdatedAt
        : undefined,
      summarizedMessageIds: [],
      characterConfigs,
      characterMemories,
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
      storyOutline: parsed.room.storyOutline?.trim() || "",
      storyGoal: parsed.room.storyGoal?.trim() || "",
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
      autoMemory: importedScene.autoMemory,
      autoMemoryUpdatedAt: importedScene.autoMemoryUpdatedAt,
      summarizedMessageIds: [],
      characterConfigs,
      characterMemories,
      localCharacters: importedCharacters,
      lorebookEntries: importedLorebookEntries,
      timelineEvents: importedTimelineEvents,
      assetDrafts: importedAssetDrafts.slice(0, DEFAULT_TAVERN_ROOM_SETTINGS.maxAssetDrafts),
      characterIds,
      activeCharacterId,
      replyMode: parsed.room.replyMode === "round" || parsed.room.replyMode === "director"
        ? parsed.room.replyMode
        : "active",
      userPersonaName: parsed.room.userPersonaName?.trim() || "我",
      settings: normalizeImportedRoomSettings(parsed.room.settings),
      createdAt,
      updatedAt: createdAt,
    });
    const importedMessages = Array.isArray(parsed.messages)
      ? parsed.messages.flatMap((message) => {
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
      messagesByRoom: {
        ...current.messagesByRoom,
        [roomId]: messages,
      },
      messagesByScene: {
        ...(current.messagesByScene ?? {}),
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
        messagesByRoom: {
          ...current.messagesByRoom,
          [nextRoom.id]: [openingMessage],
        },
        messagesByScene: {
          ...(current.messagesByScene ?? {}),
          [getRoomActiveSceneId(nextRoom)]: [openingMessage],
        },
      };
    });
  }, [workspace.id]);

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
        messagesByRoom: {
          ...current.messagesByRoom,
          [roomId]: current.messagesByScene?.[sceneId] ?? [],
        },
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
    workspace.id,
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

    setError("");
    setIsGeneratingReplySuggestions(true);
    try {
      const suggestions = await runTavernUserReplySuggestions({
        runtimeAgentId,
        runtimeModel: requireTavernRuntimeModelInput(runtimeModel),
        room: activeRoom,
        characters: roomCharacters,
        messages: roomMessages,
        currentDraft: draft,
      });
      setReplySuggestions(suggestions);
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
    roomCharacters,
    roomMessages,
    runtimeModel,
    runtimeAgentId,
    workspace.id,
  ]);

  const handleFillReplySuggestion = useCallback((suggestion: string) => {
    const nextDraft = suggestion.trim();
    if (!nextDraft) {
      return;
    }

    setDraft(nextDraft);
    setDraftCursor(nextDraft.length);
    setReplySuggestions([]);
    window.setTimeout(() => {
      draftInputRef.current?.focus();
      draftInputRef.current?.setSelectionRange(nextDraft.length, nextDraft.length);
    }, 0);
  }, []);

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

  const handleSubmit = useCallback(async (event?: FormEvent, submittedText?: string) => {
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

    const candidateSpeakers = replyMode === "round" || isDirectorLikeMode
      ? orderRoundCharacters(roomCharacters, activeCharacter?.id)
      : activeCharacter ? [activeCharacter] : [];
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
    let resolvedSpeakerModels = candidateSpeakerModels.map((item) => item.resolvedModel!);

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
    });
    let runtimeRoom = activeRoom;
    let runtimeMessages = [...roomMessages, userMessage];
    const turnMessages: TavernMessage[] = [userMessage];
    const shouldRunAssetExtraction = shouldAutoExtractAssets(activeRoom, runtimeMessages);
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
          runtimeAgentId,
          runtimeModel: requireTavernRuntimeModelInput(runtimeModel),
          room: runtimeRoom,
          characters: roomCharacters,
          messages: runtimeMessages,
          references,
          currentUserText: text,
          maxSpeakers: Math.min(
            activeRoom.settings.directorMaxSpeakers,
            Math.max(1, roomCharacters.length),
          ),
        });
        const characterById = new Map(roomCharacters.map((character) => [character.id, character]));
        const directedSpeakers = directorDecision.speakerIds
          .map((characterId) => characterById.get(characterId))
          .filter((character): character is TavernCharacter => Boolean(character));
        speakers = directedSpeakers.length > 0
          ? directedSpeakers
          : activeCharacter ? [activeCharacter] : roomCharacters.slice(0, 1);
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
        resolvedSpeakerModels = directedSpeakerModels.map((item) => item.resolvedModel!);
        directorReason = directorDecision.reason ?? "";
        setTurnStatus(`导演安排 ${speakers.map((speaker) => speaker.name).join("、")} 发言。`);
        patchExecutionStep("director", {
          status: "done",
          detail: speakers.map((speaker) => speaker.name).join(" -> "),
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
      }

      for (const [speakerIndex, speaker] of speakers.entries()) {
        const speakerStepId = `speaker-${speaker.id}-${speakerIndex}`;
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
        });
        activeReplyMessage = replyMessage;
        activeReplyText = "";
        appendMessagesToRoom(activeRoom.id, [replyMessage]);

        let streamedText = "";
        const replyFormatInstruction =
          "必须按 <inner_thought>心理想法</inner_thought> 和 <reply>公开回复正文</reply> 输出，两个标签都不能省略；心理想法只写当前角色没有说出口的短句，不要替用户或其他角色写心理；公开回复必须符合当前角色口吻。";
        const replyPerspectiveInstruction =
          `公开回复必须以${speaker.name}直接说出口的话为主，不要写第三人称小说正文；对白不要包在引号里，也不要写“他说/声音很轻/似乎后悔”等作者叙述。动作标注最多 1 段，必须用 Markdown 单星号独立成段，且只能写可观察小动作。`;
        const ownReplyInstruction = activeRoom.settings.immersiveDescriptionEnabled !== false
          ? `${replyFormatInstruction}\n${replyPerspectiveInstruction}\n只输出当前角色自己的公开发言和可选短动作标注；不要复述旁白或环境转场，不要替其他角色总结或行动。`
          : `${replyFormatInstruction}\n${replyPerspectiveInstruction}\n只输出你自己的回应，不要替其他角色总结或行动；动作、神态和场景互动只在必要时简短使用，不要刻意使用斜体描写。`;
        const turnInstruction = replyMode === "round"
          ? [
              `这是全员轮流回应的第 ${speakerIndex + 1}/${speakers.length} 位。`,
              speakerIndex === 0
                ? "你先回应用户，给后续角色留下可承接的信息。"
                : "前面角色已经回应，请承接他们的信息，不要重复复述。",
              ownReplyInstruction,
              "不要输出任何角色名加冒号的发言人标签。",
            ].join("\n")
          : isDirectorLikeMode
            ? [
                `${isManagedMode ? "全托管导演" : "导演调度"}选择你作为第 ${speakerIndex + 1}/${speakers.length} 位发言者。`,
                directorReason ? `导演意图：${directorReason}` : "",
                speakerIndex === 0
                  ? "回应用户输入，并顺着当前场景目标推进。"
                  : "前面角色已经回应，请承接他们的信息，不要重复复述。",
                ownReplyInstruction,
                "不要输出任何角色名加冒号的发言人标签。",
              ].filter(Boolean).join("\n")
            : undefined;

        const result = await runTavernReply({
          runtimeAgentId,
          runtimeModel: requireTavernRuntimeModelInput(
            resolvedSpeakerModels[speakerIndex].runtimeModel,
          ),
          room: runtimeRoom,
          activeCharacter: speaker,
          characters: roomCharacters,
          messages: runtimeMessages,
          references,
          currentUserText: text,
          turnInstruction,
          onTextDelta: (delta) => {
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
          },
        });
        const finalReply = parseTavernReplyText({
          text: result.text || streamedText,
          activeCharacter: speaker,
          characters: roomCharacters,
          userPersonaName: runtimeRoom.userPersonaName,
        });
        const finalText = finalReply.content || "（对方短暂沉默，杯沿映着灯光。）";
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
              runtimeAgentId,
              runtimeModel: requireTavernRuntimeModelInput(
                resolvedSpeakerModels[speakerIndex].runtimeModel,
              ),
              room: runtimeRoom,
              activeCharacter: speaker,
              characters: roomCharacters,
              messages: runtimeMessages,
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
        activeReplyMessage = null;
        activeReplyText = "";
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
    draft,
    isManagedModeEnabled,
    isSending,
    patchMessage,
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
    unresolvedFileReferences,
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
        messagesByRoom={state.messagesByRoom}
        globalRuntimeModel={runtimeModel}
        canDeleteRoom={state.rooms.length > 1}
        onCreateRoom={handleCreateRoom}
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
  const hasExecutionTraceAnchor = shouldShowExecutionTrace && roomMessages.some((message) =>
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
          isSidePanelOpen ? "lg:grid-cols-[minmax(0,1fr)_324px]" : "lg:grid-cols-1",
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
              {roomMessages.map((message) => (
                <Fragment key={message.id}>
                  <TavernMessageRow
                    message={message}
                    room={activeRoom}
                    visualPreset={visualPreset}
                    character={message.characterId ? characterById.get(message.characterId) : null}
                    characters={roomCharacters}
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
            inputRef={draftInputRef}
            onDraftChange={(value, cursor) => {
              setDraft(value);
              setDraftCursor(cursor);
            }}
            onCursorChange={setDraftCursor}
            onInsertReference={insertReference}
            onGenerateReplySuggestions={handleGenerateReplySuggestions}
            onSelectReplySuggestion={(suggestion) => {
              void handleSubmit(undefined, suggestion);
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
            onPatchRoom={patchRoom}
            onApplyAssetDraft={applyAssetDraft}
            onDeleteAssetDraft={deleteAssetDraft}
            onExtractRecentAssets={extractRecentAssets}
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
