import type { ReactNode } from "react";
import { WindowDragRegion } from "@/workbench/shell/layout/window-drag-region";

export const AppWorkspace = ({
  sidebar,
  contextualSidebar,
  children,
}: {
  sidebar: ReactNode;
  contextualSidebar?: ReactNode;
  children: ReactNode;
}) => (
  <main className="flex h-screen min-h-screen overflow-hidden bg-background text-foreground">
    <WindowDragRegion className="fixed inset-x-0 top-0 z-40 h-10" />
    {sidebar}
    {contextualSidebar}
    <section className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background pt-10">{children}</section>
  </main>
);
