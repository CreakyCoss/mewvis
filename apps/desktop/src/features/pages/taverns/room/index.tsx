import type { Ref } from "react";
import { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useLlmSettingsStore } from "@/features/pages/settings/llm/store";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { WindowDragRegion } from "@/components/window-drag-region";
import { cn } from "@/lib/utils";
import { TavernRoomContent } from "./content";
import { useTavernRoomContext } from "./context";
import { Header } from "./header";
import type { TavernRoomSessionState } from "./model";
import { SidePanel } from "./side-panel";
import { openTavernRoomSessionState, saveTavernRoomSessionState } from "./storage";

const fullScreenDialogContentClassName =
  "!fixed !inset-0 !left-0 !top-0 !flex !h-screen !max-h-none !w-screen !max-w-none !translate-x-0 !translate-y-0 flex-col gap-0 overflow-hidden !rounded-none p-0 !ring-0";

export type TavernRoomOpenOptions = {
  workspacePath: string;
  initialState: TavernRoomSessionState;
};

export type TavernRoomHandle = (options: TavernRoomOpenOptions) => void;

type TavernRoomDialogProps = {
  bind: Ref<TavernRoomHandle>;
};

export const TavernRoomDialog = ({ bind }: TavernRoomDialogProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isTavernStateHydrated, setIsTavernStateHydrated] = useState(false);
  const [openError, setOpenError] = useState("");
  const runtimeModels = useLlmSettingsStore((store) => store.runtimeModels);
  const loadSettings = useLlmSettingsStore((store) => store.loadSettings);
  const runtimeModel = runtimeModels[0] ?? null;
  const workspacePath = useTavernRoomContext((store) => store.workspacePath);
  const roomState = useTavernRoomContext((store) => store.state);
  const initializeRoom = useTavernRoomContext((store) => store.initializeRoom);
  const setRuntimeModel = useTavernRoomContext((store) => store.setRuntimeModel);
  const activeRoom = useTavernRoomContext((store) => store.activeRoom);
  const visualPreset = useTavernRoomContext((store) => store.visualPreset);
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
  const openRequestIdRef = useRef(0);

  const open = useCallback(
    (options: TavernRoomOpenOptions) => {
      openRequestIdRef.current += 1;
      const requestId = openRequestIdRef.current;
      const nextWorkspacePath = options.workspacePath.trim();
      setIsOpen(true);
      setIsTavernStateHydrated(false);
      setOpenError("");
      setIsSidePanelOpen(false);

      void openTavernRoomSessionState(nextWorkspacePath, options.initialState)
        .then((state) => {
          if (requestId !== openRequestIdRef.current) {
            return;
          }

          initializeRoom({
            workspacePath: nextWorkspacePath,
            state,
            initialState: options.initialState,
          });
          setIsTavernStateHydrated(true);
        })
        .catch((loadError) => {
          if (requestId !== openRequestIdRef.current) {
            return;
          }

          console.error("Failed to open tavern room session state", loadError);
          setOpenError("酒馆房间数据加载失败，请检查运行文件后重试。");
        });
    },
    [initializeRoom],
  );

  useImperativeHandle(bind, () => open, [bind, open]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    setRuntimeModel(runtimeModel);
  }, [runtimeModel, setRuntimeModel]);

  useEffect(() => {
    if (!workspacePath || !isTavernStateHydrated) {
      return;
    }

    void saveTavernRoomSessionState(workspacePath, roomState).catch((saveError) => {
      console.error("Failed to save tavern room session state", saveError);
    });
  }, [isTavernStateHydrated, roomState, workspacePath]);

  const closeRoomSurface = () => {
    openRequestIdRef.current += 1;
    setIsSidePanelOpen(false);
    setIsOpen(false);
  };

  if (!isOpen) {
    return null;
  }

  if (!isTavernStateHydrated || openError || !activeRoom) {
    return (
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeRoomSurface();
          }
        }}
      >
        <DialogContent
          showCloseButton={false}
          overlayClassName="bg-black/5 backdrop-blur-none"
          className={cn(fullScreenDialogContentClassName, "items-center justify-center bg-background text-foreground")}
        >
          <DialogTitle className="sr-only">酒馆房间</DialogTitle>
          <div className="rounded-md border bg-card px-5 py-4 text-sm text-muted-foreground">
            {openError ||
              (!isTavernStateHydrated ? "正在加载酒馆房间" : "当前没有可进入的酒馆房间，请先从故事节点打开酒馆。")}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          closeRoomSurface();
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-black/5 backdrop-blur-none"
        className={cn(fullScreenDialogContentClassName, "text-foreground", visualPreset.tavern.page)}
      >
        <DialogTitle className="sr-only">
          {activeRoom.identity.title ? `${activeRoom.identity.title} · 酒馆` : "酒馆房间"}
        </DialogTitle>
        <WindowDragRegion className="h-10 shrink-0" />
        <div
          className={[
            "grid min-h-0 w-full flex-1 grid-cols-1",
            isSidePanelOpen ? "lg:grid-cols-[minmax(0,1fr)_360px]" : "lg:grid-cols-1",
          ].join(" ")}
        >
          <main className="flex min-h-0 min-w-0 flex-col">
            <Header
              isSidePanelOpen={isSidePanelOpen}
              onBack={closeRoomSurface}
              onToggleSidePanel={() => {
                setIsSidePanelOpen((current) => !current);
              }}
            />

            <TavernRoomContent isOpen={isOpen} isSidePanelOpen={isSidePanelOpen} />
          </main>

          <SidePanel isOpen={isSidePanelOpen} />
        </div>
      </DialogContent>
    </Dialog>
  );
};
