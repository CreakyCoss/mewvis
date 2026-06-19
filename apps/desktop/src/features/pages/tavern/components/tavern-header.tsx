import {
  ArrowLeft,
  BookOpen,
  Bot,
  Clapperboard,
  PanelRightClose,
  PanelRightOpen,
  Wine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { WindowDragRegion } from "@/components/window-drag-region";
import type { VisualPresetDefinition } from "@/features/pages/tavern/visual-presets";
import { cn } from "@/lib/utils";
import type { TavernRoom, TavernScene } from "../types";
import { compactScene } from "../utils";

type TavernHeaderProps = {
  activeRoom: TavernRoom;
  scenes: TavernScene[];
  visualPreset: VisualPresetDefinition;
  isSidePanelOpen: boolean;
  isGeneratingQuickSummary: boolean;
  isManagedModeEnabled: boolean;
  onBack?: () => void;
  onSelectScene: (sceneId: string) => void;
  onOpenQuickSummary: () => void;
  onToggleManagedMode: () => void;
  onToggleSidePanel: () => void;
};

const tavernHeaderActionButtonClassName =
  "h-9 shrink-0 gap-1.5 border border-current/15 bg-current/5 px-2.5 text-current hover:border-current/25 hover:bg-current/10 hover:text-current focus-visible:border-current/30 focus-visible:text-current focus-visible:ring-current/20 aria-expanded:bg-current/10 aria-expanded:text-current dark:hover:bg-current/10 dark:hover:text-current";

export const TavernHeader = ({
  activeRoom,
  scenes,
  visualPreset,
  isSidePanelOpen,
  isGeneratingQuickSummary,
  isManagedModeEnabled,
  onBack,
  onSelectScene,
  onOpenQuickSummary,
  onToggleManagedMode,
  onToggleSidePanel,
}: TavernHeaderProps) => (
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
      <div className="hidden min-w-[180px] max-w-[260px] items-center gap-1.5 md:flex">
        <Clapperboard className="size-4 shrink-0 text-current opacity-70" />
        <NativeSelect
          value={activeRoom.activeSceneId ?? scenes[0]?.id ?? ""}
          className="h-9 min-w-0 bg-current/5 text-xs text-current"
          aria-label="选择场景"
          onChange={(event) => onSelectScene(event.target.value)}
        >
          {scenes.map((scene) => (
            <NativeSelectOption key={scene.id} value={scene.id}>
              {scene.title}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
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
        title={isGeneratingQuickSummary ? "正在总结" : "快速总结"}
        aria-label={isGeneratingQuickSummary ? "正在总结" : "快速总结"}
        disabled={isGeneratingQuickSummary}
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
