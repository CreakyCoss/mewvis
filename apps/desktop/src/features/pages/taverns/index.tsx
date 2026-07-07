import { AlertCircle, Loader2, Plus, Wine } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RoomCard } from "@/features/pages/taverns/components/room-card";
import { RoomEditor, type RoomEditorHandle } from "@/features/pages/taverns/manage";
import { formatCount } from "@/features/pages/taverns/manage/utils";
import { TavernRoomDialog, type TavernRoomHandle } from "@/features/pages/taverns/room";
import type { TavernRuntimeRoom } from "@/features/pages/taverns/room/model";
import { createTavernRuntimeRoomFromConfig } from "@/features/pages/taverns/room/model/runtime-room";
import { parseTavernRouteSearch } from "@/features/pages/taverns/navigation";
import { useTavernManagement } from "@/features/pages/taverns/store";
import { createDefaultTavernState } from "@/features/pages/taverns/tavern/state/state-normalizer";
import { loadTavernState, saveTavernState, type TavernRuntimeScope } from "@/features/pages/taverns/storage";
import type { TavernMessage, TavernState } from "@/features/pages/taverns/tavern/types";
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
});

type TavernPageLocationState = {
  tavernRoom?: TavernRuntimeRoom;
  tavernInitialMessages?: TavernMessage[];
};

const getTavernRoomFromLocation = (state: unknown): TavernRuntimeRoom | undefined => {
  if (!state || typeof state !== "object") {
    return undefined;
  }

  const room = (state as TavernPageLocationState).tavernRoom;
  return room && typeof room.id === "string" ? room : undefined;
};

const getTavernInitialMessagesFromLocation = (state: unknown): TavernMessage[] => {
  if (!state || typeof state !== "object") {
    return [];
  }

  const messages = (state as TavernPageLocationState).tavernInitialMessages;
  return Array.isArray(messages) ? messages : [];
};

export const TavernPage = () => {
  const { workspaceId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { overview, activeWorkspace, defaultWorkspace } = useWorkspaceOverview();
  const workspaces = overview?.workspaces ?? [];
  const workspace =
    workspaces.find((item) => item.id === workspaceId) ?? activeWorkspace ?? defaultWorkspace ?? workspaces[0] ?? null;
  const routeSearch = parseTavernRouteSearch(location.search);
  const locationRoom = getTavernRoomFromLocation(location.state);
  const locationInitialMessages = getTavernInitialMessagesFromLocation(location.state);
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
      initialRoom={routeSearch.isStoryRuntimeRequest ? locationRoom : undefined}
      initialMessages={routeSearch.isStoryRuntimeRequest ? locationInitialMessages : undefined}
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
  initialRoom?: TavernRuntimeRoom;
  initialMessages?: TavernMessage[];
  onExitStoryRuntime: () => void;
};

const TavernsPageRuntime = ({
  workspace,
  runtimeScope,
  initialRoomId,
  initialSceneInstanceId,
  initialRoom,
  initialMessages,
  onExitStoryRuntime,
}: TavernsPageRuntimeProps) => {
  return (
    <TavernsPageContent
      workspace={workspace}
      runtimeScope={runtimeScope}
      initialRoomId={initialRoomId}
      initialSceneInstanceId={initialSceneInstanceId}
      initialRoom={initialRoom}
      initialMessages={initialMessages}
      onExitStoryRuntime={onExitStoryRuntime}
    />
  );
};

type TavernsPageContentProps = {
  workspace: Workspace;
  runtimeScope?: TavernRuntimeScope;
  initialRoomId?: string;
  initialSceneInstanceId?: string;
  initialRoom?: TavernRuntimeRoom;
  initialMessages?: TavernMessage[];
  onExitStoryRuntime: () => void;
};

const TavernsPageContent = ({
  workspace,
  runtimeScope = {},
  initialRoomId,
  initialSceneInstanceId,
  initialRoom,
  initialMessages = [],
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
  const [isTavernStateHydrated, setIsTavernStateHydrated] = useState(false);
  const roomDialogRef = useRef<TavernRoomHandle>(null);
  const roomEditorRef = useRef<RoomEditorHandle>(null);
  const workspaceIdRef = useRef(workspace.id);
  const initialOpenKeyRef = useRef("");
  const runtimeScopeKeyRef = useRef(runtimeScopeKey);
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
    if (isStoryRuntimeScope) {
      setState(createEmptyTavernState());
      setIsTavernStateHydrated(true);
      return;
    }

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
    if (isStoryRuntimeScope) {
      return;
    }

    if (isTavernStateHydrated && state.rooms.some((room) => room.workspaceId === workspace.id)) {
      void saveTavernState(workspace.path, workspace.id, state, tavernRuntimeScope).catch((saveError) => {
        console.error("Failed to save tavern state", saveError);
      });
    }
  }, [
    isStoryRuntimeScope,
    isTavernStateHydrated,
    runtimeScopeKey,
    state,
    tavernRuntimeScope,
    workspace.id,
    workspace.path,
  ]);

  useEffect(() => {
    if (!isTavernStateHydrated || isStoryRuntimeScope || state.rooms.length > 0) {
      return;
    }

    setState(createDefaultTavernState(workspace.id));
  }, [isStoryRuntimeScope, isTavernStateHydrated, setState, state.rooms.length, workspace.id]);

  const openTavernRoom = useCallback(
    (room: TavernRoom, sceneInstanceId?: string) => {
      const runtimeRoom =
        isStoryRuntimeScope && initialRoom?.id === room.id ? initialRoom : createTavernRuntimeRoomFromConfig(room);

      roomDialogRef.current?.({
        workspace,
        runtimeScope: tavernRuntimeScope,
        room: runtimeRoom,
        initialMessages: isStoryRuntimeScope && initialRoom?.id === runtimeRoom.id ? initialMessages : [],
        sceneInstanceId,
        onClose: isStoryRuntimeScope ? onExitStoryRuntime : undefined,
      });
    },
    [initialMessages, initialRoom, isStoryRuntimeScope, onExitStoryRuntime, tavernRuntimeScope, workspace],
  );

  useEffect(() => {
    if (!isTavernStateHydrated || (!initialRoomId && !isStoryRuntimeScope)) {
      return;
    }

    const key = `${initialRoomId ?? initialRoom?.id ?? ""}:${initialSceneInstanceId ?? ""}`;
    if (initialOpenKeyRef.current === key) {
      return;
    }

    const room = isStoryRuntimeScope ? initialRoom : state.rooms.find((item) => item.id === initialRoomId);
    if (!room) {
      return;
    }

    initialOpenKeyRef.current = key;
    openTavernRoom(room, initialSceneInstanceId);
  }, [
    initialRoomId,
    initialRoom,
    initialSceneInstanceId,
    isStoryRuntimeScope,
    isTavernStateHydrated,
    openTavernRoom,
    state.rooms,
  ]);

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

  if (isStoryRuntimeScope && state.rooms.length === 0 && !initialRoom) {
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
      )}

      <TavernRoomDialog bind={roomDialogRef} />

      <RoomEditor
        bind={roomEditorRef}
        globalRuntimeModel={globalRuntimeModel}
        onPatchRoom={patchRoom}
        onRunTextFieldAgent={runTextFieldAgent}
      />
    </div>
  );
};
