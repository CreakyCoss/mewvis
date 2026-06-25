import type { CSSProperties, FormEvent, KeyboardEvent } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  getActiveReferenceToken,
  loadContextResources,
  quoteReferencePath,
  resolveFileReferenceMatches,
  summarizeReferenceMatches,
} from "@/features/ai/components/context-tools";
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
import { WindowDragRegion } from "@/components/window-drag-region";
import {
  readWorkspaceFile,
  type WorkspaceFileEntry,
} from "@/features/pages/workspace/files-api";
import { cn } from "@/lib/utils";
import {
  createDefaultTavernState,
  createTavernMessage,
  getTavernSceneInstanceDisplayTitle,
  loadTavernBranchUpstreamMemory,
  loadTavernState,
  saveTavernState,
  syncTavernRoomActiveScene,
  switchTavernRoomScene,
  switchTavernRoomSceneInstance,
} from "../storage";
import {
  getTavernPresentationProfile,
  normalizeTavernPresentation,
} from "../prompt-registry/presentation-rules";
import {
  advanceTavernProgressFromFactEvents,
  createTavernProgressCheckpoint,
  isGeneratedTavernRoleAssignmentFactEvent,
  setTavernStatusSnapshotValue,
} from "../core";
import { createTavernRenderableMessages } from "../message";
import {
  deleteTavernBridgeSession,
  disposeTavernBridgeSessionWorkers,
} from "../runtime/conversation";
import type {
  TavernFactEvent,
  TavernReferencedFile,
  TavernReplyOption,
  TavernRoom,
} from "../types";
import { runTavernUserReplySuggestions } from "../runtime/assistants";
import { runTavernDirectorRoleAssignment } from "../runtime/director";
import { uniqueFilesByPath } from "../utils";
import {
  TavernPageProvider,
  useTavernPageContext,
  type TavernPageProps,
} from "./context";
import {
  type PageNavigationHandle,
} from "./manage/context";
import { ManagementProvider } from "./manage/provider";
import { Composer } from "./room/composer";
import { ExecutionTrace } from "./room/execution-trace";
import { Header } from "./room/header";
import { ManagementPage } from "./manage";
import { ProgressPanel } from "./room/progress-panel";
import { QuickSummary, type QuickSummaryHandle } from "./room/quick-summary";
import { resolveTavernConversationRenderer } from "../message/renderers";
import { SceneBriefCard } from "./room/scene-brief-card";
import { SceneSelector } from "./room/scene-selector";
import { SidePanel, type SidePanelHandle } from "./room/side-panel";
import { submitRoomTurn } from "./room/turn/submit";

const REFERENCE_SUGGESTION_LIMIT = 8;
const TAVERN_RUNTIME_MODEL_UNAVAILABLE = "当前模型配置已不可用，请重新选择模型。";
const TAVERN_ROLE_ASSIGNMENT_OPENING_TIMEOUT_MS = 90_000;
const TAVERN_SCENE_DRIVE_AUTO_INTERVAL_MS = 900;
const TAVERN_SCENE_DRIVE_AUTO_MAX_TURNS = 20;

const requireTavernRuntimeModelInput = (runtimeModel: RuntimeModelOption) =>
  requireRuntimeModelInput(runtimeModel, TAVERN_RUNTIME_MODEL_UNAVAILABLE);

const withTavernTimeout = async <T,>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> => {
  let timeoutId: number | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  }
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

