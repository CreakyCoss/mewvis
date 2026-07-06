import { AlertCircle, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ManagementPage } from "@/features/pages/taverns/manage";
import { ManagementProvider } from "@/features/pages/taverns/manage/provider";
import {
  TavernPageProvider,
  useTavernPageContext,
} from "@/features/pages/taverns/components/context";
import { TavernRoomDialog } from "@/features/pages/taverns/room";
import {
  TAVERN_ROOM_SEARCH_PARAM,
  TAVERN_SCENE_INSTANCE_SEARCH_PARAM,
  TAVERN_STORY_SEARCH_PARAM,
  TAVERN_STORY_NODE_SEARCH_PARAM,
  TAVERN_ID_SEARCH_PARAM,
  TAVERN_RUNTIME_PATH_SEARCH_PARAM,
} from "@/features/pages/taverns/navigation";
import {
  syncTavernRoomActiveScene,
  switchTavernRoomSceneInstance,
} from "@/features/pages/taverns/tavern/runtime/active-scene-runtime";
import { disposeTavernBridgeSessionWorkers } from "@/features/pages/taverns/tavern/runtime/conversation";
import { createDefaultTavernState } from "@/features/pages/taverns/tavern/state/state-normalizer";
import {
  loadTavernState,
  saveTavernState,
  type TavernRuntimeScope,
} from "@/features/pages/taverns/tavern/state/storage";
import type { TavernRoom, TavernState } from "@/features/pages/taverns/tavern/types";
import { listWorkspaceFiles, type WorkspaceFileEntry } from "@/features/pages/workspace/files-api";
import { useWorkspaceOverview } from "@/features/pages/workspace/provider";
import type { Workspace } from "@/features/pages/workspace/types";
import { useLlmSettingsStore } from "../settings/llm/store";

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
  const searchParams = new URLSearchParams(location.search);
  const initialRoomId = searchParams.get(TAVERN_ROOM_SEARCH_PARAM) ?? "";
  const initialSceneInstanceId = searchParams.get(TAVERN_SCENE_INSTANCE_SEARCH_PARAM) ?? "";
  const storyId = searchParams.get(TAVERN_STORY_SEARCH_PARAM)?.trim() ?? "";
  const storyNodeId = searchParams.get(TAVERN_STORY_NODE_SEARCH_PARAM)?.trim() ?? "";
  const tavernId = searchParams.get(TAVERN_ID_SEARCH_PARAM)?.trim() ?? "";
  const tavernRuntimePath = searchParams.get(TAVERN_RUNTIME_PATH_SEARCH_PARAM)?.trim() ?? "";
  const isStoryRuntimeRequest = Boolean(storyId || tavernId || tavernRuntimePath);
  const exitTavernSurface = () => {
    if (isStoryRuntimeRequest) {
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

  const storyRuntimeWorkspace = isStoryRuntimeRequest
    ? storyRuntimeWorkspaceFromPath({
        workspaceId,
        storyId,
        runtimePath: tavernRuntimePath,
      })
    : null;
  const tavernWorkspace = isStoryRuntimeRequest ? storyRuntimeWorkspace : workspace;

  if (!isStoryRuntimeRequest && !tavernWorkspace && !overview) {
    return <LoadingState />;
  }

  if (isStoryRuntimeRequest && !storyRuntimeWorkspace) {
    return <StoryRuntimeMissingState onGoHome={() => navigate("/", { replace: true })} />;
  }

  if (!tavernWorkspace) {
    return <Navigate to="/" replace />;
  }

  return (
    <TavernsPageRuntime
      workspace={tavernWorkspace}
      runtimeScope={{
        storyId: storyId || undefined,
        storyNodeId: storyNodeId || undefined,
        tavernId: tavernId || undefined,
        runtimePath: tavernRuntimePath || undefined,
      }}
      initialRoomId={initialRoomId || tavernId}
      initialSceneInstanceId={initialSceneInstanceId}
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
  const runtimeModels = useLlmSettingsStore((store) => store.runtimeModels);
  const loadSettings = useLlmSettingsStore((store) => store.loadSettings);
  const [files, setFiles] = useState<WorkspaceFileEntry[]>([]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    let isCancelled = false;

    void listWorkspaceFiles(workspace.path)
      .then((nextFiles) => {
        if (!isCancelled) {
          setFiles(nextFiles);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setFiles([]);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [workspace.path]);

  return (
    <TavernPageProvider
      workspace={workspace}
      runtimeModel={runtimeModels[0] ?? null}
    >
      <TavernsPageContent
        files={files}
        runtimeScope={runtimeScope}
        initialRoomId={initialRoomId}
        initialSceneInstanceId={initialSceneInstanceId}
        onExitStoryRuntime={onExitStoryRuntime}
      />
    </TavernPageProvider>
  );
};

type TavernsPageContentProps = {
  files: WorkspaceFileEntry[];
  runtimeScope?: TavernRuntimeScope;
  initialRoomId?: string;
  initialSceneInstanceId?: string;
  onExitStoryRuntime: () => void;
};

const TavernsPageContent = ({
  files,
  runtimeScope = {},
  initialRoomId,
  initialSceneInstanceId,
  onExitStoryRuntime,
}: TavernsPageContentProps) => {
  const {
    activeRoom,
    setDraft,
    setDraftCursor,
    setError,
    setExecutionSteps,
    setExecutionTraceAnchorMessageId,
    setIsGeneratingReplySuggestions,
    setIsManagedAutoRunStarted,
    setIsManagedModeEnabled,
    setIsQuickSummaryBusy,
    setIsSending,
    setReplySuggestions,
    setState,
    setTurnStatus,
    state,
    workspace,
  } = useTavernPageContext();
  const runtimeScopeKey = `${runtimeScope.storyId ?? ""}:${runtimeScope.storyNodeId ?? ""}:${runtimeScope.tavernId ?? ""}:${runtimeScope.runtimePath ?? ""}`;
  const tavernRuntimeScope = useMemo(() => ({
    storyId: runtimeScope.storyId,
    storyNodeId: runtimeScope.storyNodeId,
    tavernId: runtimeScope.tavernId,
    runtimePath: runtimeScope.runtimePath,
  }), [runtimeScope.runtimePath, runtimeScope.storyId, runtimeScope.storyNodeId, runtimeScope.tavernId]);
  const isStoryRuntimeScope = Boolean(
    tavernRuntimeScope.storyId &&
    tavernRuntimeScope.tavernId &&
    tavernRuntimeScope.runtimePath,
  );
  const [isTavernStateHydrated, setIsTavernStateHydrated] = useState(false);
  const [isRoomDialogOpen, setIsRoomDialogOpen] = useState(isStoryRuntimeScope);
  const workspaceIdRef = useRef(workspace.id);
  const tavernRoomsRef = useRef<TavernRoom[]>(state.rooms);
  const initialOpenKeyRef = useRef("");
  const runtimeScopeKeyRef = useRef(runtimeScopeKey);

  useEffect(() => {
    tavernRoomsRef.current = state.rooms;
  }, [state.rooms]);

  useEffect(() => {
    const workspaceId = workspace.id;
    const workspacePath = workspace.path;

    return () => {
      const rooms = [
        ...new Map(
          tavernRoomsRef.current
            .filter((room) => room.workspaceId === workspaceId)
            .map((room) => [room.id, room] as const),
        ).values(),
      ];

      if (rooms.length === 0) {
        return;
      }

      void Promise.allSettled(
        rooms.map((room) => disposeTavernBridgeSessionWorkers({ workspacePath, room })),
      ).then((results) => {
        const failed = results.find(
          (result): result is PromiseRejectedResult => result.status === "rejected",
        );
        if (failed) {
          console.warn("Failed to dispose tavern bridge workers", failed.reason);
        }
      });
    };
  }, [workspace.id, workspace.path]);

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
    setIsRoomDialogOpen(isStoryRuntimeScope);
    setDraft("");
    setDraftCursor(0);
    setError("");
    setIsManagedModeEnabled(false);
    setIsManagedAutoRunStarted(false);
    setIsSending(false);
    setIsGeneratingReplySuggestions(false);
    setReplySuggestions([]);
    setIsQuickSummaryBusy(false);
    setTurnStatus("");
    setExecutionSteps([]);
    setExecutionTraceAnchorMessageId("");
  }, [
    isStoryRuntimeScope,
    runtimeScopeKey,
    setDraft,
    setDraftCursor,
    setError,
    setExecutionSteps,
    setExecutionTraceAnchorMessageId,
    setIsGeneratingReplySuggestions,
    setIsManagedAutoRunStarted,
    setIsManagedModeEnabled,
    setIsQuickSummaryBusy,
    setIsSending,
    setReplySuggestions,
    setState,
    setTurnStatus,
    workspace.id,
  ]);

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
        toast.error(isStoryRuntimeScope
          ? "无法加载故事酒馆记录，请从故事页重新进入或重建。"
          : "无法加载酒馆记录，已使用默认酒馆。");
        setState(isStoryRuntimeScope ? createEmptyTavernState() : createDefaultTavernState(workspace.id));
        setIsTavernStateHydrated(true);
      });

    return () => {
      isCancelled = true;
    };
  }, [isStoryRuntimeScope, runtimeScopeKey, setState, tavernRuntimeScope, workspace.id, workspace.path]);

  useEffect(() => {
    if (
      isTavernStateHydrated &&
      state.rooms.some((room) => room.workspaceId === workspace.id)
    ) {
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

  const openTavernRoom = useCallback((room: TavernRoom, sceneInstanceId?: string) => {
    setState((current) => {
      const currentRoom = current.rooms.find((item) => item.id === room.id) ?? room;
      const nextRoom = sceneInstanceId
        ? switchTavernRoomSceneInstance(currentRoom, sceneInstanceId)
        : syncTavernRoomActiveScene(currentRoom);
      const hasRoom = current.rooms.some((item) => item.id === room.id);

      return {
        ...current,
        activeRoomId: room.id,
        rooms: hasRoom
          ? current.rooms.map((item) => item.id === room.id ? nextRoom : item)
          : [...current.rooms, nextRoom],
      };
    });
    setIsRoomDialogOpen(true);
  }, [setState]);

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
  }, [
    initialRoomId,
    initialSceneInstanceId,
    isTavernStateHydrated,
    openTavernRoom,
    state.rooms,
  ]);

  const closeRoomDialog = useCallback(() => {
    if (isStoryRuntimeScope) {
      onExitStoryRuntime();
      return;
    }

    setIsRoomDialogOpen(false);
  }, [isStoryRuntimeScope, onExitStoryRuntime]);

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
    <>
      {!isStoryRuntimeScope && (
        <ManagementProvider
          workspace={workspace}
          state={state}
          setState={setState}
          onError={setError}
          onCloseActiveRoom={() => setIsRoomDialogOpen(false)}
        >
          <ManagementPage onOpenRoom={openTavernRoom} />
        </ManagementProvider>
      )}

      <TavernRoomDialog
        files={files}
        isOpen={isRoomDialogOpen && Boolean(activeRoom)}
        onClose={closeRoomDialog}
      />
    </>
  );
};
