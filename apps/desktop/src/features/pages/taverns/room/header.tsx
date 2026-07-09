import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Eraser, PanelRightClose, PanelRightOpen, Pause, Sparkles, Wine } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { WindowDragRegion } from "@/components/window-drag-region";
import { cn } from "@/lib/utils";
import { compactScene } from "@/features/pages/taverns/tavern/utils";
import { deleteTavernAgentFlowSession } from "@/features/pages/taverns/room/agent-flow/session";
import {
  createIdleTavernRoomBusyState,
  isTavernRoomBusy,
  isTavernRoomSending,
  useTavernRoomContext,
} from "@/features/pages/taverns/room/context";
import { getTavernRoomSceneFields, getTavernRoomSceneTitle, type TavernRoomRuntime } from "./model";
import { createEmptyComposerSubmitPayload } from "./composer";
import { deleteTavernRoomSessionState } from "./storage";
import { getTavernAgentFlowErrorMessage, submitTavernAgentFlow } from "./agent-flow/submit";

type HeaderProps = {
  isSidePanelOpen: boolean;
  onBack?: () => void;
  onToggleSidePanel: () => void;
};

const TAVERN_SCENE_DRIVE_AUTO_INTERVAL_MS = 900;
const TAVERN_SCENE_DRIVE_AUTO_MAX_TURNS = 20;
const tavernHeaderActionButtonClassName =
  "h-9 shrink-0 gap-1.5 border border-current/15 bg-current/5 px-2.5 text-current hover:border-current/25 hover:bg-current/10 hover:text-current focus-visible:border-current/30 focus-visible:text-current focus-visible:ring-current/20 aria-expanded:bg-current/10 aria-expanded:text-current dark:hover:bg-current/10 dark:hover:text-current";

const getSceneDriveAutoPauseReason = (room: TavernRoomRuntime) => {
  const hasUserTargetedInteraction = getTavernRoomSceneFields(room).pendingInteractions.some(
    (interaction) =>
      interaction.status === "open" && interaction.requiresResponse && interaction.target.type === "user",
  );
  if (hasUserTargetedInteraction) {
    return "自动自推已暂停：有角色正在等待你的回应。";
  }

  return "";
};

