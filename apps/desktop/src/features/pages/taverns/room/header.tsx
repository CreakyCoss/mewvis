import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Eraser, PanelRightClose, PanelRightOpen, Pause, Sparkles, Wine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WindowDragRegion } from "@/components/window-drag-region";
import { cn } from "@/lib/utils";
import {
  createIdleTavernRoomBusyState,
  isTavernRoomBusy,
  isTavernRoomSending,
  useTavernRoomContext,
} from "@/features/pages/taverns/room/context";
import { createEmptyComposerSubmitPayload } from "./composer";
import { getTavernAgentFlowErrorMessage, submitTavernAgentFlow } from "./agent-flow/submission";

type HeaderProps = {
  isSidePanelOpen: boolean;
  isResetting: boolean;
  onBack?: () => void;
  onReset: () => void | Promise<void>;
  onToggleSidePanel: () => void;
};

const TAVERN_SCENE_DRIVE_AUTO_INTERVAL_MS = 900;
const TAVERN_SCENE_DRIVE_AUTO_MAX_TURNS = 20;
const compactScene = (scene: string) => {
  const trimmed = scene.trim();
  return trimmed.length > 88 ? `${trimmed.slice(0, 88)}...` : trimmed;
};
const tavernHeaderActionButtonClassName =
  "h-9 shrink-0 gap-1.5 border border-current/15 bg-current/5 px-2.5 text-current hover:border-current/25 hover:bg-current/10 hover:text-current focus-visible:border-current/30 focus-visible:text-current focus-visible:ring-current/20 aria-expanded:bg-current/10 aria-expanded:text-current dark:hover:bg-current/10 dark:hover:text-current";

export const Header = ({ isSidePanelOpen, isResetting, onBack, onReset, onToggleSidePanel }: HeaderProps) => {
  const story = useTavernRoomContext((store) => store.story);
  const messages = useTavernRoomContext((store) => store.messages);
  const visualPreset = useTavernRoomContext((store) => store.visualPreset);
  const busy = useTavernRoomContext((store) => store.busy);
  const error = useTavernRoomContext((store) => store.error);
  const setBusy = useTavernRoomContext((store) => store.setBusy);
  const setBusyStatus = useTavernRoomContext((store) => store.setBusyStatus);
  const setError = useTavernRoomContext((store) => store.setError);
  const [isSceneDriveAutoRunning, setIsSceneDriveAutoRunning] = useState(false);
  const sceneDriveAutoTimerRef = useRef<number | null>(null);
  const sceneDriveAutoRunCountRef = useRef(0);

  const isBusy = isTavernRoomBusy(busy);
  const isSending = isTavernRoomSending(busy);
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
        trigger: { type: "scene_drive", directive: payload.text },
        ambiguousFileReferences: payload.ambiguousFileReferences,
        readReferencedFiles: payload.readReferencedFiles,
        referencedFilePreviews: payload.referencedFilePreviews,
        unresolvedFileReferences: payload.unresolvedFileReferences,
        onCommitted: () => {
          composerHandle?.clearDraft();
        },
      });
    } catch (submitError) {
      console.error("Failed to submit tavern story turn", submitError);
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

  const handleToggleSceneDriveAuto = useCallback(() => {
    if (isSceneDriveAutoRunning) {
      stopSceneDriveAuto("自动自推已停止。");
      return;
    }

    if (isBusy) {
      return;
    }

    if (!story) {
      setError("当前房间还没有可推进的场景。");
      return;
    }

    setError("");
    setIsSceneDriveAutoRunning(true);
    sceneDriveAutoRunCountRef.current = 1;
    void handleSceneDriveTurn();
  }, [story, handleSceneDriveTurn, isBusy, isSceneDriveAutoRunning, setError, setBusyStatus, stopSceneDriveAuto]);

  useEffect(() => {
    return () => {
      clearSceneDriveAutoTimer();
    };
  }, [clearSceneDriveAutoTimer]);

  useEffect(() => {
    setIsSceneDriveAutoRunning(false);
    clearSceneDriveAutoTimer();
    sceneDriveAutoRunCountRef.current = 0;
  }, [story?.id, clearSceneDriveAutoTimer]);

  useEffect(() => {
    if (!isSceneDriveAutoRunning) {
      clearSceneDriveAutoTimer();
      return;
    }

    if (!story) {
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

    const latestRoomMessage = messages[messages.length - 1] ?? null;
    if (latestRoomMessage?.status === "streaming") {
      return;
    }

    if (latestRoomMessage?.status === "error") {
      stopSceneDriveAuto("自动自推已暂停：上一轮回应失败。");
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
    story,
    messages,
    clearSceneDriveAutoTimer,
    error,
    handleSceneDriveTurn,
    isBusy,
    isSceneDriveAutoRunning,
    stopSceneDriveAuto,
  ]);

  if (!story) {
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
              <h2 className="truncate text-base font-semibold leading-5">{story.title}</h2>
            </div>
            <p className="line-clamp-1 text-sm text-muted-foreground">{compactScene(story.scene.scene)}</p>
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
          disabled={isBusy || isSceneDriveAutoRunning || isResetting}
          onClick={() => {
            void onReset();
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
