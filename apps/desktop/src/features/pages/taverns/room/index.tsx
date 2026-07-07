import type { TavernRoomSessionState, TavernRuntimeRoom as TavernRoom } from "@/features/pages/taverns/room/model";
import type { CSSProperties, Ref } from "react";
import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useLlmSettingsStore } from "@/features/pages/settings/llm/store";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { WindowDragRegion } from "@/components/window-drag-region";
import { listWorkspaceFiles, type WorkspaceFileEntry } from "@/features/pages/workspace/files-api";
import type { Workspace } from "@/features/pages/workspace/types";
import { cn } from "@/lib/utils";
import {
  syncTavernRoomActiveScene,
  switchTavernRoomScene,
  switchTavernRoomSceneInstance,
} from "../tavern/runtime/active-scene-runtime";
import { createTavernMessage } from "./message";
import { getTavernSceneInstanceDisplayTitle } from "../tavern/runtime/scene-selectors";
import type { TavernRuntimeScope } from "../storage";
import { getTavernPresentationProfile } from "../tavern/prompt-registry/presentation-rules";
import { createTavernRenderableMessages } from "./message";
import { deleteTavernBridgeSession } from "../tavern/runtime/conversation";
import type { TavernMessage } from "../tavern/types";
import {
  Composer,
  createEmptyComposerSubmitPayload,
  type ComposerHandle,
  type ComposerSubmitPayload,
} from "./composer";
import { createIdleTavernRoomBusyState, isTavernRoomBusy, useTavernRoomContext } from "./context";
import { Header } from "./header";
import { resolveTavernConversationRenderer } from "./message/renderers";
import { SceneBriefCard } from "./scene-brief-card";
import { SceneSelector } from "./scene-selector";
import { SidePanel, type SidePanelHandle } from "./side-panel";
import { loadTavernRoomSessionState, saveTavernRoomSessionState } from "./storage";
import { submitRoomTurn } from "./turn/submit";

const TAVERN_SCENE_DRIVE_AUTO_INTERVAL_MS = 900;
const TAVERN_SCENE_DRIVE_AUTO_MAX_TURNS = 20;
const fullScreenDialogContentClassName =
  "!fixed !inset-0 !left-0 !top-0 !flex !h-screen !max-h-none !w-screen !max-w-none !translate-x-0 !translate-y-0 flex-col gap-0 overflow-hidden !rounded-none p-0 !ring-0";

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "未知错误";
};

const getTavernSceneText = (value: string, fallback: string) => value.trim() || fallback;

const getSceneDriveAutoPauseReason = (room: TavernRoom) => {
  const hasUserTargetedInteraction = room.pendingInteractions.some(
    (interaction) =>
      interaction.status === "open" && interaction.requiresResponse && interaction.target.type === "user",
  );
  if (hasUserTargetedInteraction) {
    return "自动自推已暂停：有角色正在等待你的回应。";
  }

  return "";
};

export type TavernRoomOpenOptions = {
  workspace: Workspace;
  runtimeScope?: TavernRuntimeScope;
  room: TavernRoom;
  initialMessages?: TavernMessage[];
  sceneInstanceId?: string;
  onClose?: () => void;
};

export type TavernRoomHandle = (options: TavernRoomOpenOptions) => void;

type TavernRoomDialogProps = {
  bind: Ref<TavernRoomHandle>;
};

const createTavernRoomInitialState = ({
  room,
  initialMessages = [],
  sceneInstanceId,
}: {
  room: TavernRoom;
  initialMessages?: TavernMessage[];
  sceneInstanceId?: string;
}) => {
  const nextRoom = sceneInstanceId
    ? switchTavernRoomSceneInstance(room, sceneInstanceId)
    : syncTavernRoomActiveScene(room);
  const messages = initialMessages.map((message) => ({
    ...message,
    roomId: message.roomId || nextRoom.id,
    status: message.status === "streaming" ? ("done" as const) : message.status,
  }));

  return {
    room: nextRoom,
    messages,
  } satisfies TavernRoomSessionState;
};

const getSessionStateRoom = (state: TavernRoomSessionState, roomId?: string) =>
  state.room && (!roomId || state.room.id === roomId) ? state.room : null;

