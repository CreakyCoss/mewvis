import type { TavernRoomSessionState, TavernRuntimeRoom as TavernRoom } from "@/features/pages/taverns/room/model";
import type { Ref } from "react";
import { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { toast } from "sonner";
import { useLlmSettingsStore } from "@/features/pages/settings/llm/store";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { WindowDragRegion } from "@/components/window-drag-region";
import type { Workspace } from "@/features/pages/workspace/types";
import { cn } from "@/lib/utils";
import {
  syncTavernRoomActiveScene,
  switchTavernRoomScene,
  switchTavernRoomSceneInstance,
} from "../tavern/runtime/active-scene-runtime";
import { getTavernSceneInstanceDisplayTitle } from "../tavern/runtime/scene-selectors";
import type { TavernRuntimeScope } from "../storage";
import { deleteTavernBridgeSession } from "../tavern/runtime/conversation";
import type { TavernMessage } from "../tavern/types";
import {
  createEmptyComposerSubmitPayload,
  TavernRoomContent,
  type TavernRoomContentHandle,
  type TavernRoomContentSubmitPayload,
} from "./content";
import { createIdleTavernRoomBusyState, isTavernRoomBusy, useTavernRoomContext } from "./context";
import { Header } from "./header";
import { SidePanel, type SidePanelHandle } from "./side-panel";
import { deleteTavernRoomSessionState, loadTavernRoomSessionState, saveTavernRoomSessionState } from "./storage";
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
  const resetExecutionTrace = useTavernRoomContext((store) => store.resetExecutionTrace);
  const setExecutionTraceAnchorMessageId = useTavernRoomContext((store) => store.setExecutionTraceAnchorMessageId);
  const activeRoom = useTavernRoomContext((store) => store.activeRoom);
  const visualPreset = useTavernRoomContext((store) => store.visualPreset);
  const roomMessages = useTavernRoomContext((store) => store.roomMessages);
  const isBusy = isTavernRoomBusy(busy);
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
  const [isSceneDriveAutoRunning, setIsSceneDriveAutoRunning] = useState(false);
  const contentRef = useRef<TavernRoomContentHandle | null>(null);
  const sceneDriveAutoTimerRef = useRef<number | null>(null);
  const sceneDriveAutoRunCountRef = useRef(0);
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
    return () => {
      if (sceneDriveAutoTimerRef.current !== null) {
        window.clearTimeout(sceneDriveAutoTimerRef.current);
        sceneDriveAutoTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    setBusy((current) => (current.kind === "reply_suggestions" ? createIdleTavernRoomBusyState() : current));
    setIsSceneDriveAutoRunning(false);
    if (sceneDriveAutoTimerRef.current !== null) {
      window.clearTimeout(sceneDriveAutoTimerRef.current);
      sceneDriveAutoTimerRef.current = null;
    }
    sceneDriveAutoRunCountRef.current = 0;
  }, [activeRoom?.id, activeRoom?.activeSceneInstanceId]);

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
      contentRef.current?.clearReplySuggestions();
    },
    [setRoomState],
  );

  const handleSubmit = useCallback(
    async (payload: TavernRoomContentSubmitPayload, trigger?: { type: "user" | "scene_drive"; directive?: string }) => {
      try {
        await submitRoomTurn({
          submittedText: trigger?.type === "scene_drive" ? undefined : payload.text,
          selectedReplyOption: payload.selectedReplyOption,
          trigger: trigger?.type === "scene_drive" ? { ...trigger, directive: payload.text } : trigger,
          ambiguousFileReferences: payload.ambiguousFileReferences,
          readReferencedFiles: payload.readReferencedFiles,
          referencedFilePreviews: payload.referencedFilePreviews,
          unresolvedFileReferences: payload.unresolvedFileReferences,
          onCommitted: () => {
            contentRef.current?.clearDraft();
            contentRef.current?.clearReplySuggestions();
          },
        });
      } catch (submitError) {
        console.error("Failed to submit tavern room turn", submitError);
        setError(`酒馆回应失败：${getErrorMessage(submitError)}`);
        setBusy(createIdleTavernRoomBusyState());
      }
    },
    [setBusy, setError],
  );

  const handleSceneDriveTurn = useCallback(async () => {
    const payload = contentRef.current?.getSubmitPayload() ?? createEmptyComposerSubmitPayload();
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
      `清空当前节点「${sceneTitle}」的酒馆运行数据？下次会按故事页传入的最新数据重新初始化。`,
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

    try {
      await deleteTavernRoomSessionState(workspace.path, openOptions?.runtimeScope);
    } catch (error) {
      const message = getErrorMessage(error);
      setError(`无法清理当前节点运行文件：${message}`);
      toast.error("清空当前节点失败");
      return;
    }

    const resetSceneInstanceId = activeRoom.activeSceneInstanceId || openOptions?.sceneInstanceId;
    const nextState = createTavernRoomInitialState({
      room: openOptions?.room ?? activeRoom,
      initialMessages: openOptions?.initialMessages,
      sceneInstanceId: resetSceneInstanceId,
    });

    setRoomState(nextState);
    contentRef.current?.clearReplySuggestions();
    setIsSceneDriveAutoRunning(false);
    clearSceneDriveAutoTimer();
    sceneDriveAutoRunCountRef.current = 0;
    setBusy(createIdleTavernRoomBusyState());
    setError("");
    resetExecutionTrace([]);
    setExecutionTraceAnchorMessageId("");
    toast.success("已按最新故事数据重建当前节点酒馆");
  }, [
    activeRoom,
    clearSceneDriveAutoTimer,
    openOptions,
    resetExecutionTrace,
    setBusy,
    setError,
    setExecutionTraceAnchorMessageId,
    setRoomState,
    workspace.path,
  ]);

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

            <TavernRoomContent
              bind={contentRef}
              isOpen={isOpen}
              isSidePanelOpen={isSidePanelOpen}
              onSelectSceneInstance={(sceneInstanceId) => selectRoomSceneInstance(activeRoom.id, sceneInstanceId)}
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
