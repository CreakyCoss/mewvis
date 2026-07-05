import { AlertCircle, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { useWorkspaceOverview } from "@/features/pages/workspace/provider";
import { TavernPage as TavernSurface } from "@/features/pages/tavern/components/tavern-page";
import {
  TAVERN_ROOM_SEARCH_PARAM,
  TAVERN_SCENE_INSTANCE_SEARCH_PARAM,
  TAVERN_STORY_SEARCH_PARAM,
  TAVERN_STORY_NODE_SEARCH_PARAM,
  TAVERN_ID_SEARCH_PARAM,
  TAVERN_RUNTIME_PATH_SEARCH_PARAM,
} from "@/features/pages/tavern/navigation";
import { listWorkspaceFiles, type WorkspaceFileEntry } from "@/features/pages/workspace/files-api";
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
    <TavernContainer
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

type TavernContainerProps = {
  workspace: Workspace;
  runtimeScope?: {
    storyId?: string;
    storyNodeId?: string;
    tavernId?: string;
    runtimePath?: string;
  };
  initialRoomId?: string;
  initialSceneInstanceId?: string;
  onExitStoryRuntime: () => void;
};

const TavernContainer = ({
  workspace,
  runtimeScope,
  initialRoomId,
  initialSceneInstanceId,
  onExitStoryRuntime,
}: TavernContainerProps) => {
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
    <TavernSurface
      workspace={workspace}
      runtimeScope={runtimeScope}
      files={files}
      runtimeModel={runtimeModels[0] ?? null}
      initialRoomId={initialRoomId}
      initialSceneInstanceId={initialSceneInstanceId}
      onExitStoryRuntime={onExitStoryRuntime}
    />
  );
};
