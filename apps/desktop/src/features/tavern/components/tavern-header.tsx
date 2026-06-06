import { ArrowLeft, PanelRightClose, PanelRightOpen, Wine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WindowDragRegion } from "@/components/window-drag-region";
import type { VisualPresetDefinition } from "@/features/visual-presets";
import { cn } from "@/lib/utils";
import type { TavernRoom } from "../types";
import { compactScene } from "../utils";

type TavernHeaderProps = {
  activeRoom: TavernRoom;
  visualPreset: VisualPresetDefinition;
  isSidePanelOpen: boolean;
  onBack?: () => void;
  onToggleSidePanel: () => void;
};

export const TavernHeader = ({
  activeRoom,
  visualPreset,
  isSidePanelOpen,
  onBack,
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
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="hidden h-9 shrink-0 gap-1.5 border border-current/15 bg-current/5 px-2.5 text-current hover:bg-current/10 lg:inline-flex"
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
