import { AlertCircle, Loader2, MoreHorizontal, Plus, TriangleAlertIcon, Wine } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  formatCount,
  OrdinaryCreate,
  type OrdinaryCreateHandle,
  RoomCard,
  RoomCardRuntimeProvider,
  RoomEditor,
  type RoomEditorHandle,
  type PendingDangerAction,
  useSyncManagementStore,
} from "@/features/pages/taverns/manage";
import { TavernRoomDialog, type TavernRoomHandle } from "@/features/pages/taverns/room";
import { parseTavernRouteSearch } from "@/features/pages/taverns/navigation";
import { projectTavernSceneOntoRoom } from "@/features/pages/taverns/tavern/runtime/active-scene-runtime";
import { createDefaultTavernState } from "@/features/pages/taverns/tavern/state/state-normalizer";
import {
  loadTavernState,
  saveTavernState,
  type TavernRuntimeScope,
} from "@/features/pages/taverns/tavern/state/storage";
import type { TavernRoom, TavernState } from "@/features/pages/taverns/tavern/types";
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

const StoryRuntimeMissingState = ({ onGoHome }: { onGoHome: () => void }) => (
  <section className="flex h-full min-h-0 items-center justify-center bg-background px-6 text-center">
    <div className="flex max-w-sm flex-col items-center gap-3">
      <AlertCircle className="size-9 text-muted-foreground" />
      <div className="text-base font-medium">无法加载故事酒馆</div>
      <p className="text-sm leading-6 text-muted-foreground">缺少故事酒馆运行目录，请从故事页重新选择酒馆进入。</p>
      <Button type="button" variant="outline" onClick={onGoHome}>
        返回首页
      </Button>
    </div>
  </section>
);

const createEmptyTavernState = (): TavernState => ({
  version: 4,
  activeRoomId: "",
  rooms: [],
  messagesByInstance: {},
  workflowTracesByInstance: {},
});

