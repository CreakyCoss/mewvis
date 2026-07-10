import { Loader2, Plus, Wine } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Navigate, useParams } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RoomCard } from "@/features/pages/taverns/components/room-card";
import { RoomEditor, type RoomEditorHandle } from "@/features/pages/taverns/manage";
import { formatCount } from "@/features/pages/taverns/manage/utils";
import { useTavernManagement } from "@/features/pages/taverns/store";
import { loadTavernRooms, saveTavernRooms } from "@/features/pages/taverns/storage";
import type { TavernRoomConfig } from "@/features/pages/taverns/manage/model";
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
  return <TavernsPageContent key={workspace.id} workspace={workspace} />;
};

type TavernsPageContentProps = {
  workspace: Workspace;
};

const TavernsPageContent = ({ workspace }: TavernsPageContentProps) => {
  const [rooms, setRooms] = useState<TavernRoomConfig[]>([]);
  const [areTavernRoomsLoaded, setAreTavernRoomsLoaded] = useState(false);
  const roomEditorRef = useRef<RoomEditorHandle>(null);
  const [roomOperationStatus, setRoomOperationStatus] = useState("");

  useEffect(() => {
    let isCancelled = false;
    setAreTavernRoomsLoaded(false);

    loadTavernRooms(workspace.path, workspace.id)
      .then((nextRooms) => {
        if (isCancelled) {
          return;
        }

        setRooms(nextRooms);
        setAreTavernRoomsLoaded(true);
      })
      .catch((loadError) => {
        if (isCancelled) {
          return;
        }

        console.error("Failed to load tavern state", loadError);
        toast.error("无法加载酒馆记录，已使用空酒馆列表。");
        setRooms([]);
        setAreTavernRoomsLoaded(true);
      });

    return () => {
      isCancelled = true;
    };
  }, [workspace.id, workspace.path]);

  useEffect(() => {
    if (areTavernRoomsLoaded) {
      void saveTavernRooms(workspace.path, workspace.id, rooms).catch((saveError) => {
        console.error("Failed to save tavern state", saveError);
      });
    }
  }, [areTavernRoomsLoaded, rooms, workspace.id, workspace.path]);

  const management = useTavernManagement({
    rooms,
    setRooms,
  });
  const { createRoom, patchRoom, globalRuntimeModel } = management;

  const openRoomEditor = (room: TavernRoomConfig) => {
    roomEditorRef.current?.(room);
  };

  const createOrdinaryRoom = () => {
    const room = createRoom();
    setRoomOperationStatus("已创建手动酒馆。");

    if (!room) {
      return;
    }

    window.setTimeout(() => {
      openRoomEditor(room);
    }, 0);
  };

  if (!areTavernRoomsLoaded) {
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
                手动创建
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
      <RoomEditor bind={roomEditorRef} globalRuntimeModel={globalRuntimeModel} onPatchRoom={patchRoom} />
    </div>
  );
};
