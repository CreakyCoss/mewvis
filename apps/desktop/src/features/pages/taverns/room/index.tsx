import type { Ref } from "react";
import { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useLlmSettingsStore } from "@/features/pages/settings/llm/store";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { WindowDragRegion } from "@/components/window-drag-region";
import type { Workspace } from "@/features/pages/workspace/types";
import type { TavernRoom as TavernRoomConfig } from "@/features/pages/taverns/manage/model";
import { cn } from "@/lib/utils";
import { TavernRoomContent } from "./content";
import { useTavernRoomContext } from "./context";
import { Header } from "./header";
import { createTavernRoomSessionState, type TavernRoomOpeningInput } from "./model";
import { SidePanel } from "./side-panel";
import { ensureTavernWorkspaceDirectory, loadTavernRoomSessionState, saveTavernRoomSessionState } from "./storage";

const fullScreenDialogContentClassName =
  "!fixed !inset-0 !left-0 !top-0 !flex !h-screen !max-h-none !w-screen !max-w-none !translate-x-0 !translate-y-0 flex-col gap-0 overflow-hidden !rounded-none p-0 !ring-0";

export type TavernRoomOpenOptions = {
  tavernRoom: TavernRoomConfig;
  openingInput: TavernRoomOpeningInput;
  tavernWorkspacePath: string;
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
  const roomState = useTavernRoomContext((store) => store.state);
  const setRoomState = useTavernRoomContext((store) => store.setState);
  const resetRoomStore = useTavernRoomContext((store) => store.resetRoomStore);
  const setRuntimeModel = useTavernRoomContext((store) => store.setRuntimeModel);
  const activeRoom = useTavernRoomContext((store) => store.activeRoom);
  const visualPreset = useTavernRoomContext((store) => store.visualPreset);
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
  const openRequestIdRef = useRef(0);

  const createTavernWorkspace = useCallback(
    (tavernWorkspacePath: string): Workspace => ({
      id: tavernWorkspacePath,
      name: "酒馆工作区",
      description: null,
      path: tavernWorkspacePath,
      isDefault: false,
      isPinned: false,
      order: 0,
      groupId: null,
      createdAt: 0,
      updatedAt: 0,
    }),
    [],
  );

  const open = useCallback(
    (options: TavernRoomOpenOptions) => {
      openRequestIdRef.current += 1;
      const initialState = createTavernRoomSessionState({
        tavernRoom: options.tavernRoom,
        openingInput: options.openingInput,
      });
      const workspace = createTavernWorkspace(options.tavernWorkspacePath);
      setOpenOptions(options);
      resetRoomStore({
        workspace,
        runtimeModel,
        initialRuntime: initialState.runtime,
        initialMessages: initialState.messages,
      });
      setIsOpen(true);
      setIsTavernStateHydrated(false);
      setIsSidePanelOpen(false);
    },
    [createTavernWorkspace, resetRoomStore, runtimeModel],
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

    const nextState = createTavernRoomSessionState({
      tavernRoom: openOptions.tavernRoom,
      openingInput: openOptions.openingInput,
    });

    void ensureTavernWorkspaceDirectory(openOptions.tavernWorkspacePath)
      .then(() => loadTavernRoomSessionState(openOptions.tavernWorkspacePath, nextState))
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
          createTavernRoomSessionState({
            tavernRoom: openOptions.tavernRoom,
            openingInput: openOptions.openingInput,
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

    void saveTavernRoomSessionState(openOptions.tavernWorkspacePath, roomState).catch((saveError) => {
      console.error("Failed to save tavern room session state", saveError);
    });
  }, [isTavernStateHydrated, openOptions, roomState]);

  const closeRoomSurface = () => {
    setIsSidePanelOpen(false);
    setIsOpen(false);
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
