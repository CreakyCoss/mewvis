import { createContext, useCallback, useContext, useState, type CSSProperties, type ReactNode } from "react";
import { platform } from "@/platform";
import { cn } from "design-system/lib/utils";
import { WindowDragRegion } from "@/workbench/shell/layout/window-drag-region";
import { LogOut, Maximize2, Minimize2 } from "lucide-react";
import { NavLink } from "react-router";
import { Button } from "design-system/components/ui/button";

type RegisterWorkspaceHeader = (content: ReactNode) => () => void;
const WorkspaceHeaderContext = createContext<RegisterWorkspaceHeader | null>(null);
type RegisterWorkspaceFullscreen = () => () => void;
const WorkspaceFullscreenContext = createContext<RegisterWorkspaceFullscreen | null>(null);

export const useWorkspaceHeader = () => useContext(WorkspaceHeaderContext);
export const useWorkspaceFullscreen = () => useContext(WorkspaceFullscreenContext);

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
  const [fullscreen, setFullscreen] = useState<{ owner: symbol; active: boolean } | null>(null);
  const registerFullscreen = useCallback<RegisterWorkspaceFullscreen>(() => {
    const owner = Symbol("workspace-fullscreen");
    setFullscreen({ owner, active: true });
    return () => setFullscreen((current) => (current?.owner === owner ? null : current));
  }, []);
  const registerHeader = useCallback<RegisterWorkspaceHeader>((content) => {
    const owner = Symbol("workspace-header");
    setHeader({ owner, content });
    return () => setHeader((current) => (current?.owner === owner ? null : current));
  }, []);
  return (
    <WorkspaceFullscreenContext.Provider value={registerFullscreen}>
      <WorkspaceHeaderContext.Provider value={registerHeader}>
        <main
          className="flex h-screen min-h-screen overflow-hidden bg-background text-foreground"
          style={{ "--shell-sidebar-top-padding": overlayTitleBar ? "48px" : "8px" } as CSSProperties}
        >
          {overlayTitleBar && <WindowDragRegion className="fixed inset-x-0 top-0 z-40 h-10" />}
          <div className={fullscreen?.active ? "hidden" : "contents"}>
            {sidebar}
            {contextualSidebar}
          </div>
          <section
            className={cn(
              "relative flex min-w-0 flex-1 flex-col overflow-hidden bg-background",
              overlayTitleBar && "pt-10",
            )}
          >
            {(header || fullscreen) && (
              <div
                className={cn(
                  "pointer-events-none z-50 flex h-10 shrink-0 items-center",
                  overlayTitleBar ? "absolute inset-x-0 top-0" : "relative",
                  overlayTitleBar && fullscreen?.active && "pl-20",
                )}
              >
                <div className="h-full min-w-0 flex-1">{header?.content}</div>
                {fullscreen && (
                  <div
                    role="group"
                    aria-label="应用窗口操作"
                    className="pointer-events-auto flex shrink-0 items-center gap-0.5 px-2"
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground"
                      onClick={() => setFullscreen((current) => current && { ...current, active: !current.active })}
                      aria-label={fullscreen.active ? "退出应用全屏" : "进入应用全屏"}
                      title={fullscreen.active ? "退出应用全屏" : "进入应用全屏"}
                    >
                      {fullscreen.active ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
                    </Button>
                    <Button asChild variant="ghost" size="icon" className="size-8 text-muted-foreground">
                      <NavLink to="/apps" aria-label="退出应用，返回应用列表" title="退出应用，返回应用列表">
                        <LogOut className="size-3.5" aria-hidden="true" />
                      </NavLink>
                    </Button>
                  </div>
                )}
              </div>
            )}
            {children}
          </section>
        </main>
      </WorkspaceHeaderContext.Provider>
    </WorkspaceFullscreenContext.Provider>
  );
};