const replaceSessionStateRoom = (state: TavernRoomSessionState, room: TavernRoom): TavernRoomSessionState => ({
  ...state,
  room,
});

export const TavernRoomDialog = ({ bind }: TavernRoomDialogProps) => {
  const [openOptions, setOpenOptions] = useState<TavernRoomOpenOptions | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isTavernStateHydrated, setIsTavernStateHydrated] = useState(false);
  const runtimeModels = useLlmSettingsStore((store) => store.runtimeModels);
  const loadSettings = useLlmSettingsStore((store) => store.loadSettings);
  const runtimeModel = runtimeModels[0] ?? null;
  const [files, setFiles] = useState<WorkspaceFileEntry[]>([]);
  const workspace = useTavernRoomContext((store) => store.workspace);
  const roomState = useTavernRoomContext((store) => store.state);
  const setRoomState = useTavernRoomContext((store) => store.setState);
  const resetRoomStore = useTavernRoomContext((store) => store.resetRoomStore);
  const setRuntimeModel = useTavernRoomContext((store) => store.setRuntimeModel);
  const error = useTavernRoomContext((store) => store.error);
  const setError = useTavernRoomContext((store) => store.setError);
  const busy = useTavernRoomContext((store) => store.busy);
  const setBusy = useTavernRoomContext((store) => store.setBusy);
  const setBusyStatus = useTavernRoomContext((store) => store.setBusyStatus);
  const activeRoom = useTavernRoomContext((store) => store.activeRoom);
  const visualPreset = useTavernRoomContext((store) => store.visualPreset);
  const roomCharacters = useTavernRoomContext((store) => store.roomCharacters);
  const roomMessages = useTavernRoomContext((store) => store.roomMessages);
  const isBusy = isTavernRoomBusy(busy);
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
  const [isSceneDriveAutoRunning, setIsSceneDriveAutoRunning] = useState(false);
  const composerRef = useRef<ComposerHandle | null>(null);
  const sceneDriveAutoTimerRef = useRef<number | null>(null);
  const sceneDriveAutoRunCountRef = useRef(0);
  const messageViewportRef = useRef<HTMLDivElement | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const sidePanelRef = useRef<SidePanelHandle | null>(null);
  const openRequestIdRef = useRef(0);

  const open = useCallback(
    (options: TavernRoomOpenOptions) => {
      openRequestIdRef.current += 1;
      setOpenOptions(options);
      resetRoomStore({
        workspace: options.workspace,
        runtimeModel,
        initialRoom: options.room,
      });
      setIsOpen(true);
      setIsTavernStateHydrated(false);
      setIsSidePanelOpen(false);
      setIsSceneDriveAutoRunning(false);
      sceneDriveAutoRunCountRef.current = 0;
      if (sceneDriveAutoTimerRef.current !== null) {
        window.clearTimeout(sceneDriveAutoTimerRef.current);
        sceneDriveAutoTimerRef.current = null;
      }
    },
    [resetRoomStore, runtimeModel],
  );

  useImperativeHandle(bind, () => open, [bind, open]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    setRuntimeModel(runtimeModel);
  }, [runtimeModel, setRuntimeModel]);

  useEffect(() => {
    if (!openOptions) {
      return;
    }

    let isCancelled = false;
    const requestId = openRequestIdRef.current;
    setIsTavernStateHydrated(false);

    const nextState = createTavernRoomInitialState({
      room: openOptions.room,
      initialMessages: openOptions.initialMessages,
      sceneInstanceId: openOptions.sceneInstanceId,
    });

    void loadTavernRoomSessionState(openOptions.workspace.path, openOptions.runtimeScope, nextState)
      .then((sessionState) => {
        if (isCancelled || requestId !== openRequestIdRef.current) {
          return;
        }

        setRoomState(sessionState ?? nextState);
        setIsTavernStateHydrated(true);
      })
      .catch((loadError) => {
        if (isCancelled || requestId !== openRequestIdRef.current) {
          return;
        }

        console.error("Failed to load tavern room session state", loadError);
        setRoomState(
          createTavernRoomInitialState({
            room: openOptions.room,
            initialMessages: openOptions.initialMessages,
            sceneInstanceId: openOptions.sceneInstanceId,
          }),
        );
        setIsTavernStateHydrated(true);
      });

    return () => {
      isCancelled = true;
    };
  }, [openOptions, setRoomState]);

  useEffect(() => {
    if (!openOptions || !isTavernStateHydrated) {
      return;
    }

    void saveTavernRoomSessionState(workspace.path, openOptions.runtimeScope, roomState).catch((saveError) => {
      console.error("Failed to save tavern room session state", saveError);
    });
  }, [isTavernStateHydrated, openOptions, roomState, workspace.path]);

  useEffect(() => {
    if (!workspace.path) {
      setFiles([]);
      return;
    }

    let isCancelled = false;

    void listWorkspaceFiles(workspace.path)
      .then((nextFiles) => {
        if (!isCancelled) {
          setFiles(nextFiles);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setFiles([]);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [workspace.path]);

  useEffect(() => {
    return () => {
      if (sceneDriveAutoTimerRef.current !== null) {
        window.clearTimeout(sceneDriveAutoTimerRef.current);
        sceneDriveAutoTimerRef.current = null;
      }
    };
  }, []);

  const renderableRoomMessages = useMemo(
    () =>
      activeRoom
        ? createTavernRenderableMessages({
            messages: roomMessages,
            characters: roomCharacters,
            userPersonaName: activeRoom.userPersonaName,
          })
        : [],
    [activeRoom, roomCharacters, roomMessages],
  );
  const latestMessage = renderableRoomMessages[renderableRoomMessages.length - 1] ?? null;
  const presentationProfile = getTavernPresentationProfile(activeRoom?.presentation?.profileId);
  const conversationRenderer = resolveTavernConversationRenderer(presentationProfile.renderStyle);
  const Conversation = conversationRenderer.Conversation;

  useEffect(() => {
    setBusy((current) => (current.kind === "reply_suggestions" ? createIdleTavernRoomBusyState() : current));
    setIsSceneDriveAutoRunning(false);
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
    latestMessage?.content,
    latestMessage?.id,
    renderableRoomMessages.length,
    scrollMessagesToBottom,
    isOpen,
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
  }, [activeRoom?.id, activeRoom?.activeSceneInstanceId, scrollMessagesToBottom, isOpen]);

  const selectRoomSceneInstance = useCallback(
    (roomId: string, sceneInstanceId: string) => {
      setRoomState((current) => {
        const targetRoom = getSessionStateRoom(current, roomId);
        if (!targetRoom) {
          return current;
        }

        const nextRoom = targetRoom.sceneInstances.some((instance) => instance.id === sceneInstanceId)
          ? switchTavernRoomSceneInstance(targetRoom, sceneInstanceId)
          : switchTavernRoomScene(targetRoom, sceneInstanceId);
        return replaceSessionStateRoom(current, nextRoom);
      });
      composerRef.current?.clearReplySuggestions();
    },
    [setRoomState],
  );

  const handleSubmit = useCallback(
    async (payload: ComposerSubmitPayload, trigger?: { type: "user" | "scene_drive"; directive?: string }) => {
      await submitRoomTurn({
        submittedText: trigger?.type === "scene_drive" ? undefined : payload.text,
        selectedReplyOption: payload.selectedReplyOption,
        trigger: trigger?.type === "scene_drive" ? { ...trigger, directive: payload.text } : trigger,
        ambiguousFileReferences: payload.ambiguousFileReferences,
        readReferencedFiles: payload.readReferencedFiles,
        referencedFilePreviews: payload.referencedFilePreviews,
        unresolvedFileReferences: payload.unresolvedFileReferences,
        onCommitted: () => {
          composerRef.current?.clearDraft();
          composerRef.current?.clearReplySuggestions();
        },
      });
    },
    [],
  );

  const handleSceneDriveTurn = useCallback(async () => {
    const payload = composerRef.current?.getSubmitPayload() ?? createEmptyComposerSubmitPayload();
    await handleSubmit(payload, {
      type: "scene_drive",
    });
  }, [handleSubmit]);

  const clearSceneDriveAutoTimer = useCallback(() => {
    if (sceneDriveAutoTimerRef.current !== null) {
      window.clearTimeout(sceneDriveAutoTimerRef.current);
      sceneDriveAutoTimerRef.current = null;
    }
  }, []);

  const clearActiveSceneMessages = useCallback(async () => {
    if (!activeRoom) {
      return;
    }

    const sceneTitle = getTavernSceneInstanceDisplayTitle(activeRoom, activeRoom.activeSceneInstanceId, "当前节点");
    const confirmed = window.confirm(
      `清空当前节点「${sceneTitle}」的对话记录？当前节点场景实例的消息会被替换为一条重置提示。`,
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
      role: "narrator",
      content: "这个节点的桌面被重新擦亮，旧谈话暂时收进抽屉。",
      status: "done",
    });

    setRoomState((current) => {
      const currentRoom = getSessionStateRoom(current, activeRoom.id);
      const nextRoom = currentRoom
        ? syncTavernRoomActiveScene({
            ...currentRoom,
            updatedAt: Date.now(),
          })
        : null;

      return {
        ...(nextRoom ? replaceSessionStateRoom(current, nextRoom) : current),
        messages: [resetMessage],
      };
    });
    composerRef.current?.clearReplySuggestions();
    setIsSceneDriveAutoRunning(false);
    clearSceneDriveAutoTimer();
    sceneDriveAutoRunCountRef.current = 0;
    setError("");
    toast.success("已清空当前节点对话");
  }, [activeRoom, clearSceneDriveAutoTimer, setError, setRoomState, workspace.path]);

  const stopSceneDriveAuto = useCallback(
    (statusText?: string) => {
      clearSceneDriveAutoTimer();
      sceneDriveAutoRunCountRef.current = 0;
      setIsSceneDriveAutoRunning(false);
      if (statusText) {
        setBusyStatus(statusText);
      }
    },
    [clearSceneDriveAutoTimer, setBusyStatus],
  );

  const handleToggleSceneDriveAuto = useCallback(() => {
    if (isSceneDriveAutoRunning) {
      stopSceneDriveAuto("自动自推已停止。");
      return;
    }

    if (isBusy) {
      return;
    }

    if (!activeRoom) {
      setError("当前房间还没有可推进的场景。");
      return;
    }

    const pauseReason = getSceneDriveAutoPauseReason(activeRoom);
    if (pauseReason) {
      setBusyStatus(pauseReason);
      return;
    }

    setError("");
    setIsSceneDriveAutoRunning(true);
    sceneDriveAutoRunCountRef.current = 1;
    void handleSceneDriveTurn();
  }, [activeRoom, handleSceneDriveTurn, isBusy, isSceneDriveAutoRunning, setError, setBusyStatus, stopSceneDriveAuto]);

  useEffect(() => {
    if (!isSceneDriveAutoRunning) {
      clearSceneDriveAutoTimer();
      return;
    }

    if (!isOpen || !activeRoom) {
      stopSceneDriveAuto();
      return;
    }

    if (error) {
      stopSceneDriveAuto();
      return;
    }

    if (isBusy) {
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
    isBusy,
    isSceneDriveAutoRunning,
    roomMessages,
    stopSceneDriveAuto,
    isOpen,
  ]);

  const closeRoomSurface = () => {
    sidePanelRef.current?.hide();
    setIsSceneDriveAutoRunning(false);
    clearSceneDriveAutoTimer();
    sceneDriveAutoRunCountRef.current = 0;
    setIsOpen(false);
    openOptions?.onClose?.();
  };

  if (!isOpen) {
    return null;
  }

  if (!isTavernStateHydrated || !activeRoom) {
    return (
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeRoomSurface();
          }
        }}
      >
        <DialogContent
          showCloseButton={false}
          overlayClassName="bg-black/5 backdrop-blur-none"
          className={cn(fullScreenDialogContentClassName, "items-center justify-center bg-background text-foreground")}
        >
          <DialogTitle className="sr-only">酒馆房间</DialogTitle>
          <div className="rounded-md border bg-card px-5 py-4 text-sm text-muted-foreground">
            {!isTavernStateHydrated ? "正在加载酒馆房间" : "当前没有可进入的酒馆房间，请先从故事节点打开酒馆。"}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const backgroundStyle = {
    backgroundImage: `${visualPreset.tavern.backgroundOverlay}, url(${visualPreset.tavern.backgroundImage})`,
    backgroundPosition: visualPreset.tavern.backgroundPosition,
    backgroundRepeat: "no-repeat",
    backgroundSize: visualPreset.tavern.backgroundSize,
  } satisfies CSSProperties;
  const activeSceneTitle = getTavernSceneInstanceDisplayTitle(activeRoom, activeRoom.activeSceneInstanceId);
  const sceneInstanceOptions = activeRoom.sceneInstances.map((instance) => ({
    id: instance.id,
    label: getTavernSceneInstanceDisplayTitle(activeRoom, instance.id),
  }));
  const sceneDescription = getTavernSceneText(activeRoom.scene, "这个房间还没有场景描述。");
  const sceneMechanism = getTavernSceneText(
    activeRoom.scenePlot,
    getTavernSceneText(activeRoom.storyOutline, "剧情会根据角色行动与明确事件推进。"),
  );
  const sceneGoal = getTavernSceneText(
    activeRoom.sceneGoal,
    getTavernSceneText(activeRoom.storyGoal, "完成当前场景目标。"),
  );
  const sceneEnding = getTavernSceneText(activeRoom.sceneTransition, "达成目标或触发关键条件时结算。");
  const sceneBriefLines = Array.from(
    new Set(
      [
        activeRoom.storyOutline.trim() || sceneDescription,
        activeRoom.storyGoal.trim() || activeRoom.sceneGoal.trim(),
      ].filter(Boolean),
    ),
  );
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
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          closeRoomSurface();
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-black/5 backdrop-blur-none"
        className={cn(fullScreenDialogContentClassName, "text-foreground", visualPreset.tavern.page)}
      >
        <DialogTitle className="sr-only">{activeRoom.title ? `${activeRoom.title} · 酒馆` : "酒馆房间"}</DialogTitle>
        <WindowDragRegion className="h-10 shrink-0" />
        <div
          className={[
            "grid min-h-0 w-full flex-1 grid-cols-1",
            isSidePanelOpen ? "lg:grid-cols-[minmax(0,1fr)_360px]" : "lg:grid-cols-1",
          ].join(" ")}
        >
          <main className="flex min-h-0 min-w-0 flex-col">
            <Header
              isSceneDriveAutoRunning={isSceneDriveAutoRunning}
              isSidePanelOpen={isSidePanelOpen}
              onBack={closeRoomSurface}
              onClearCurrentSceneMessages={() => {
                void clearActiveSceneMessages();
              }}
              onRebuildRuntime={undefined}
              onSelectSceneInstance={(sceneInstanceId) => selectRoomSceneInstance(activeRoom.id, sceneInstanceId)}
              onSceneDriveTurn={() => {
                void handleSceneDriveTurn();
              }}
              onToggleSceneDriveAuto={handleToggleSceneDriveAuto}
              onToggleSidePanel={() => {
                sidePanelRef.current?.toggle();
              }}
            />

            <ScrollArea
              viewportRef={messageViewportRef}
              className={cn("min-h-0 flex-1", visualPreset.tavern.scrollArea)}
              style={backgroundStyle}
            >
              <div
                ref={messageListRef}
                className={cn("mx-auto flex w-full flex-col gap-4 px-4 py-6 sm:px-5", visualPreset.tavern.messageList)}
              >
                <SceneBriefCard
                  className={cn("w-full self-center", isSidePanelOpen ? "max-w-[44rem]" : "max-w-[46rem]")}
                  visualPreset={visualPreset}
                  content={sceneBriefContent}
                  sceneSelector={
                    <SceneSelector
                      options={sceneInstanceOptions}
                      activeValue={activeRoom.activeSceneInstanceId}
                      label="节点："
                      onSelectScene={(sceneInstanceId) => selectRoomSceneInstance(activeRoom.id, sceneInstanceId)}
                    />
                  }
                />
                <Conversation
                  messages={renderableRoomMessages}
                  isSidePanelOpen={isSidePanelOpen}
                  messageEndRef={messageEndRef}
                />
              </div>
            </ScrollArea>

            <Composer
              bind={composerRef}
              files={files}
              onSubmit={(payload) => {
                void handleSubmit(payload);
              }}
            />
          </main>

          <SidePanel bind={sidePanelRef} isOpen={isSidePanelOpen} onOpenChange={setIsSidePanelOpen} />
        </div>
      </DialogContent>
    </Dialog>
  );
};
