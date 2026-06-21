import {
  ArrowLeft,
  BookOpen,
  Bot,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  Sparkles,
  Wine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { WindowDragRegion } from "@/components/window-drag-region";
import { cn } from "@/lib/utils";
import { compactScene } from "../../utils";
import { getTavernSceneDisplayTitle } from "../../storage";
import { useTavernPageContext } from "../context";
import { SceneSelector } from "./scene-selector";

type HeaderProps = {
  isManagedModeEnabled: boolean;
  isSceneDriveAutoRunning: boolean;
  isSidePanelOpen: boolean;
  onBack?: () => void;
  onSelectScene: (sceneId: string) => void;
  onOpenQuickSummary: () => void;
  onSceneDriveTurn: () => void;
  onToggleSceneDriveAuto: () => void;
  onToggleManagedMode: () => void;
  onToggleSidePanel: () => void;
};

const tavernHeaderActionButtonClassName =
  "h-9 shrink-0 gap-1.5 border border-current/15 bg-current/5 px-2.5 text-current hover:border-current/25 hover:bg-current/10 hover:text-current focus-visible:border-current/30 focus-visible:text-current focus-visible:ring-current/20 aria-expanded:bg-current/10 aria-expanded:text-current dark:hover:bg-current/10 dark:hover:text-current";

export const Header = ({
  isManagedModeEnabled,
  isSceneDriveAutoRunning,
  isSidePanelOpen,
  onBack,
  onSelectScene,
  onOpenQuickSummary,
  onSceneDriveTurn,
  onToggleSceneDriveAuto,
  onToggleManagedMode,
  onToggleSidePanel,
}: HeaderProps) => {
  const {
    activeRoom,
    visualPreset,
    isQuickSummaryBusy,
    isSending,
  } = useTavernPageContext();
  if (!activeRoom) {
    return null;
  }

  const scenes = activeRoom.scenes ?? [];

  return (
    <header
      className={cn(
        "relative border-b px-3 pt-10 pb-2 sm:px-4",
        visualPreset.tavern.header,
      )}
    >
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
              <h2 className="truncate text-base font-semibold leading-5">
                {activeRoom.title}
              </h2>
            </div>
            <p className="line-clamp-1 text-sm text-muted-foreground">
              {compactScene(activeRoom.scene)}
            </p>
          </div>
        </div>
        <div className="hidden min-w-[220px] max-w-[280px] md:flex">
          <SceneSelector
            scenes={scenes}
            activeSceneId={activeRoom.activeSceneId}
            label="节点："
            getSceneLabel={(scene) => getTavernSceneDisplayTitle(activeRoom, scene.id)}
            onSelectScene={onSelectScene}
          />
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={tavernHeaderActionButtonClassName}
          title={isSending ? "正在回应" : "自推动一轮"}
          aria-label={isSending ? "正在回应" : "自推动一轮"}
          disabled={isSending || isSceneDriveAutoRunning}
          onClick={onSceneDriveTurn}
        >
          <Sparkles className="size-4" />
          <span className="hidden text-xs font-medium sm:inline">
            自推
          </span>
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
          disabled={isSending && !isSceneDriveAutoRunning}
          onClick={onToggleSceneDriveAuto}
        >
          {isSceneDriveAutoRunning ? (
            <Pause className="size-4" />
          ) : (
            <Sparkles className="size-4" />
          )}
          <span className="hidden text-xs font-medium sm:inline">
            {isSceneDriveAutoRunning ? "停止" : "自动"}
          </span>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={cn(
            tavernHeaderActionButtonClassName,
            isManagedModeEnabled && "border-current/30 bg-current/15 text-current",
          )}
          title={isManagedModeEnabled ? "关闭全托管" : "开启全托管"}
          aria-label={isManagedModeEnabled ? "关闭全托管" : "开启全托管"}
          aria-pressed={isManagedModeEnabled}
          onClick={onToggleManagedMode}
        >
          <Bot className="size-4" />
          <span className="hidden text-xs font-medium sm:inline">
            {isManagedModeEnabled ? "托管中" : "托管"}
          </span>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={tavernHeaderActionButtonClassName}
          title={isQuickSummaryBusy ? "正在总结" : "快速总结"}
          aria-label={isQuickSummaryBusy ? "正在总结" : "快速总结"}
          disabled={isQuickSummaryBusy}
          onClick={onOpenQuickSummary}
        >
          <BookOpen className="size-4" />
          <span className="hidden text-xs font-medium sm:inline">总结</span>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={cn(
            "hidden lg:inline-flex",
            tavernHeaderActionButtonClassName,
          )}
          title={isSidePanelOpen ? "隐藏侧边栏" : "显示侧边栏"}
          aria-label={isSidePanelOpen ? "隐藏侧边栏" : "显示侧边栏"}
          aria-pressed={isSidePanelOpen}
          onClick={onToggleSidePanel}
        >
          {isSidePanelOpen ? (
            <PanelRightClose className="size-4" />
          ) : (
            <PanelRightOpen className="size-4" />
          )}
          <span className="text-xs font-medium">
            {isSidePanelOpen ? "收起" : "概览"}
          </span>
        </Button>
      </div>
    </header>
  );
};
