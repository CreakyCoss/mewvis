import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { listWorkspaces } from "@/api/workspace";
import { Spinner } from "@/components/ui/spinner";
import type { Workspace } from "@/features/pages/workspace/types";
import { Chat } from "../../chat";
import type { ChatInitialData } from "../../chat/type";
import type { ChatInputResources } from "../../components/chat-input/type";
import { useWorkspaceStore } from "../../home/workspace-store";
import { loadResources } from "../../resources";

const defaultDisplayOptions = {
  showThinkingProcess: true,
  showToolCallProcess: true,
};

type WorkspaceChatState = {
  workspace: Workspace | null;
  resources: ChatInputResources;
  isLoading: boolean;
  error: string;
};

const initialState: WorkspaceChatState = {
  workspace: null,
  resources: {},
  isLoading: true,
  error: "",
};

const loadWorkspace = async (workspaceId: string) => {
  const workspace = (await listWorkspaces())
    .map((item) => (item.isDefault ? { ...item, name: "默认工作区" } : item))
    .find((item) => item.id === workspaceId);

  if (!workspace) {
    throw new Error("工作区不存在");
  }

  return {
    workspace,
    resources: await loadResources(workspace.id),
  };
};

export const WorkspaceChat = () => {
  const { workspaceId = "", chatId = "" } = useParams();
  const workspaceStore = useWorkspaceStore();
  const [state, setState] = useState(initialState);
  const initialData = useMemo<ChatInitialData>(
    () => ({
      resources: state.resources,
      displayOptions: defaultDisplayOptions,
    }),
    [state.resources],
  );

  useEffect(() => {
    let cancelled = false;
    setState(initialState);

    if (!workspaceId) {
      setState({ ...initialState, isLoading: false, error: "工作区地址无效" });
      return () => {
        cancelled = true;
      };
    }

    void loadWorkspace(workspaceId)
      .then(({ workspace, resources }) => {
        if (!cancelled) {
          setState({ workspace, resources, isLoading: false, error: "" });
          workspaceStore.setCurrentWorkspace(workspace);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({
            ...initialState,
            isLoading: false,
            error: error instanceof Error ? error.message : "工作区会话加载失败",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [workspaceId, workspaceStore.setCurrentWorkspace]);

  if (!workspaceId || !chatId) {
    return (
      <main className="flex h-full min-h-0 items-center justify-center bg-background px-6 text-sm text-destructive">
        会话地址无效
      </main>
    );
  }

  if (state.isLoading || !state.workspace) {
    return (
      <main className="flex h-full min-h-0 items-center justify-center gap-2 bg-background px-6 text-sm text-muted-foreground">
        {state.error ? null : <Spinner />}
        <span>{state.error || "正在加载工作区会话"}</span>
      </main>
    );
  }

  const workspace = state.workspace;

  return (
    <Chat
      chatId={chatId}
      workspacePath={workspace.path}
      initialData={initialData}
      onStatusChange={({ chatId: statusChatId, isRunning }) =>
        workspaceStore.setChatLoading(workspaceId, statusChatId, isRunning)
      }
    />
  );
};
