import type { TavernRuntimeRoom as TavernRoom } from "@/features/pages/taverns/room/model";
import type { Ref } from "react";
import { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useLlmSettingsStore } from "@/features/pages/settings/llm/store";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { WindowDragRegion } from "@/components/window-drag-region";
import type { Workspace } from "@/features/pages/workspace/types";
import { cn } from "@/lib/utils";
import type { TavernRuntimeScope } from "../storage";
import type { TavernMessage } from "../tavern/types";
import { TavernRoomContent } from "./content";
import { createTavernRoomInitialState, useTavernRoomContext } from "./context";
import { Header } from "./header";
import { SidePanel, type SidePanelHandle } from "./side-panel";
import { loadTavernRoomSessionState, saveTavernRoomSessionState } from "./storage";

const fullScreenDialogContentClassName =
  "!fixed !inset-0 !left-0 !top-0 !flex !h-screen !max-h-none !w-screen !max-w-none !translate-x-0 !translate-y-0 flex-col gap-0 overflow-hidden !rounded-none p-0 !ring-0";

export type TavernRoomOpenOptions = {
  workspace: Workspace;
  runtimeScope?: TavernRuntimeScope;
  room: TavernRoom;
  initialMessages?: TavernMessage[];
  sceneInstanceId?: string;
  onClose?: () => void;
};

export type TavernRoomHandle = (options: TavernRoomOpenOptions) => void;

type TavernRoomDialogProps = {
  bind: Ref<TavernRoomHandle>;
};

export const TavernRoomDialog = ({ bind }: TavernRoomDialogProps) => {
  const [openOptions, setOpenOptions] = useState<TavernRoomOpenOptions | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isTavernStateHydrated, setIsTavernStateHydrated] = useState(false);
  const runtimeModels = useLlmSettingsStore((store) => store.runtimeModels);
  const loadSettings = useLlmSettingsStore((store) => store.loadSettings);
  const runtimeModel = runtimeModels[0] ?? null;
  const workspace = useTavernRoomContext((store) => store.workspace);
  const roomState = useTavernRoomContext((store) => store.state);
  const setRoomState = useTavernRoomContext((store) => store.setState);
  const resetRoomStore = useTavernRoomContext((store) => store.resetRoomStore);
  const setRuntimeModel = useTavernRoomContext((store) => store.setRuntimeModel);
  const activeRoom = useTavernRoomContext((store) => store.activeRoom);
  const visualPreset = useTavernRoomContext((store) => store.visualPreset);
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
  const sidePanelRef = useRef<SidePanelHandle | null>(null);
  const openRequestIdRef = useRef(0);

  const open = useCallback(
    (options: TavernRoomOpenOptions) => {
      openRequestIdRef.current += 1;
      setOpenOptions(options);
      resetRoomStore({
        workspace: options.workspace,
        runtimeScope: options.runtimeScope,
        runtimeModel,
        initialRoom: options.room,
        initialMessages: options.initialMessages,
        initialSceneInstanceId: options.sceneInstanceId,
      });
      setIsOpen(true);
      setIsTavernStateHydrated(false);
      setIsSidePanelOpen(false);
    },
    [resetRoomStore, runtimeModel],
  );

  useImperativeHandle(bind, () => open, [bind, open]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    setRuntimeModel(runtimeModel);
  }, [runtimeModel, setRuntimeModel]);

  useEffect(() => {
    if (!openOptions) {
      return;
    }

    let isCancelled = false;
    const requestId = openRequestIdRef.current;
    setIsTavernStateHydrated(false);

    const nextState = createTavernRoomInitialState({
      room: openOptions.room,
      initialMessages: openOptions.initialMessages,
      sceneInstanceId: openOptions.sceneInstanceId,
    });

    void loadTavernRoomSessionState(openOptions.workspace.path, openOptions.runtimeScope, nextState)
      .then((sessionState) => {
        if (isCancelled || requestId !== openRequestIdRef.current) {
          return;
        }

        setRoomState(sessionState ?? nextState);
        setIsTavernStateHydrated(true);
      })
      .catch((loadError) => {
        if (isCancelled || requestId !== openRequestIdRef.current) {
          return;
        }

        console.error("Failed to load tavern room session state", loadError);
        setRoomState(
          createTavernRoomInitialState({
            room: openOptions.room,
            initialMessages: openOptions.initialMessages,
            sceneInstanceId: openOptions.sceneInstanceId,
          }),
        );
        setIsTavernStateHydrated(true);
      });

    return () => {
      isCancelled = true;
    };
  }, [openOptions, setRoomState]);

  useEffect(() => {
    if (!openOptions || !isTavernStateHydrated) {
      return;
    }

    void saveTavernRoomSessionState(workspace.path, openOptions.runtimeScope, roomState).catch((saveError) => {
      console.error("Failed to save tavern room session state", saveError);
    });
  }, [isTavernStateHydrated, openOptions, roomState, workspace.path]);

  const closeRoomSurface = () => {
    sidePanelRef.current?.hide();
    setIsOpen(false);
    openOptions?.onClose?.();
  };

  if (!isOpen) {
    return null;
  }

  if (!isTavernStateHydrated || !activeRoom) {
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
            {!isTavernStateHydrated ? "正在加载酒馆房间" : "当前没有可进入的酒馆房间，请先从故事节点打开酒馆。"}
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
        <DialogTitle className="sr-only">{activeRoom.title ? `${activeRoom.title} · 酒馆` : "酒馆房间"}</DialogTitle>
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
                sidePanelRef.current?.toggle();
              }}
            />

            <TavernRoomContent isOpen={isOpen} isSidePanelOpen={isSidePanelOpen} />
          </main>

          <SidePanel bind={sidePanelRef} isOpen={isSidePanelOpen} onOpenChange={setIsSidePanelOpen} />
        </div>
      </DialogContent>
    </Dialog>
  );
};