export const TavernPage = () => {
  const { workspaceId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { overview, activeWorkspace, defaultWorkspace } = useWorkspaceOverview();
  const workspaces = overview?.workspaces ?? [];
  const workspace =
    workspaces.find((item) => item.id === workspaceId) ?? activeWorkspace ?? defaultWorkspace ?? workspaces[0] ?? null;
  const routeSearch = parseTavernRouteSearch(location.search);
  const exitTavernSurface = () => {
    if (routeSearch.isStoryRuntimeRequest) {
      navigate(
        {
          pathname: "/stories",
          search: "",
        },
        { replace: true },
      );
      return;
    }

    navigate(
      {
        pathname: location.pathname,
        search: location.search,
        hash: location.hash,
      },
      { replace: true },
    );
  };

  const storyRuntimeWorkspace = routeSearch.isStoryRuntimeRequest
    ? storyRuntimeWorkspaceFromPath({
        workspaceId,
        storyId: routeSearch.storyId,
        runtimePath: routeSearch.runtimePath,
      })
    : null;
  const tavernWorkspace = routeSearch.isStoryRuntimeRequest ? storyRuntimeWorkspace : workspace;

  if (!routeSearch.isStoryRuntimeRequest && !tavernWorkspace && !overview) {
    return <LoadingState />;
  }

  if (routeSearch.isStoryRuntimeRequest && !storyRuntimeWorkspace) {
    return <StoryRuntimeMissingState onGoHome={() => navigate("/", { replace: true })} />;
  }

  if (!tavernWorkspace) {
    return <Navigate to="/" replace />;
  }

  return (
    <TavernsPageRuntime
      workspace={tavernWorkspace}
      runtimeScope={routeSearch.runtimeScope}
      initialRoomId={routeSearch.initialRoomId}
      initialSceneInstanceId={routeSearch.initialSceneInstanceId}
      onExitStoryRuntime={exitTavernSurface}
    />
  );
};

const storyRuntimeWorkspaceFromPath = ({
  workspaceId,
  storyId,
  runtimePath,
}: {
  workspaceId?: string;
  storyId: string;
  runtimePath: string;
}): Workspace | null => {
  const trimmedPath = runtimePath.trim();
  if (!trimmedPath) {
    return null;
  }

  const markerMatch = /[\\/]\.tavern[\\/]/.exec(trimmedPath);
  const rootPath = markerMatch ? trimmedPath.slice(0, markerMatch.index) : "";
  if (!rootPath) {
    return null;
  }

  return {
    id: workspaceId || storyId,
    name: "故事酒馆运行时",
    description: null,
    path: rootPath,
    isDefault: false,
    isPinned: false,
    order: 0,
    groupId: null,
    createdAt: 0,
    updatedAt: 0,
  };
};

type TavernsPageRuntimeProps = {
  workspace: Workspace;
  runtimeScope?: TavernRuntimeScope;
  initialRoomId?: string;
  initialSceneInstanceId?: string;
  onExitStoryRuntime: () => void;
};

const TavernsPageRuntime = ({
  workspace,
  runtimeScope,
  initialRoomId,
  initialSceneInstanceId,
  onExitStoryRuntime,
}: TavernsPageRuntimeProps) => {
  return (
    <TavernsPageContent
      workspace={workspace}
      runtimeScope={runtimeScope}
      initialRoomId={initialRoomId}
      initialSceneInstanceId={initialSceneInstanceId}
      onExitStoryRuntime={onExitStoryRuntime}
    />
  );
};

type TavernsPageContentProps = {
  workspace: Workspace;
  runtimeScope?: TavernRuntimeScope;
  initialRoomId?: string;
  initialSceneInstanceId?: string;
  onExitStoryRuntime: () => void;
};

const TavernsPageContent = ({
  workspace,
  runtimeScope = {},
  initialRoomId,
  initialSceneInstanceId,
  onExitStoryRuntime,
}: TavernsPageContentProps) => {
  const runtimeScopeKey = `${runtimeScope.storyId ?? ""}:${runtimeScope.storyNodeId ?? ""}:${runtimeScope.tavernId ?? ""}:${runtimeScope.runtimePath ?? ""}`;
  const tavernRuntimeScope = useMemo(
    () => ({
      storyId: runtimeScope.storyId,
      storyNodeId: runtimeScope.storyNodeId,
      tavernId: runtimeScope.tavernId,
      runtimePath: runtimeScope.runtimePath,
    }),
    [runtimeScope.runtimePath, runtimeScope.storyId, runtimeScope.storyNodeId, runtimeScope.tavernId],
  );
  const isStoryRuntimeScope = Boolean(
    tavernRuntimeScope.storyId && tavernRuntimeScope.tavernId && tavernRuntimeScope.runtimePath,
  );
  const [state, setState] = useState<TavernState>(() =>
    isStoryRuntimeScope ? createEmptyTavernState() : createDefaultTavernState(workspace.id),
  );
  const activeRoom = useMemo(() => {
    const room = state.rooms.find((room) => room.id === state.activeRoomId) ?? state.rooms[0] ?? null;
    return room ? projectTavernSceneOntoRoom(room) : null;
  }, [state.activeRoomId, state.rooms]);
  const [isTavernStateHydrated, setIsTavernStateHydrated] = useState(false);
  const roomDialogRef = useRef<TavernRoomHandle>(null);
  const ordinaryCreateRef = useRef<OrdinaryCreateHandle>(null);
  const roomEditorRef = useRef<RoomEditorHandle>(null);
  const workspaceIdRef = useRef(workspace.id);
  const initialOpenKeyRef = useRef("");
  const runtimeScopeKeyRef = useRef(runtimeScopeKey);
  const [pendingDangerAction, setPendingDangerAction] = useState<PendingDangerAction | null>(null);
  const [roomOperationStatus, setRoomOperationStatus] = useState("");

  useEffect(() => {
    const didWorkspaceChange = workspaceIdRef.current !== workspace.id;
    const didRuntimeScopeChange = runtimeScopeKeyRef.current !== runtimeScopeKey;
    if (!didWorkspaceChange && !didRuntimeScopeChange) {
      return;
    }

    workspaceIdRef.current = workspace.id;
    runtimeScopeKeyRef.current = runtimeScopeKey;
    initialOpenKeyRef.current = "";
    setState(isStoryRuntimeScope ? createEmptyTavernState() : createDefaultTavernState(workspace.id));
    setIsTavernStateHydrated(false);
  }, [isStoryRuntimeScope, runtimeScopeKey, setState, workspace.id]);

  useEffect(() => {
    let isCancelled = false;
    setIsTavernStateHydrated(false);

    loadTavernState(workspace.path, workspace.id, tavernRuntimeScope)
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
        toast.error(
          isStoryRuntimeScope
            ? "无法加载故事酒馆记录，请从故事页重新进入或重建。"
            : "无法加载酒馆记录，已使用默认酒馆。",
        );
        setState(isStoryRuntimeScope ? createEmptyTavernState() : createDefaultTavernState(workspace.id));
        setIsTavernStateHydrated(true);
      });

    return () => {
      isCancelled = true;
    };
  }, [isStoryRuntimeScope, runtimeScopeKey, setState, tavernRuntimeScope, workspace.id, workspace.path]);

  useEffect(() => {
    if (isTavernStateHydrated && state.rooms.some((room) => room.workspaceId === workspace.id)) {
      void saveTavernState(workspace.path, workspace.id, state, tavernRuntimeScope).catch((saveError) => {
        console.error("Failed to save tavern state", saveError);
      });
    }
  }, [isTavernStateHydrated, runtimeScopeKey, state, tavernRuntimeScope, workspace.id, workspace.path]);

  useEffect(() => {
    if (!isTavernStateHydrated || isStoryRuntimeScope || state.rooms.length > 0) {
      return;
    }

    setState(createDefaultTavernState(workspace.id));
  }, [isStoryRuntimeScope, isTavernStateHydrated, setState, state.rooms.length, workspace.id]);

  const openTavernRoom = useCallback(
    (room: TavernRoom, sceneInstanceId?: string) => {
      roomDialogRef.current?.({
        workspace,
        runtimeScope: tavernRuntimeScope,
        room,
        storyData: state,
        sceneInstanceId,
        onStateChange: setState,
        onClose: isStoryRuntimeScope ? onExitStoryRuntime : undefined,
      });
    },
    [isStoryRuntimeScope, onExitStoryRuntime, state, tavernRuntimeScope, workspace],
  );

  useEffect(() => {
    if (!isTavernStateHydrated || !initialRoomId) {
      return;
    }

    const key = `${initialRoomId}:${initialSceneInstanceId ?? ""}`;
    if (initialOpenKeyRef.current === key) {
      return;
    }

    const room = state.rooms.find((item) => item.id === initialRoomId);
    if (!room) {
      return;
    }

    initialOpenKeyRef.current = key;
    openTavernRoom(room, initialSceneInstanceId);
  }, [initialRoomId, initialSceneInstanceId, isTavernStateHydrated, openTavernRoom, state.rooms]);

  const reportManagementError = useCallback((message: string) => {
    if (message) {
      toast.error(message);
    }
  }, []);

  const management = useSyncManagementStore({
    workspace,
    state,
    setState,
    onError: reportManagementError,
    onCloseActiveRoom: () => undefined,
  });
  const {
    rooms,
    characterById,
    messagesByRoomId,
    createRoom,
    patchRoom,
    globalRuntimeModel,
    runTextFieldAgent,
    regenerateDirectorProfile,
  } = management;
  const totalRoomMessageCount = Object.values(messagesByRoomId).reduce((sum, messages) => sum + messages.length, 0);
  const totalRoomCharacterCount = rooms.reduce((sum, room) => sum + (room.localCharacters?.length ?? 0), 0);

  const requestDangerAction = (action: PendingDangerAction) => {
    setPendingDangerAction(action);
  };

  const openRoomEditor = (room: TavernRoom) => {
    roomEditorRef.current?.(room);
  };

  const closeDangerAction = () => {
    setPendingDangerAction(null);
  };

  const confirmDangerAction = () => {
    if (!pendingDangerAction) {
      return;
    }

    pendingDangerAction.onConfirm();
    closeDangerAction();
  };

  if (!isTavernStateHydrated) {
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-background px-6 text-sm text-muted-foreground">
        正在加载酒馆
      </div>
    );
  }

  if (isStoryRuntimeScope && !activeRoom) {
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-background px-6">
        <div className="rounded-md border bg-card px-5 py-4 text-sm text-muted-foreground">
          当前没有可进入的酒馆房间，请先从故事节点打开酒馆。
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-1 overflow-hidden bg-background text-foreground">
      {!isStoryRuntimeScope && (
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
                    <span>{formatCount(totalRoomCharacterCount, "角色")}</span>
                    <span>{formatCount(totalRoomMessageCount, "消息")}</span>
                    {roomOperationStatus && <span aria-live="polite">{roomOperationStatus}</span>}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <OrdinaryCreate
                  bind={ordinaryCreateRef}
                  onCreateRoom={createRoom}
                  onOpenRoomEditor={openRoomEditor}
                  onOperationStatusChange={setRoomOperationStatus}
                  showTrigger={false}
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="size-9"
                      title="更多酒馆操作"
                      aria-label="更多酒馆操作"
                    >
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuLabel>酒馆操作</DropdownMenuLabel>
                    <DropdownMenuItem onSelect={() => ordinaryCreateRef.current?.()}>
                      <Plus className="size-4" />
                      普通创建
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </header>

            <section className="space-y-3">
              <RoomCardRuntimeProvider
                value={{
                  openRoomEditor,
                  onRequestDangerAction: requestDangerAction,
                  onOperationStatusChange: setRoomOperationStatus,
                }}
              >
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] items-start gap-5">
                  {rooms.length > 0 ? (
                    rooms.map((room) => <RoomCard key={room.id} room={room} />)
                  ) : (
                    <div className="col-span-full rounded-md border bg-muted/20 px-4 py-5 text-sm text-muted-foreground">
                      酒馆暂无房间。可以手动创建一个空房间并维护酒馆配置。
                    </div>
                  )}
                </div>
              </RoomCardRuntimeProvider>
            </section>
          </div>
        </ScrollArea>
      )}

      <TavernRoomDialog bind={roomDialogRef} />
      <Dialog
        open={Boolean(pendingDangerAction)}
        onOpenChange={(open) => {
          if (!open) {
            closeDangerAction();
          }
        }}
      >
        {pendingDangerAction && (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive">
                  <TriangleAlertIcon className="size-4" />
                </span>
                <DialogTitle>{pendingDangerAction.title}</DialogTitle>
              </div>
              <DialogDescription>{pendingDangerAction.description}</DialogDescription>
            </DialogHeader>

            {pendingDangerAction.summary && (
              <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                {pendingDangerAction.summary}
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDangerAction}>
                取消
              </Button>
              <Button type="button" variant="destructive" onClick={confirmDangerAction}>
                {pendingDangerAction.confirmLabel}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <RoomEditor
        bind={roomEditorRef}
        characterById={characterById}
        messagesByRoomId={messagesByRoomId}
        globalRuntimeModel={globalRuntimeModel}
        onPatchRoom={patchRoom}
        onRunTextFieldAgent={runTextFieldAgent}
        onRegenerateDirectorProfile={regenerateDirectorProfile}
      />
    </div>
  );
};
