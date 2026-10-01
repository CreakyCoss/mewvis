import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
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
  const [header, setHeader] = useState<{ owner: symbol; content: ReactNode } | null>(null);
  const registerHeader = useCallback<RegisterWorkspaceHeader>((content) => {
    const owner = Symbol("workspace-header");
    setHeader({ owner, content });
    return () => setHeader((current) => (current?.owner === owner ? null : current));
  }, []);
  return (
    <WorkspaceHeaderContext.Provider value={registerHeader}>
      <main className="flex h-screen min-h-screen overflow-hidden bg-background text-foreground">
        <WindowDragRegion className="fixed inset-x-0 top-0 z-40 h-10" />
        {sidebar}
        {contextualSidebar}
        <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-background pt-10">
          {header && (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-50 h-10">
              {header.content}
            </div>
          )}
          {children}
        </section>
      </main>
    </WorkspaceHeaderContext.Provider>
  );
};
