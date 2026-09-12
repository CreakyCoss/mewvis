import { Minimize2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { WindowDragRegion } from "@/components/window-drag-region";
import { useApplicationLayout } from "./application-layout";

export const AppWorkspace = ({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) => {
  const { fullscreen, setFullscreen } = useApplicationLayout();
  return (
    <main className="flex h-screen min-h-screen overflow-hidden bg-background text-foreground">
      <WindowDragRegion className="fixed inset-x-0 top-0 z-40 h-10" />
      <div className={fullscreen ? "hidden" : "contents"}>{sidebar}</div>
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background pt-10">{children}</section>
      {fullscreen ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="fixed right-3 top-1 z-50 h-8 bg-background"
          onClick={() => setFullscreen(false)}
          aria-label="退出应用全屏"
        >
          <Minimize2 className="size-4" />
          退出全屏
        </Button>
      ) : null}
    </main>
  );
};
