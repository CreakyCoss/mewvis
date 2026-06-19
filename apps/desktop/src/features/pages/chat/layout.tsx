import type { ReactNode } from "react";

export type ChatLayoutProps = {
  content: ReactNode;
  contextPanel: ReactNode;
  contextRail: ReactNode;
};

export const ChatLayout = ({
  content,
  contextPanel,
  contextRail,
}: ChatLayoutProps) => {
  return (
    <section className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex min-h-0 flex-1 overflow-hidden bg-muted/20">
        <div className="min-w-0 flex-1 overflow-hidden bg-background/95 shadow-[inset_8px_0_24px_-28px_rgb(15_23_42_/_0.35),inset_-8px_0_24px_-28px_rgb(15_23_42_/_0.28)]">
          {content}
        </div>
        {contextPanel}
        {contextRail}
      </div>
    </section>
  );
};
