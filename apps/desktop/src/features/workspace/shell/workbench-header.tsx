import { PanelRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WindowDragRegion } from "@/components/window-drag-region";
import { cn } from "@/lib/utils";

export type WorkbenchHeaderProps = {
  isContextPanelOpen: boolean;
  showToggle?: boolean;
  onToggleContextPanel: () => void;
};

export const WorkbenchHeader = ({
  isContextPanelOpen,
  showToggle = true,
  onToggleContextPanel,
}: WorkbenchHeaderProps) => {
  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-30 h-12 bg-background/65 shadow-[0_8px_24px_-26px_rgb(15_23_42_/_0.28)] backdrop-blur-md" />
      <WindowDragRegion
        className={cn(
          "fixed top-0 left-0 z-[80] h-12",
          isContextPanelOpen ? "right-[18rem]" : "right-16",
        )}
      />
      {showToggle && (
        <div className="fixed top-1.5 right-4 z-[90] flex min-w-0 items-center justify-end gap-1.5">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className={[
              "size-9 rounded-lg shadow-[0_8px_20px_-18px_rgb(15_23_42_/_0.45)] backdrop-blur transition-colors",
              isContextPanelOpen
                ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                : "bg-background/85 text-muted-foreground hover:bg-muted/70 hover:text-foreground",
            ].join(" ")}
            title={isContextPanelOpen ? "收起右侧面板" : "展开右侧面板"}
            aria-label={isContextPanelOpen ? "收起右侧面板" : "展开右侧面板"}
            onClick={onToggleContextPanel}
          >
            <PanelRight className="size-[18px]" />
          </Button>
        </div>
      )}
    </>
  );
};
