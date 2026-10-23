import { createContext, useCallback, useContext, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import type { ApplicationViewport } from "@mewvis/app-sdk/browser";
import { platform } from "@/platform";
import { cn } from "design-system/lib/utils";
import { WindowDragRegion } from "@/workbench/shell/layout/window-drag-region";
import { LogOut, Maximize2, Minimize2 } from "lucide-react";
import { NavLink } from "react-router";
import { Button } from "design-system/components/ui/button";

type RegisterWorkspaceHeader = (content: ReactNode) => () => void;
const WorkspaceHeaderContext = createContext<RegisterWorkspaceHeader | null>(null);
type RegisterWorkspaceFullscreen = (options?: { immersive?: boolean }) => () => void;
const WorkspaceFullscreenContext = createContext<RegisterWorkspaceFullscreen | null>(null);
const WorkspaceViewportContext = createContext<ApplicationViewport>({
  fullscreen: false,
  immersive: false,
  safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
});

export const useWorkspaceHeader = () => useContext(WorkspaceHeaderContext);
export const useWorkspaceFullscreen = () => useContext(WorkspaceFullscreenContext);
export const useWorkspaceViewport = () => useContext(WorkspaceViewportContext);

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
  const floatingControls = !overlayTitleBar && !header;
  const [fullscreen, setFullscreen] = useState<{ owner: symbol; active: boolean; immersive: boolean } | null>(null);
  const immersive = Boolean(fullscreen?.active && fullscreen.immersive);
  const viewport = useMemo<ApplicationViewport>(
    () => ({
      fullscreen: Boolean(fullscreen?.active),
      immersive,
      safeArea: immersive
        ? { top: 40, right: 88, bottom: 0, left: overlayTitleBar ? 80 : 0 }
        : { top: 0, right: 0, bottom: 0, left: 0 },
    }),
    [fullscreen?.active, immersive, overlayTitleBar],
  );
  const registerFullscreen = useCallback<RegisterWorkspaceFullscreen>((options) => {
    const owner = Symbol("workspace-fullscreen");
    setFullscreen({ owner, active: true, immersive: options?.immersive === true });
    return () => setFullscreen((current) => (current?.owner === owner ? null : current));
  }, []);
  const registerHeader = useCallback<RegisterWorkspaceHeader>((content) => {
    const owner = Symbol("workspace-header");
    setHeader({ owner, content });
    return () => setHeader((current) => (current?.owner === owner ? null : current));
  }, []);
  const windowControlClassName = cn(
    "size-8 text-muted-foreground",
    immersive &&
      "text-foreground/65 hover:bg-background/40 hover:text-foreground active:bg-background/60 focus-visible:bg-background/70 focus-visible:text-foreground dark:hover:bg-background/40 [&_svg]:drop-shadow-[0_1px_1px_var(--background)]",
  );
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
              overlayTitleBar && !immersive && "pt-10",
            )}
          >
            {(header || fullscreen) && (
              <div
                className={cn(
                  "pointer-events-none z-50 flex h-10 shrink-0 items-center",
                  overlayTitleBar || floatingControls || immersive ? "absolute inset-x-0 top-0" : "relative",
                  overlayTitleBar && fullscreen?.active && "pl-20",
                )}
              >
                <div className="h-full min-w-0 flex-1">{header?.content}</div>
                {fullscreen && (
                  <div
                    role="group"
                    aria-label="应用窗口操作"
                    className={cn(
                      "pointer-events-auto flex shrink-0 items-center gap-0.5",
                      immersive
                        ? "mr-2 rounded-lg p-0.5 transition-colors duration-150 hover:bg-background/50 hover:backdrop-blur-sm has-[:focus-visible]:bg-background/70 has-[:focus-visible]:backdrop-blur-sm motion-reduce:transition-none"
                        : floatingControls
                          ? "mr-2 rounded-lg border border-border/70 bg-background/95 p-0.5 shadow-sm"
                          : "px-2",
                    )}
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className={windowControlClassName}
                      onClick={() => setFullscreen((current) => current && { ...current, active: !current.active })}
                      aria-label={fullscreen.active ? "退出应用全屏" : "进入应用全屏"}
                      title={fullscreen.active ? "退出应用全屏" : "进入应用全屏"}
                    >
                      {fullscreen.active ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
                    </Button>
                    <Button asChild variant="ghost" size="icon" className={windowControlClassName}>
                      <NavLink to="/apps" aria-label="退出应用，返回应用列表" title="退出应用，返回应用列表">
                        <LogOut className="size-3.5" aria-hidden="true" />
                      </NavLink>
                    </Button>
                  </div>
                )}
              </div>
            )}
            <WorkspaceViewportContext.Provider value={viewport}>{children}</WorkspaceViewportContext.Provider>
          </section>
        </main>
      </WorkspaceHeaderContext.Provider>
    </WorkspaceFullscreenContext.Provider>
  );
};
