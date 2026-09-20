import { LogOut, Minimize2 } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink } from "react-router";
import { Button } from "design-system/components/ui/button";
import { WindowDragRegion } from "@/workbench/shell/layout/window-drag-region";
import { useApplicationLayout } from "./application-layout";

export const AppWorkspace = ({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) => {
  const { fullscreen, setFullscreen } = useApplicationLayout();
  return (
    <main className="flex h-screen min-h-screen overflow-hidden bg-background text-foreground">
      <WindowDragRegion className="fixed inset-x-0 top-0 z-40 h-10" />
      <div className={fullscreen ? "hidden" : "contents"}>{sidebar}</div>
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background pt-10">{children}</section>
      {fullscreen ? (
        <div
          role="group"
          aria-label="应用窗口操作"
          className="fixed top-0.5 right-2 z-50 flex h-9 items-center gap-0.5"
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            onClick={() => setFullscreen(false)}
            aria-label="退出应用全屏"
            title="退出全屏"
          >
            <Minimize2 className="size-3.5" />
          </Button>
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:bg-muted/70 hover:text-foreground"
          >
            <NavLink to="/apps" aria-label="退出应用，返回应用列表" title="退出应用，返回应用列表">
              <LogOut className="size-3.5" aria-hidden="true" />
            </NavLink>
          </Button>
        </div>
      ) : null}
    </main>
  );
};
