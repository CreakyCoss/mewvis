import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router";
import { useWorkspaceOverview } from "@/features/pages/workspace/provider";
import { WorkspaceChatPage } from "@/features/pages/chat/components/workspace-chat-page";
import type { StoryChatSeed } from "@/features/pages/chat/components/workspace-chat-page/story-seed";
import { isDefaultWorkspace } from "@/features/pages/workspace/default";
import type { Workspace } from "@/features/pages/workspace/types";
import { APP_DISPLAY_NAME } from "@/product-config";

type ChatLocationState = {
  storyChatSeed?: StoryChatSeed | null;
};

const LoadingState = ({ error }: { error: string }) => (
  <main className="flex h-full min-h-0 items-center justify-center bg-background px-6 text-foreground">
    <div className="max-w-md space-y-3 text-center">
      <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground motion-reduce:animate-none" />
      <h1 className="text-lg font-semibold">正在准备默认工作区</h1>
      <p className="text-sm text-muted-foreground">
        {error
          ? "默认工作区暂时不可用，请稍后重试。"
          : `${APP_DISPLAY_NAME} 会自动使用默认工作区保存未绑定项目的会话。`}
      </p>
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
    </div>
  </main>
);

export const ChatPage = () => {
  const { workspaceId, sessionId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    overview,
    sections,
    isLoading,
    error,
    activeWorkspace,
    defaultWorkspace,
    setActiveWorkspace,
    openCreateWorkspace,
  } = useWorkspaceOverview();
  const workspaces = overview?.workspaces ?? [];
  const fallbackWorkspace =
    defaultWorkspace ?? activeWorkspace ?? workspaces.find(isDefaultWorkspace) ?? workspaces[0] ?? null;
  const workspace = workspaces.find((item) => item.id === workspaceId) ?? fallbackWorkspace;
  const isRouteNewSession = !sessionId && location.pathname.endsWith("/new");
  const locationState = location.state as ChatLocationState | null;
  const storyChatSeed = locationState?.storyChatSeed ?? null;

  useEffect(() => {
    if (!workspace) {
      return;
    }

    if (activeWorkspace?.id !== workspace.id) {
      setActiveWorkspace(workspace);
    }
  }, [activeWorkspace?.id, setActiveWorkspace, workspace]);

  if (!workspace && (isLoading || !overview)) {
    return <LoadingState error={error} />;
  }

  if (!workspace) {
    return <LoadingState error={error || "默认工作区暂时不可用，请稍后重试。"} />;
  }

  if (workspaceId && workspace.id !== workspaceId) {
    return <Navigate to={`/chat/${workspace.id}/new`} replace state={location.state} />;
  }

  const openWorkspace = (targetWorkspace: Workspace) => {
    setActiveWorkspace(targetWorkspace);
    navigate(`/chat/${targetWorkspace.id}/new`);
  };

  return (
    <WorkspaceChatPage
      workspace={workspace}
      workspaceSections={sections}
      routeSessionId={sessionId ?? null}
      isRouteNewSession={isRouteNewSession}
      onSessionCreated={(nextSessionId) => {
        if (isRouteNewSession) {
          navigate(
            {
              pathname: `/chat/${workspace.id}/session/${nextSessionId}`,
            },
            { replace: true, state: location.state },
          );
        }
      }}
      onOpenWorkspace={openWorkspace}
      onCreateWorkspace={openCreateWorkspace}
      storyChatSeed={storyChatSeed}
    />
  );
};
