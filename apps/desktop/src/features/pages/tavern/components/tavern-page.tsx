import type { CSSProperties, FormEvent, KeyboardEvent } from "react";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { WindowDragRegion } from "@/components/window-drag-region";
import {
  readWorkspaceFile,
  type WorkspaceFileEntry,
} from "@/features/pages/workspace/files-api";
import { cn } from "@/lib/utils";
import {
  createDefaultTavernState,
  createTavernMessage,
  loadTavernState,
  saveTavernState,
  switchTavernRoomScene,
} from "../storage";
import {
  advanceTavernProgressFromFactEvents,
  createTavernRenderableMessages,
  isGeneratedTavernRoleAssignmentFactEvent,
  setTavernStatusSnapshotValue,
} from "../core";
import {
  disposeTavernBridgeSessionWorkers,
} from "../runtime/bridge-session";
import type {
  TavernFactEvent,
  TavernReferencedFile,
  TavernReplyOption,
  TavernRoom,
} from "../types";
import { runTavernUserReplySuggestions } from "../runtime/user-reply-suggestions";
import { runTavernDirectorRoleAssignment } from "../runtime/role-assignment-director";
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
import { MessageRow } from "./room/message-row";
import { ProgressPanel } from "./room/progress-panel";
import { QuickSummary, type QuickSummaryHandle } from "./room/quick-summary";
import { SceneBriefCard } from "./room/scene-brief-card";
import { SidePanel, type SidePanelHandle } from "./room/side-panel";
import { submitRoomTurn } from "./room/turn/submit";

const REFERENCE_SUGGESTION_LIMIT = 8;
const TAVERN_RUNTIME_MODEL_UNAVAILABLE = "当前模型配置已不可用，请重新选择模型。";
const TAVERN_ROLE_ASSIGNMENT_OPENING_TIMEOUT_MS = 90_000;

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

const getTavernSceneText = (value: string, fallback: string) =>
  value.trim() || fallback;

export const TavernPage = ({
  workspace,
  files,
  runtimeModel,
  runtimeAgentId,
  isHomeFullscreen = false,
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
      onExitHomeFullscreen={onExitHomeFullscreen}
    />
  </TavernPageProvider>
);

type TavernPageContentProps = Pick<
  TavernPageProps,
  "files" | "isHomeFullscreen" | "onExitHomeFullscreen"
>;

const TavernPageContent = ({
  files,
  isHomeFullscreen = false,
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
  const workspaceIdRef = useRef(workspace.id);
  const draftInputRef = useRef<HTMLTextAreaElement | null>(null);
  const managedAutoRunTimerRef = useRef<number | null>(null);
  const roleAssignmentRoomIdsRef = useRef<Set<string>>(new Set());
  const roleAssignmentRunIdRef = useRef(0);
  const messageViewportRef = useRef<HTMLDivElement | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const sidePanelRef = useRef<SidePanelHandle | null>(null);
  const quickSummaryRef = useRef<QuickSummaryHandle | null>(null);
  const tavernRoomsRef = useRef<TavernRoom[]>(state.rooms);
  const tavernPage = useRef<PageNavigationHandle | null>(null);

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
    setIsSending(false);
    setIsGeneratingReplySuggestions(false);
    setReplySuggestions([]);
    setIsQuickSummaryBusy(false);
    setTurnStatus("");
    setExecutionSteps([]);
    setExecutionTraceAnchorMessageId("");
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
  const hasGlobalHeaderProgress = Boolean(
    activeRoom?.progressViews.some((view) => view.placement === "globalHeader"),
  );

  useEffect(() => {
    setIsGeneratingReplySuggestions(false);
    setReplySuggestions(activeRoom?.replyOptions ?? []);
    setIsQuickSummaryBusy(false);
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

  const openTavernRoom = useCallback((room: TavernRoom) => {
    setState((current) => ({
      ...current,
      activeRoomId: room.id,
    }));
    setIsSidePanelOpen(false);
    setViewMode("room");
  }, []);

  tavernPage.current = { open: openTavernRoom };

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
  ) => {
    await submitRoomTurn({
      ctx,
      event,
      submittedText,
      selectedReplyOption,
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
  const activeSceneTitle = activeRoom.scenes?.find((scene) => scene.id === activeRoom.activeSceneId)?.title ??
    "默认场景";
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
            isSidePanelOpen={isSidePanelOpen}
            onBack={() => {
              sidePanelRef.current?.hide();
              setIsManagedAutoRunStarted(false);
              if (managedAutoRunTimerRef.current !== null) {
                window.clearTimeout(managedAutoRunTimerRef.current);
                managedAutoRunTimerRef.current = null;
              }
              setViewMode("home");
            }}
            onOpenQuickSummary={() => {
              quickSummaryRef.current?.();
            }}
            onSelectScene={(sceneId) => selectRoomScene(activeRoom.id, sceneId)}
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
                  "self-center",
                  isSidePanelOpen
                    ? "lg:w-[min(calc(100vw-400px),56rem)]"
                    : "md:w-[min(calc(100vw-2.5rem),56rem)]",
                )}
                visualPreset={visualPreset}
                content={sceneBriefContent}
                sceneSelector={(
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
                )}
                progressSlot={(
                  <ProgressPanel
                    placement="sceneHeader"
                    className="mt-3"
                  />
                )}
              />
              {renderableRoomMessages.map((message) => (
                <Fragment key={message.id}>
                  <MessageRow
                    message={message}
                  />
                  {shouldShowExecutionTrace && message.id === executionTraceAnchorMessageId && (
                    <ExecutionTrace
                      steps={executionSteps}
                      visualPreset={visualPreset}
                      statusText={turnStatus}
                    />
                  )}
                </Fragment>
              ))}
              {shouldShowExecutionTrace && !hasExecutionTraceAnchor && (
                <ExecutionTrace
                  steps={executionSteps}
                  visualPreset={visualPreset}
                  statusText={turnStatus}
                />
              )}
              <div ref={messageEndRef} />
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
    </div>
  );
};
