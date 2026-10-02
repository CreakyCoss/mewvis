import { createContext, useCallback, useContext, useState, type CSSProperties, type ReactNode } from "react";
import { platform } from "@/platform";
import { cn } from "design-system/lib/utils";
import { WindowDragRegion } from "@/workbench/shell/layout/window-drag-region";

type RegisterWorkspaceHeader = (content: ReactNode) => () => void;
const WorkspaceHeaderContext = createContext<RegisterWorkspaceHeader | null>(null);

export const useWorkspaceHeader = () => useContext(WorkspaceHeaderContext);

export const AppWorkspace = ({
  sidebar,
  contextualSidebar,
  children,
}: {
  sidebar: ReactNode;
  contextualSidebar?: ReactNode;
  children: ReactNode;
}) => {
  const overlayTitleBar = platform.window?.titleBarStyle === "overlay";
  const [header, setHeader] = useState<{ owner: symbol; content: ReactNode } | null>(null);
  const registerHeader = useCallback<RegisterWorkspaceHeader>((content) => {
    const owner = Symbol("workspace-header");
    setHeader({ owner, content });
    return () => setHeader((current) => (current?.owner === owner ? null : current));
  }, []);
  return (
    <WorkspaceHeaderContext.Provider value={registerHeader}>
      <main
        className="flex h-screen min-h-screen overflow-hidden bg-background text-foreground"
        style={{ "--shell-sidebar-top-padding": overlayTitleBar ? "48px" : "8px" } as CSSProperties}
      >
        {overlayTitleBar && <WindowDragRegion className="fixed inset-x-0 top-0 z-40 h-10" />}
        {sidebar}
        {contextualSidebar}
        <section
          className={cn(
            "relative flex min-w-0 flex-1 flex-col overflow-hidden bg-background",
            overlayTitleBar && "pt-10",
          )}
        >
          {header && (
            <div
              className={cn(
                "pointer-events-none z-50 h-10 shrink-0",
                overlayTitleBar ? "absolute inset-x-0 top-0" : "relative",
              )}
            >
              {header.content}
            </div>
          )}
          {children}
        </section>
      </main>
    </WorkspaceHeaderContext.Provider>
  );
};
