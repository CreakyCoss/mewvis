import { ArrowLeft, PanelRightClose, PanelRightOpen, Wine } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TavernRoom } from "../types";
import { compactScene } from "../utils";

type TavernHeaderProps = {
  activeRoom: TavernRoom;
  isSidePanelOpen: boolean;
  onBack?: () => void;
  onToggleSidePanel: () => void;
};

export const TavernHeader = ({
  activeRoom,
  isSidePanelOpen,
  onBack,
  onToggleSidePanel,
}: TavernHeaderProps) => (
  <header className="flex min-h-[58px] items-center gap-3 border-b bg-background/95 px-3 py-2 sm:px-4">
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
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <Wine className="size-4 shrink-0 text-primary" />
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
      size="icon"
      variant="ghost"
      className="hidden size-8 shrink-0 xl:inline-flex"
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
    </Button>
  </header>
);
