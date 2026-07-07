import { Loader2, Plus, Wine } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useParams } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RoomCard } from "@/features/pages/taverns/components/room-card";
import { RoomEditor, type RoomEditorHandle } from "@/features/pages/taverns/manage";
import { formatCount } from "@/features/pages/taverns/manage/utils";
import { useTavernManagement } from "@/features/pages/taverns/store";
import { createDefaultTavernState } from "@/features/pages/taverns/tavern/state/state-normalizer";
import { loadTavernState, saveTavernState } from "@/features/pages/taverns/storage";
import type { TavernState } from "@/features/pages/taverns/tavern/types";
import type { TavernRoom } from "@/features/pages/taverns/manage/model";
import { useWorkspaceOverview } from "@/features/pages/workspace/provider";
import type { Workspace } from "@/features/pages/workspace/types";

const LoadingState = () => (
  <section className="flex h-full min-h-0 items-center justify-center bg-background text-sm text-muted-foreground">
    <div className="flex items-center gap-2">
      <Loader2 className="size-4 animate-spin" />
      <span>正在准备酒馆</span>
    </div>
  </section>
);

export const TavernPage = () => {
  const { workspaceId } = useParams();
  const { overview, activeWorkspace, defaultWorkspace } = useWorkspaceOverview();
  const workspaces = overview?.workspaces ?? [];
  const workspace =
    workspaces.find((item) => item.id === workspaceId) ?? activeWorkspace ?? defaultWorkspace ?? workspaces[0] ?? null;

  if (!workspace && !overview) {
    return <LoadingState />;
  }

  if (!workspace) {
    return <Navigate to="/" replace />;
  }

  return <TavernsPageRuntime workspace={workspace} />;
};

type TavernsPageRuntimeProps = {
  workspace: Workspace;
};

const TavernsPageRuntime = ({ workspace }: TavernsPageRuntimeProps) => {
  return <TavernsPageContent workspace={workspace} />;
};

type TavernsPageContentProps = {
  workspace: Workspace;
};

const TavernsPageContent = ({ workspace }: TavernsPageContentProps) => {
  const [state, setState] = useState<TavernState>(() => createDefaultTavernState(workspace.id));
  const [isTavernStateHydrated, setIsTavernStateHydrated] = useState(false);
  const roomEditorRef = useRef<RoomEditorHandle>(null);
  const workspaceIdRef = useRef(workspace.id);
  const [roomOperationStatus, setRoomOperationStatus] = useState("");

  useEffect(() => {
    const didWorkspaceChange = workspaceIdRef.current !== workspace.id;
    if (!didWorkspaceChange) {
      return;
    }

    workspaceIdRef.current = workspace.id;
    setState(createDefaultTavernState(workspace.id));
    setIsTavernStateHydrated(false);
  }, [setState, workspace.id]);

  useEffect(() => {
    let isCancelled = false;
    setIsTavernStateHydrated(false);

    loadTavernState(workspace.path, workspace.id)
      .then((nextState) => {
        if (isCancelled) {
          return;
        }

        setState(nextState);
        setIsTavernStateHydrated(true);
      })
      .catch((loadError) => {
        if (isCancelled) {
          return;
        }

        console.error("Failed to load tavern state", loadError);
        toast.error("无法加载酒馆记录，已使用默认酒馆。");
        setState(createDefaultTavernState(workspace.id));
        setIsTavernStateHydrated(true);
      });

    return () => {
      isCancelled = true;
    };
  }, [setState, workspace.id, workspace.path]);

  useEffect(() => {
    if (isTavernStateHydrated && state.rooms.some((room) => room.workspaceId === workspace.id)) {
      void saveTavernState(workspace.path, workspace.id, state).catch((saveError) => {
        console.error("Failed to save tavern state", saveError);
      });
    }
  }, [isTavernStateHydrated, state, workspace.id, workspace.path]);

  useEffect(() => {
    if (!isTavernStateHydrated || state.rooms.length > 0) {
      return;
    }

    setState(createDefaultTavernState(workspace.id));
  }, [isTavernStateHydrated, setState, state.rooms.length, workspace.id]);

  const reportManagementError = useCallback((message: string) => {
    if (message) {
      toast.error(message);
    }
  }, []);

  const management = useTavernManagement({
    workspace,
    state,
    setState,
    onError: reportManagementError,
  });
  const { rooms, createRoom, patchRoom, globalRuntimeModel, runTextFieldAgent } = management;

  const openRoomEditor = (room: TavernRoom) => {
    roomEditorRef.current?.(room);
  };

  const createOrdinaryRoom = () => {
    const room = createRoom();
    setRoomOperationStatus("已创建普通酒馆。");

    if (!room) {
      return;
    }

    window.setTimeout(() => {
      openRoomEditor(room);
    }, 0);
  };

  if (!isTavernStateHydrated) {
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-background px-6 text-sm text-muted-foreground">
        正在加载酒馆
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-1 overflow-hidden bg-background text-foreground">
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex w-full flex-col gap-4 px-5 py-5 lg:px-7">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-muted/35">
                <Wine className="size-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-xl font-semibold leading-7">酒馆管理</h1>
                <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>{formatCount(rooms.length, "房间")}</span>
                  {roomOperationStatus && <span aria-live="polite">{roomOperationStatus}</span>}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button type="button" size="sm" className="h-9 gap-1.5" onClick={createOrdinaryRoom}>
                <Plus className="size-4" />
                普通创建
              </Button>
            </div>
          </header>

          <section className="space-y-3">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] items-start gap-5">
              {rooms.length > 0 ? (
                rooms.map((room) => (
                  <RoomCard
                    key={room.id}
                    management={management}
                    room={room}
                    openRoomEditor={openRoomEditor}
                    onOperationStatusChange={setRoomOperationStatus}
                  />
                ))
              ) : (
                <div className="col-span-full rounded-md border bg-muted/20 px-4 py-5 text-sm text-muted-foreground">
                  酒馆暂无房间。可以手动创建一个空房间并维护酒馆配置。
                </div>
              )}
            </div>
          </section>
        </div>
      </ScrollArea>
      <RoomEditor
        bind={roomEditorRef}
        globalRuntimeModel={globalRuntimeModel}
        onPatchRoom={patchRoom}
        onRunTextFieldAgent={runTextFieldAgent}
      />
    </div>
  );
};
