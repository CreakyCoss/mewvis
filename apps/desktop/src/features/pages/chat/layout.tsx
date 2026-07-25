import type { ReactNode } from "react";

export type ChatLayoutProps = {
  content: ReactNode;
  contextPanel: ReactNode;
  contextRail: ReactNode;
};

export const ChatLayout = ({ content, contextPanel, contextRail }: ChatLayoutProps) => {
  return (
    <section className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="relative flex min-h-0 flex-1 overflow-hidden bg-surface/45">
        <div className="min-w-0 flex-1 overflow-hidden bg-background/95">{content}</div>
        {contextPanel}
        {contextRail}
      </div>
    </section>
  );
};