const parseTavernMemoryPreviewBlocks = (value: string) => {
  const blocks: Array<{ title?: string; content: string }> = [];
  let currentTitle: string | undefined;
  let currentLines: string[] = [];

  const pushCurrent = () => {
    const content = currentLines.join("\n").trim();
    if (content) {
      blocks.push({ title: currentTitle, content });
    }
    currentLines = [];
  };

  for (const line of value.trim().split(/\n/)) {
    const trimmedLine = line.trim();
    const titleMatch = trimmedLine.match(/^【(.+)】$/) ?? trimmedLine.match(/^##\s+(.+)$/);
    if (titleMatch) {
      pushCurrent();
      currentTitle = titleMatch[1]?.trim();
      continue;
    }

    currentLines.push(line);
  }

  pushCurrent();
  return blocks;
};

const TavernMemoryPreviewText = ({
  value,
  emptyText,
}: {
  value: string;
  emptyText: string;
}) => {
  const blocks = parseTavernMemoryPreviewBlocks(value);

  if (blocks.length === 0) {
    return <div className="mt-2 text-xs leading-5 text-muted-foreground">{emptyText}</div>;
  }

  return (
    <div className="mt-2 space-y-2">
      {blocks.map((block, index) => (
        <div key={`${block.title ?? "memory"}-${index}`} className="space-y-1">
          {block.title ? (
            <div className="text-[11px] font-medium leading-4 text-muted-foreground">
              {block.title}
            </div>
          ) : null}
          <div className="whitespace-pre-wrap break-words text-xs leading-5">
            {block.content}
          </div>
        </div>
      ))}
    </div>
  );
};

const getTavernSceneText = (value: string, fallback: string) =>
  value.trim() || fallback;

const getRoomActiveSceneInstanceId = (room: TavernRoom) =>
  room.activeSceneInstanceId ?? room.activeSceneId ?? room.scenes?.[0]?.id ?? room.id;

const getSceneDriveAutoPauseReason = (room: TavernRoom) => {
  const hasUserTargetedInteraction = room.pendingInteractions.some((interaction) =>
    interaction.status === "open" &&
    interaction.requiresResponse &&
    interaction.target.type === "user"
  );
  if (hasUserTargetedInteraction) {
    return "自动自推已暂停：有角色正在等待你的回应。";
  }

  if (room.outcomeEvents.some((event) => event.status === "applied")) {
    return "自动自推已暂停：当前场景已达成结局。";
  }

  return "";
};

export const TavernPage = ({
  workspace,
  files,
  runtimeModel,
  runtimeAgentId,
  isHomeFullscreen = false,
  initialRoomId,
  initialSceneInstanceId,
  onExitHomeFullscreen,
}: TavernPageProps) => (
  <TavernPageProvider
    workspace={workspace}
    runtimeModel={runtimeModel}
    runtimeAgentId={runtimeAgentId}
  >
    <TavernPageContent
      files={files}
      isHomeFullscreen={isHomeFullscreen}
      initialRoomId={initialRoomId}
      initialSceneInstanceId={initialSceneInstanceId}
      onExitHomeFullscreen={onExitHomeFullscreen}
    />
  </TavernPageProvider>
);

type TavernPageContentProps = Pick<
  TavernPageProps,
  "files" | "isHomeFullscreen" | "initialRoomId" | "initialSceneInstanceId" | "onExitHomeFullscreen"
>;

const TavernPageContent = ({
  files,
  isHomeFullscreen = false,
  initialRoomId,
  initialSceneInstanceId,
  onExitHomeFullscreen,
}: TavernPageContentProps) => {
  const ctx = useTavernPageContext();
  const {
    activeRoom,
    appendMessagesToRoom,
    draft,
    draftCursor,
    error,
    executionSteps,
    executionTraceAnchorMessageId,
    isGeneratingReplySuggestions,
    isManagedAutoRunStarted,
    isManagedModeEnabled,
    isSending,
    patchRoom,
    roomCharacters,
    roomMessages,
    runtimeAgentId,
    runtimeModel,
    setDraft,
    setDraftCursor,
    setError,
    setExecutionSteps,
    setExecutionTraceAnchorMessageId,
    setIsGeneratingReplySuggestions,
    setIsManagedAutoRunStarted,
    setIsManagedModeEnabled,
    setIsQuickSummaryBusy,
    setIsSending,
    setReplySuggestions,
    setState,
    setTurnStatus,
    state,
    turnStatus,
    visualPreset,
    workspace,
  } = ctx;
  const [isTavernStateHydrated, setIsTavernStateHydrated] = useState(false);
  const [viewMode, setViewMode] = useState<"home" | "room">("home");
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
  const [isSceneDriveAutoRunning, setIsSceneDriveAutoRunning] = useState(false);
  const [branchMemoryPreview, setBranchMemoryPreview] = useState<ReturnType<typeof loadTavernBranchUpstreamMemory> | null>(null);
  const workspaceIdRef = useRef(workspace.id);
  const draftInputRef = useRef<HTMLTextAreaElement | null>(null);
  const managedAutoRunTimerRef = useRef<number | null>(null);
  const sceneDriveAutoTimerRef = useRef<number | null>(null);
  const sceneDriveAutoRunCountRef = useRef(0);
  const roleAssignmentRoomIdsRef = useRef<Set<string>>(new Set());
  const roleAssignmentRunIdRef = useRef(0);
  const messageViewportRef = useRef<HTMLDivElement | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const sidePanelRef = useRef<SidePanelHandle | null>(null);
  const quickSummaryRef = useRef<QuickSummaryHandle | null>(null);
  const tavernRoomsRef = useRef<TavernRoom[]>(state.rooms);
  const tavernPage = useRef<PageNavigationHandle | null>(null);
  const initialOpenKeyRef = useRef("");

  useEffect(() => {
    tavernRoomsRef.current = state.rooms;
  }, [state.rooms]);

  useEffect(() => {
    const workspaceId = workspace.id;
    const workspacePath = workspace.path;

    return () => {
      const rooms = [
        ...new Map(
          tavernRoomsRef.current
            .filter((room) => room.workspaceId === workspaceId)
            .map((room) => [room.id, room] as const),
        ).values(),
      ];

      if (rooms.length === 0) {
        return;
      }

      void Promise.allSettled(
        rooms.map((room) => disposeTavernBridgeSessionWorkers({ workspacePath, room })),
      ).then((results) => {
        const failed = results.find(
          (result): result is PromiseRejectedResult => result.status === "rejected",
        );
        if (failed) {
          console.warn("Failed to dispose tavern bridge workers", failed.reason);
        }
      });
    };
  }, [workspace.id, workspace.path]);

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
    setIsSceneDriveAutoRunning(false);
    setBranchMemoryPreview(null);
    setIsSending(false);
    setIsGeneratingReplySuggestions(false);
    setReplySuggestions([]);
    setIsQuickSummaryBusy(false);
    setTurnStatus("");
    setExecutionSteps([]);
    setExecutionTraceAnchorMessageId("");
    if (sceneDriveAutoTimerRef.current !== null) {
      window.clearTimeout(sceneDriveAutoTimerRef.current);
      sceneDriveAutoTimerRef.current = null;
    }
    sceneDriveAutoRunCountRef.current = 0;
    roleAssignmentRoomIdsRef.current.clear();
    roleAssignmentRunIdRef.current += 1;
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
      if (sceneDriveAutoTimerRef.current !== null) {
        window.clearTimeout(sceneDriveAutoTimerRef.current);
        sceneDriveAutoTimerRef.current = null;
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
  const latestMessage = renderableRoomMessages[renderableRoomMessages.length - 1] ?? null;
  const presentationProfile = getTavernPresentationProfile(
    activeRoom?.presentation?.profileId,
  );
  const conversationRenderer = resolveTavernConversationRenderer(presentationProfile.renderStyle);
  const Conversation = conversationRenderer.Conversation;
  const hasGlobalHeaderProgress = Boolean(
    activeRoom?.progressViews.some((view) => view.placement === "globalHeader"),
  );

  useEffect(() => {
    setIsGeneratingReplySuggestions(false);
    setReplySuggestions(activeRoom?.replyOptions ?? []);
    setIsQuickSummaryBusy(false);
    setIsManagedAutoRunStarted(false);
    setIsSceneDriveAutoRunning(false);
    setBranchMemoryPreview(null);
    if (managedAutoRunTimerRef.current !== null) {
      window.clearTimeout(managedAutoRunTimerRef.current);
      managedAutoRunTimerRef.current = null;
    }
    if (sceneDriveAutoTimerRef.current !== null) {
      window.clearTimeout(sceneDriveAutoTimerRef.current);
      sceneDriveAutoTimerRef.current = null;
    }
    sceneDriveAutoRunCountRef.current = 0;
  }, [activeRoom?.id, activeRoom?.activeSceneInstanceId]);

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
    activeRoom?.activeSceneInstanceId,
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
  }, [activeRoom?.id, activeRoom?.activeSceneInstanceId, scrollMessagesToBottom, viewMode]);

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

  useEffect(() => {
    if (
      !isTavernStateHydrated ||
      viewMode !== "room" ||
      !activeRoom
    ) {
      return;
    }

    const roleAssignment = activeRoom.settings.informationPolicy.roleAssignment;
    const alreadyAssigned = activeRoom.factEvents.some(isGeneratedTavernRoleAssignmentFactEvent);
    if (
      !roleAssignment.enabled ||
      roleAssignment.strategy !== "director_random" ||
      !roleAssignment.opening.autoStart ||
      alreadyAssigned ||
      roleAssignmentRoomIdsRef.current.has(activeRoom.id) ||
      !runtimeModel ||
      !runtimeAgentId ||
      roomCharacters.length === 0
    ) {
      return;
    }

    let isCancelled = false;
    const runId = roleAssignmentRunIdRef.current + 1;
    roleAssignmentRunIdRef.current = runId;
    roleAssignmentRoomIdsRef.current.add(activeRoom.id);
    setIsSending(true);
    setError("");
    setTurnStatus("导演正在实时分配本局身份...");

    withTavernTimeout(
      runTavernDirectorRoleAssignment({
        workspacePath: workspace.path,
        runtimeAgentId,
        runtimeModel: requireTavernRuntimeModelInput(runtimeModel),
        room: activeRoom,
        characters: roomCharacters,
      }),
      TAVERN_ROLE_ASSIGNMENT_OPENING_TIMEOUT_MS,
      "导演实时分配身份超时，请重试或稍后再进入酒馆。",
    ).then((assignment) => {
      if (isCancelled || roleAssignmentRunIdRef.current !== runId) {
        return;
      }

      const createdAt = Date.now();
      const narratorMessages = [
        assignment.openingNarrator?.trim(),
        assignment.dayAnnouncement?.trim(),
      ].filter((content): content is string => Boolean(content));
      if (narratorMessages.length > 0) {
        appendMessagesToRoom(activeRoom.id, narratorMessages.map((content) =>
          createTavernMessage({
            roomId: activeRoom.id,
            role: "narrator",
            content,
            status: "done",
          })
        ));
      }

      const openingEventType = roleAssignment.opening.publicEventType.trim();
      const openingFactEvent: TavernFactEvent | null = openingEventType
        ? {
            id: `director-opening-event-${createdAt.toString(36)}`,
            turnId: assignment.factEvents[0]?.turnId ?? `director-opening-${createdAt.toString(36)}`,
            sourceMessageIds: [],
            type: openingEventType,
            target: { type: "global" },
            ...(roleAssignment.opening.publicEventValue !== undefined
              ? { value: roleAssignment.opening.publicEventValue }
              : {}),
            evidence: assignment.publicFact?.trim() ||
              assignment.dayAnnouncement?.trim() ||
              "身份分配完成，公开流程进入下一阶段。",
            confidence: 1,
            visibility: "public",
            createdAt,
          }
        : null;
      const progressPatch = advanceTavernProgressFromFactEvents({
        room: activeRoom,
        factEvents: [
          ...assignment.factEvents,
          ...(openingFactEvent ? [openingFactEvent] : []),
        ],
        turnId: openingFactEvent?.turnId ?? assignment.factEvents[0]?.turnId ?? `director-opening-${createdAt.toString(36)}`,
        createdAt,
      });
      const statusSnapshot = roleAssignment.opening.globalStatusPatches.reduce(
        (snapshot, patch) => setTavernStatusSnapshotValue(
          snapshot,
          { type: "global" },
          patch.statusId,
          patch.value,
        ),
        progressPatch.statusSnapshot,
      );

      patchRoom(activeRoom.id, {
        ...progressPatch,
        statusSnapshot,
      });
      setTurnStatus("身份已分配，按当前阶段继续。");
    }).catch((assignmentError) => {
      if (roleAssignmentRunIdRef.current !== runId) {
        return;
      }

      roleAssignmentRoomIdsRef.current.delete(activeRoom.id);
      if (!isCancelled) {
        setError(`导演实时分配身份失败：${getErrorMessage(assignmentError)}`);
        setTurnStatus("");
      }
    }).finally(() => {
      if (roleAssignmentRunIdRef.current === runId) {
        setIsSending(false);
        if (isCancelled) {
          roleAssignmentRoomIdsRef.current.delete(activeRoom.id);
          setTurnStatus("");
        }
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [
    activeRoom,
    appendMessagesToRoom,
    isTavernStateHydrated,
    patchRoom,
    roomCharacters,
    runtimeAgentId,
    runtimeModel,
    viewMode,
    workspace.path,
  ]);

  const openTavernRoom = useCallback((room: TavernRoom, sceneInstanceId?: string) => {
    setState((current) => {
      const currentRoom = current.rooms.find((item) => item.id === room.id) ?? room;
      const nextRoom = sceneInstanceId
        ? switchTavernRoomSceneInstance(currentRoom, sceneInstanceId)
        : syncTavernRoomActiveScene(currentRoom);

      return {
        ...current,
        activeRoomId: room.id,
        rooms: current.rooms.map((item) => item.id === room.id ? nextRoom : item),
      };
    });
    setIsSidePanelOpen(false);
    setViewMode("room");
  }, []);

  tavernPage.current = { open: openTavernRoom };

  useEffect(() => {
    if (!isTavernStateHydrated || !initialRoomId) {
      return;
    }

    const key = `${initialRoomId}:${initialSceneInstanceId ?? ""}`;
    if (initialOpenKeyRef.current === key) {
      return;
    }

    const room = state.rooms.find((item) => item.id === initialRoomId);
    if (!room) {
      return;
    }

    initialOpenKeyRef.current = key;
    openTavernRoom(room, initialSceneInstanceId);
  }, [
    initialRoomId,
    initialSceneInstanceId,
    isTavernStateHydrated,
    openTavernRoom,
    state.rooms,
  ]);

  const selectRoomSceneInstance = useCallback((roomId: string, sceneInstanceId: string) => {
    setState((current) => {
      const targetRoom = current.rooms.find((room) => room.id === roomId);
      if (!targetRoom) {
        return current;
      }

      const nextRoom = targetRoom.sceneInstances.some((instance) => instance.id === sceneInstanceId)
        ? switchTavernRoomSceneInstance(targetRoom, sceneInstanceId)
        : switchTavernRoomScene(targetRoom, sceneInstanceId);
      return {
        ...current,
        rooms: current.rooms.map((room) => room.id === roomId ? nextRoom : room),
      };
    });
    setReplySuggestions([]);
    setIsQuickSummaryBusy(false);
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

  const handleSubmit = useCallback(async (
    event?: FormEvent,
    submittedText?: string,
    selectedReplyOption?: TavernReplyOption,
    trigger?: { type: "user" | "scene_drive"; directive?: string },
  ) => {
    await submitRoomTurn({
      ctx,
      event,
      submittedText,
      selectedReplyOption,
      trigger,
      ambiguousFileReferences,
      readReferencedFiles,
      referencedFilePreviews,
      unresolvedFileReferences,
    });
  }, [
    ambiguousFileReferences,
    ctx,
    readReferencedFiles,
    referencedFilePreviews,
    unresolvedFileReferences,
  ]);

  const handleSceneDriveTurn = useCallback(async () => {
    await handleSubmit(undefined, undefined, undefined, {
      type: "scene_drive",
      directive: draft,
    });
  }, [draft, handleSubmit]);

  const clearSceneDriveAutoTimer = useCallback(() => {
    if (sceneDriveAutoTimerRef.current !== null) {
      window.clearTimeout(sceneDriveAutoTimerRef.current);
      sceneDriveAutoTimerRef.current = null;
    }
  }, []);

  const clearActiveSceneMessages = useCallback(async () => {
    if (!activeRoom || activeRoom.locked) {
      return;
    }

    const sceneInstanceId = getRoomActiveSceneInstanceId(activeRoom);
    const sceneTitle = getTavernSceneInstanceDisplayTitle(
      activeRoom,
      activeRoom.activeSceneInstanceId,
      "当前节点",
    );
    const confirmed = window.confirm(
      `清空当前节点「${sceneTitle}」的对话记录？系统会先保存状态检查点，再把当前节点场景实例的消息替换为一条重置提示。`,
    );
    if (!confirmed) {
      return;
    }

    try {
      await deleteTavernBridgeSession({ workspacePath: workspace.path, room: activeRoom });
    } catch (error) {
      const message = getErrorMessage(error);
      setError(`无法清理当前节点底层会话：${message}`);
      toast.error("清空当前节点失败");
      return;
    }

    const resetMessage = createTavernMessage({
      roomId: activeRoom.id,
      sceneId: activeRoom.activeSceneId,
      sceneInstanceId,
      role: "narrator",
      content: "这个节点的桌面被重新擦亮，旧谈话暂时收进抽屉。",
      status: "done",
    });

    setState((current) => {
      const currentRoom = current.rooms.find((room) => room.id === activeRoom.id);
      const currentSceneInstanceId = currentRoom
        ? getRoomActiveSceneInstanceId(currentRoom)
        : sceneInstanceId;

      return {
        ...current,
        rooms: current.rooms.map((room) => {
          if (room.id !== activeRoom.id) {
            return room;
          }

          const syncedRoom = syncTavernRoomActiveScene({
            ...room,
            updatedAt: Date.now(),
          });
          const checkpoint = createTavernProgressCheckpoint({
            room: syncedRoom,
            turnId: resetMessage.id,
            reason: "before_context_trim",
            createdAt: Date.now(),
          });
          const checkpointRoom = syncTavernRoomActiveScene({
            ...syncedRoom,
            statusCheckpoints: [...syncedRoom.statusCheckpoints, checkpoint].slice(-20),
          });
          const presentation = normalizeTavernPresentation(checkpointRoom.presentation);

          return presentation.lockedSceneId === currentSceneInstanceId
            ? {
                ...checkpointRoom,
                presentation: {
                  ...presentation,
                  lockedAt: undefined,
                  lockedSceneId: undefined,
                },
              }
            : checkpointRoom;
        }),
        messagesByInstance: {
          ...current.messagesByInstance,
          [currentSceneInstanceId]: [{
            ...resetMessage,
            sceneId: resetMessage.sceneId ?? currentRoom?.activeSceneId,
            sceneInstanceId: resetMessage.sceneInstanceId ?? currentSceneInstanceId,
          }],
        },
      };
    });
    setReplySuggestions([]);
    setIsQuickSummaryBusy(false);
    setIsManagedAutoRunStarted(false);
    setIsSceneDriveAutoRunning(false);
    if (managedAutoRunTimerRef.current !== null) {
      window.clearTimeout(managedAutoRunTimerRef.current);
      managedAutoRunTimerRef.current = null;
    }
    clearSceneDriveAutoTimer();
    sceneDriveAutoRunCountRef.current = 0;
    setError("");
    toast.success("已清空当前节点对话");
  }, [activeRoom, clearSceneDriveAutoTimer, setState, workspace.path]);

  const loadActiveBranchMemory = useCallback(() => {
    if (!activeRoom || activeRoom.locked) {
      return;
    }

    const result = loadTavernBranchUpstreamMemory(activeRoom);
    setBranchMemoryPreview(result);
  }, [activeRoom]);

  const applyBranchMemoryPreview = useCallback(() => {
    if (!activeRoom || !branchMemoryPreview) {
      return;
    }

    setState((current) => ({
      ...current,
      rooms: current.rooms.map((room) => room.id === activeRoom.id ? branchMemoryPreview.room : room),
    }));

    const characterMemoryCount = Object.values(branchMemoryPreview.characterMemories)
      .filter((memory) => memory.trim()).length;
    const sourceCount = branchMemoryPreview.sourceInstanceIds.length;
    const suffix = [
      branchMemoryPreview.sceneMemory.trim() ? "场景记忆" : "",
      characterMemoryCount > 0 ? `${characterMemoryCount} 个角色记忆` : "",
      branchMemoryPreview.revealedSecretIds.length > 0 ? `${branchMemoryPreview.revealedSecretIds.length} 个已解密秘密` : "",
    ].filter(Boolean).join("、");

    toast.success(
      sourceCount > 0
        ? `已从 ${sourceCount} 个上游节点加载${suffix || "记忆"}`
        : "当前节点没有可加载的上游记忆",
    );
    setBranchMemoryPreview(null);
  }, [activeRoom, branchMemoryPreview, setState]);

  const stopSceneDriveAuto = useCallback((statusText?: string) => {
    clearSceneDriveAutoTimer();
    sceneDriveAutoRunCountRef.current = 0;
    setIsSceneDriveAutoRunning(false);
    if (statusText) {
      setTurnStatus(statusText);
    }
  }, [clearSceneDriveAutoTimer, setTurnStatus]);

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
      if (next) {
        stopSceneDriveAuto();
      }
      if (!next) {
        setIsManagedAutoRunStarted(false);
        if (managedAutoRunTimerRef.current !== null) {
          window.clearTimeout(managedAutoRunTimerRef.current);
          managedAutoRunTimerRef.current = null;
        }
      }
      return next;
    });
  }, [stopSceneDriveAuto]);

  const handleToggleSceneDriveAuto = useCallback(() => {
    if (isSceneDriveAutoRunning) {
      stopSceneDriveAuto("自动自推已停止。");
      return;
    }

    if (isSending) {
      return;
    }

    if (!activeRoom) {
      setError("当前房间还没有可推进的场景。");
      return;
    }

    const pauseReason = getSceneDriveAutoPauseReason(activeRoom);
    if (pauseReason) {
      setTurnStatus(pauseReason);
      return;
    }

    setError("");
    setIsManagedAutoRunStarted(false);
    if (managedAutoRunTimerRef.current !== null) {
      window.clearTimeout(managedAutoRunTimerRef.current);
      managedAutoRunTimerRef.current = null;
    }
    setIsSceneDriveAutoRunning(true);
    sceneDriveAutoRunCountRef.current = 1;
    void handleSceneDriveTurn();
  }, [
    activeRoom,
    handleSceneDriveTurn,
    isSceneDriveAutoRunning,
    isSending,
    setError,
    setIsManagedAutoRunStarted,
    setTurnStatus,
    stopSceneDriveAuto,
  ]);

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

  useEffect(() => {
    if (!isSceneDriveAutoRunning) {
      clearSceneDriveAutoTimer();
      return;
    }

    if (viewMode !== "room" || !activeRoom) {
      stopSceneDriveAuto();
      return;
    }

    if (error) {
      stopSceneDriveAuto();
      return;
    }

    if (isSending) {
      clearSceneDriveAutoTimer();
      return;
    }

    const latestRoomMessage = roomMessages[roomMessages.length - 1] ?? null;
    if (latestRoomMessage?.status === "streaming") {
      return;
    }

    if (latestRoomMessage?.status === "error") {
      stopSceneDriveAuto("自动自推已暂停：上一轮回应失败。");
      return;
    }

    const pauseReason = getSceneDriveAutoPauseReason(activeRoom);
    if (pauseReason) {
      stopSceneDriveAuto(pauseReason);
      return;
    }

    if (sceneDriveAutoRunCountRef.current >= TAVERN_SCENE_DRIVE_AUTO_MAX_TURNS) {
      stopSceneDriveAuto(`自动自推已暂停：已连续推进 ${TAVERN_SCENE_DRIVE_AUTO_MAX_TURNS} 轮。`);
      return;
    }

    clearSceneDriveAutoTimer();
    sceneDriveAutoTimerRef.current = window.setTimeout(() => {
      sceneDriveAutoTimerRef.current = null;
      sceneDriveAutoRunCountRef.current += 1;
      void handleSceneDriveTurn();
    }, TAVERN_SCENE_DRIVE_AUTO_INTERVAL_MS);

    return clearSceneDriveAutoTimer;
  }, [
    activeRoom,
    clearSceneDriveAutoTimer,
    error,
    handleSceneDriveTurn,
    isSceneDriveAutoRunning,
    isSending,
    roomMessages,
    stopSceneDriveAuto,
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
    const managementPage = (
      <ManagementProvider
        workspace={workspace}
        state={state}
        setState={setState}
        onError={setError}
        onCloseActiveRoom={() => {
          setIsSidePanelOpen(false);
          setViewMode("home");
        }}
      >
        <ManagementPage
          tavernPage={tavernPage}
          onBack={isHomeFullscreen ? onExitHomeFullscreen : undefined}
        />
      </ManagementProvider>
    );

    if (isHomeFullscreen) {
      return (
        <div className="fixed inset-0 z-[45] flex h-screen min-h-0 w-screen flex-col bg-background text-foreground">
          <WindowDragRegion className="h-10 shrink-0" />
          <div className="flex min-h-0 flex-1">
            {managementPage}
          </div>
        </div>
      );
    }

    return managementPage;
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
  const activeSceneTitle = getTavernSceneInstanceDisplayTitle(
    activeRoom,
    activeRoom.activeSceneInstanceId,
  );
  const sceneInstanceOptions = activeRoom.sceneInstances.map((instance) => ({
    id: instance.id,
    label: getTavernSceneInstanceDisplayTitle(activeRoom, instance.id),
  }));
  const sceneDescription = getTavernSceneText(
    activeRoom.scene,
    "这个房间还没有场景描述。",
  );
  const sceneMechanism = getTavernSceneText(
    activeRoom.scenePlot,
    getTavernSceneText(activeRoom.storyOutline, "剧情会根据角色行动与明确事件推进。"),
  );
  const sceneGoal = getTavernSceneText(
    activeRoom.sceneGoal,
    getTavernSceneText(activeRoom.storyGoal, "完成当前场景目标。"),
  );
  const sceneEnding = getTavernSceneText(
    activeRoom.sceneTransition,
    "达成目标或触发关键条件时结算。",
  );
  const sceneBriefLines = Array.from(new Set([
    activeRoom.storyOutline.trim() || sceneDescription,
    activeRoom.storyGoal.trim() || activeRoom.sceneGoal.trim(),
  ].filter(Boolean)));
  const sceneDirectionNote = activeRoom.sceneDirection.trim();
  const sceneBriefContent = {
    themeLabel: visualPreset.label,
    title: activeRoom.title,
    sceneTitle: activeSceneTitle,
    briefLines: sceneBriefLines,
    description: sceneDescription,
    mechanism: sceneMechanism,
    goal: sceneGoal,
    ending: sceneEnding,
    footerNote: sceneDirectionNote,
  };
  const branchMemoryPreviewCharacterNameById = new Map(
    roomCharacters.map((character) => [character.id, character.name]),
  );
  const branchMemoryPreviewCharacterEntries = branchMemoryPreview
    ? Object.entries(branchMemoryPreview.characterMemories)
      .filter(([, memory]) => memory.trim())
    : [];

  return (
    <div
      className={cn(
        "fixed inset-0 z-[45] flex h-screen min-h-0 w-screen flex-1 text-foreground",
        visualPreset.tavern.page,
      )}
    >
      <div
        className={[
          "grid h-full min-h-0 w-full grid-cols-1",
          isSidePanelOpen ? "lg:grid-cols-[minmax(0,1fr)_360px]" : "lg:grid-cols-1",
        ].join(" ")}
      >
        <main className="flex min-h-0 min-w-0 flex-col">
          <Header
            isManagedModeEnabled={isManagedModeEnabled}
            isSceneDriveAutoRunning={isSceneDriveAutoRunning}
            isSidePanelOpen={isSidePanelOpen}
            onBack={() => {
              sidePanelRef.current?.hide();
              setIsManagedAutoRunStarted(false);
              setIsSceneDriveAutoRunning(false);
              if (managedAutoRunTimerRef.current !== null) {
                window.clearTimeout(managedAutoRunTimerRef.current);
                managedAutoRunTimerRef.current = null;
              }
              clearSceneDriveAutoTimer();
              sceneDriveAutoRunCountRef.current = 0;
              setViewMode("home");
            }}
            onOpenQuickSummary={() => {
              quickSummaryRef.current?.();
            }}
            onClearCurrentSceneMessages={() => {
              void clearActiveSceneMessages();
            }}
            onLoadBranchMemory={loadActiveBranchMemory}
            onSelectSceneInstance={(sceneInstanceId) =>
              selectRoomSceneInstance(activeRoom.id, sceneInstanceId)}
            onSceneDriveTurn={() => {
              void handleSceneDriveTurn();
            }}
            onToggleSceneDriveAuto={handleToggleSceneDriveAuto}
            onToggleManagedMode={handleToggleManagedMode}
            onToggleSidePanel={() => {
              sidePanelRef.current?.toggle();
            }}
          />

          {hasGlobalHeaderProgress && (
            <ProgressPanel
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
              <SceneBriefCard
                className={cn(
                  "w-full self-center",
                  isSidePanelOpen
                    ? "max-w-[44rem]"
                    : "max-w-[46rem]",
                )}
                visualPreset={visualPreset}
                content={sceneBriefContent}
                sceneSelector={(
                  <SceneSelector
                    options={sceneInstanceOptions}
                    activeValue={activeRoom.activeSceneInstanceId}
                    label="节点："
                    onSelectScene={(sceneInstanceId) =>
                      selectRoomSceneInstance(activeRoom.id, sceneInstanceId)}
                  />
                )}
                progressSlot={(
                  <ProgressPanel
                    placement="sceneHeader"
                    className="mt-2"
                  />
                )}
              />
              <Conversation
                messages={renderableRoomMessages}
                shouldShowExecutionTrace={shouldShowExecutionTrace}
                executionTraceAnchorMessageId={executionTraceAnchorMessageId}
                hasExecutionTraceAnchor={hasExecutionTraceAnchor}
                isSidePanelOpen={isSidePanelOpen}
                renderExecutionTrace={() => (
                  <ExecutionTrace
                    steps={executionSteps}
                    visualPreset={visualPreset}
                    statusText={turnStatus}
                  />
                )}
                messageEndRef={messageEndRef}
              />
            </div>
          </ScrollArea>

          <Composer
            referencedFilePreviews={referencedFilePreviews}
            referenceSuggestions={referenceSuggestions}
            progressSlot={(
              <ProgressPanel
                placement="composerBelow"
              />
            )}
            inputRef={draftInputRef}
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

        <SidePanel
          bind={sidePanelRef}
          isOpen={isSidePanelOpen}
          onOpenChange={setIsSidePanelOpen}
        />
      </div>

      <QuickSummary bind={quickSummaryRef} />
      <Dialog
        open={Boolean(branchMemoryPreview)}
        onOpenChange={(open) => {
          if (!open) {
            setBranchMemoryPreview(null);
          }
        }}
      >
        {branchMemoryPreview && (
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>加载上游记忆</DialogTitle>
              <DialogDescription>
                预览当前分支路径上游节点汇总，确认后写入当前节点实例的上游场景记忆和角色已知记忆。
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-2 text-sm sm:grid-cols-3">
              <div className="rounded-md border bg-muted/20 px-3 py-2">
                <div className="text-xs text-muted-foreground">上游节点</div>
                <div className="mt-1 font-semibold">{branchMemoryPreview.sourceInstanceIds.length}</div>
              </div>
              <div className="rounded-md border bg-muted/20 px-3 py-2">
                <div className="text-xs text-muted-foreground">角色记忆</div>
                <div className="mt-1 font-semibold">{branchMemoryPreviewCharacterEntries.length}</div>
              </div>
              <div className="rounded-md border bg-muted/20 px-3 py-2">
                <div className="text-xs text-muted-foreground">已解密秘密</div>
                <div className="mt-1 font-semibold">{branchMemoryPreview.revealedSecretIds.length}</div>
              </div>
            </div>

            <ScrollArea className="max-h-[52vh] pr-3">
              <div className="space-y-3">
                <section className="rounded-md border bg-background px-3 py-2">
                  <div className="text-xs font-medium text-muted-foreground">场景上游记忆</div>
                  <TavernMemoryPreviewText
                    value={branchMemoryPreview.sceneMemory}
                    emptyText="无可汇总场景记忆。"
                  />
                </section>
                {branchMemoryPreviewCharacterEntries.length > 0 ? (
                  branchMemoryPreviewCharacterEntries.map(([characterId, memory]) => (
                    <section key={characterId} className="rounded-md border bg-background px-3 py-2">
                      <div className="text-xs font-medium text-muted-foreground">
                        {branchMemoryPreviewCharacterNameById.get(characterId) ?? characterId}
                      </div>
                      <TavernMemoryPreviewText
                        value={memory}
                        emptyText="无可汇总角色记忆。"
                      />
                    </section>
                  ))
                ) : (
                  <section className="rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground">
                    无可汇总角色记忆。
                  </section>
                )}
              </div>
            </ScrollArea>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setBranchMemoryPreview(null)}
              >
                取消
              </Button>
              <Button
                type="button"
                onClick={applyBranchMemoryPreview}
              >
                应用记忆
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
};
