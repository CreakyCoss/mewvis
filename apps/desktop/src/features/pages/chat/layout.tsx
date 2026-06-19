import { PanelRight } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { WorkspaceChatShellProps } from "@/features/pages/chat/components/workspace-chat-page";

type LayoutProps = Omit<WorkspaceChatShellProps, "sidebarProps">;

export const ChatLayout = ({
  dialogs,
  headerProps,
  content,
  contextPanel,
  isTavernImmersive,
}: LayoutProps) => {
  const renderToggle = (node: ReactNode) => (
    <div className="absolute top-1.5 right-4 z-30 flex min-w-0 items-center justify-end gap-1.5">
      {node}
    </div>
  );

  if (isTavernImmersive) {
    return (
      <section className="relative flex h-full min-h-0 flex-1 overflow-hidden bg-background">
        {dialogs}
        <div className="min-w-0 flex-1 overflow-hidden bg-background">
          {content}
        </div>
      </section>
    );
  }

  return (
    <section className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      {dialogs}
      {headerProps?.showToggle !== false &&
        headerProps &&
        renderToggle(
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className={[
              "size-9 rounded-lg shadow-[0_8px_20px_-18px_rgb(15_23_42_/_0.45)] backdrop-blur transition-colors",
              headerProps.isContextPanelOpen
                ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                : "bg-background/85 text-muted-foreground hover:bg-muted/70 hover:text-foreground",
            ].join(" ")}
            title={headerProps.isContextPanelOpen ? "收起右侧面板" : "展开右侧面板"}
            aria-label={headerProps.isContextPanelOpen ? "收起右侧面板" : "展开右侧面板"}
            onClick={headerProps.onToggleContextPanel}
          >
            <PanelRight className="size-[18px]" />
          </Button>,
        )}
      <div className="flex min-h-0 flex-1 overflow-hidden bg-muted/20">
        <div className="min-w-0 flex-1 overflow-hidden bg-background/95 shadow-[inset_8px_0_24px_-28px_rgb(15_23_42_/_0.35),inset_-8px_0_24px_-28px_rgb(15_23_42_/_0.28)]">
          {content}
        </div>
        {contextPanel}
      </div>
    </section>
  );
};