export const Header = ({ isSidePanelOpen, onBack, onToggleSidePanel }: HeaderProps) => {
  const workspace = useTavernRoomContext((store) => store.workspace);
  const tavernWorkspacePath = useTavernRoomContext((store) => store.tavernWorkspacePath);
  const activeRoom = useTavernRoomContext((store) => store.activeRoom);
  const runtime = useTavernRoomContext((store) => store.state.runtime);
  const initialRuntime = useTavernRoomContext((store) => store.initialRuntime);
  const initialMessages = useTavernRoomContext((store) => store.initialMessages);
  const roomMessages = useTavernRoomContext((store) => store.roomMessages);
  const visualPreset = useTavernRoomContext((store) => store.visualPreset);
  const busy = useTavernRoomContext((store) => store.busy);
  const error = useTavernRoomContext((store) => store.error);
  const setRoomState = useTavernRoomContext((store) => store.setState);
  const setBusy = useTavernRoomContext((store) => store.setBusy);
  const setBusyStatus = useTavernRoomContext((store) => store.setBusyStatus);
  const setError = useTavernRoomContext((store) => store.setError);
  const resetExecutionTrace = useTavernRoomContext((store) => store.resetExecutionTrace);
  const setExecutionTraceAnchorMessageId = useTavernRoomContext((store) => store.setExecutionTraceAnchorMessageId);
  const [isSceneDriveAutoRunning, setIsSceneDriveAutoRunning] = useState(false);
  const sceneDriveAutoTimerRef = useRef<number | null>(null);
  const sceneDriveAutoRunCountRef = useRef(0);

  const isBusy = isTavernRoomBusy(busy);
  const isSending = isTavernRoomSending(busy);
  const activeSceneFields = activeRoom ? getTavernRoomSceneFields(activeRoom) : null;
  const clearSceneDriveAutoTimer = useCallback(() => {
    if (sceneDriveAutoTimerRef.current !== null) {
      window.clearTimeout(sceneDriveAutoTimerRef.current);
      sceneDriveAutoTimerRef.current = null;
    }
  }, []);

  const handleSceneDriveTurn = useCallback(async () => {
    const composerHandle = useTavernRoomContext.getState().composerHandle;
    const payload = composerHandle?.getSubmitPayload() ?? createEmptyComposerSubmitPayload();

    try {
      await submitTavernAgentFlow({
        submittedText: undefined,
        selectedReplyOption: payload.selectedReplyOption,
        trigger: { type: "scene_drive", directive: payload.text },
        ambiguousFileReferences: payload.ambiguousFileReferences,
        readReferencedFiles: payload.readReferencedFiles,
        referencedFilePreviews: payload.referencedFilePreviews,
        unresolvedFileReferences: payload.unresolvedFileReferences,
        onCommitted: () => {
          composerHandle?.clearDraft();
          composerHandle?.clearReplyOptions();
        },
      });
    } catch (submitError) {
      console.error("Failed to submit tavern room turn", submitError);
      setError(`酒馆回应失败：${getTavernAgentFlowErrorMessage(submitError)}`);
      setBusy(createIdleTavernRoomBusyState());
    }
  }, [setBusy, setError]);

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

  const clearActiveSceneMessages = useCallback(async () => {
    if (!activeRoom) {
      return;
    }

    const sessionWorkspacePath = tavernWorkspacePath.trim() || workspace.path.trim();
    if (!sessionWorkspacePath) {
      setError("酒馆会话路径为空，请重新打开当前酒馆房间。");
      toast.error("清空当前节点失败");
      return;
    }

    const sceneTitle = getTavernRoomSceneTitle(activeRoom, "当前场景");
    const confirmed = window.confirm(
      `清空当前节点「${sceneTitle}」的酒馆运行数据？下次会按故事页传入的最新数据重新初始化。`,
    );
    if (!confirmed) {
      return;
    }

    if (runtime) {
      try {
        await deleteTavernAgentFlowSession({ workspacePath: sessionWorkspacePath, room: runtime });
      } catch (deleteError) {
        const message = getTavernAgentFlowErrorMessage(deleteError);
        setError(`无法清理当前节点底层会话：${message}`);
        toast.error("清空当前节点失败");
        return;
      }
    }

    try {
      await deleteTavernRoomSessionState(sessionWorkspacePath);
    } catch (deleteError) {
      const message = getTavernAgentFlowErrorMessage(deleteError);
      setError(`无法清理当前节点运行文件：${message}`);
      toast.error("清空当前节点失败");
      return;
    }

    setRoomState({
      runtime: initialRuntime,
      messages: initialMessages,
    });
    useTavernRoomContext.getState().composerHandle?.clearReplyOptions();
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
    runtime,
    clearSceneDriveAutoTimer,
    initialMessages,
    initialRuntime,
    resetExecutionTrace,
    setBusy,
    setError,
    setExecutionTraceAnchorMessageId,
    setRoomState,
    tavernWorkspacePath,
    workspace.path,
  ]);

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
    return () => {
      clearSceneDriveAutoTimer();
    };
  }, [clearSceneDriveAutoTimer]);

  useEffect(() => {
    setIsSceneDriveAutoRunning(false);
    clearSceneDriveAutoTimer();
    sceneDriveAutoRunCountRef.current = 0;
  }, [activeRoom?.identity.id, clearSceneDriveAutoTimer]);

  useEffect(() => {
    if (!isSceneDriveAutoRunning) {
      clearSceneDriveAutoTimer();
      return;
    }

    if (!activeRoom) {
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
  ]);

  if (!activeRoom) {
    return null;
  }

  return (
    <header className={cn("relative border-b px-3 pt-10 pb-2 sm:px-4", visualPreset.tavern.header)}>
      <WindowDragRegion className="absolute inset-x-0 top-0 h-10" />
      <div className="flex min-h-[46px] items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {onBack && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8 shrink-0"
              title="返回管理"
              aria-label="返回管理"
              onClick={onBack}
            >
              <ArrowLeft className="size-4" />
            </Button>
          )}
          <div
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-md border",
              visualPreset.tavern.headerIcon,
            )}
          >
            <Wine className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1.5">
              <h2 className="truncate text-base font-semibold leading-5">{activeRoom.identity.title}</h2>
            </div>
            <p className="line-clamp-1 text-sm text-muted-foreground">{compactScene(activeSceneFields?.scene ?? "")}</p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={tavernHeaderActionButtonClassName}
          title={isSending ? "正在回应" : "自推动一轮"}
          aria-label={isSending ? "正在回应" : "自推动一轮"}
          disabled={isBusy || isSceneDriveAutoRunning}
          onClick={() => {
            void handleSceneDriveTurn();
          }}
        >
          <Sparkles className="size-4" />
          <span className="hidden text-xs font-medium sm:inline">自推</span>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={cn(
            tavernHeaderActionButtonClassName,
            isSceneDriveAutoRunning && "border-current/30 bg-current/15 text-current",
          )}
          title={isSceneDriveAutoRunning ? "停止自动自推" : "自动自推"}
          aria-label={isSceneDriveAutoRunning ? "停止自动自推" : "自动自推"}
          aria-pressed={isSceneDriveAutoRunning}
          disabled={isBusy && !isSceneDriveAutoRunning}
          onClick={handleToggleSceneDriveAuto}
        >
          {isSceneDriveAutoRunning ? <Pause className="size-4" /> : <Sparkles className="size-4" />}
          <span className="hidden text-xs font-medium sm:inline">{isSceneDriveAutoRunning ? "停止" : "自动"}</span>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={tavernHeaderActionButtonClassName}
          title="清空当前节点对话"
          aria-label="清空当前节点对话"
          disabled={isBusy || isSceneDriveAutoRunning}
          onClick={() => {
            void clearActiveSceneMessages();
          }}
        >
          <Eraser className="size-4" />
          <span className="hidden text-xs font-medium sm:inline">清空</span>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={cn("hidden lg:inline-flex", tavernHeaderActionButtonClassName)}
          title={isSidePanelOpen ? "隐藏侧边栏" : "显示侧边栏"}
          aria-label={isSidePanelOpen ? "隐藏侧边栏" : "显示侧边栏"}
          aria-pressed={isSidePanelOpen}
          onClick={onToggleSidePanel}
        >
          {isSidePanelOpen ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
          <span className="text-xs font-medium">{isSidePanelOpen ? "收起" : "角色"}</span>
        </Button>
      </div>
    </header>
  );
};
