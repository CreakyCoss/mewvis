import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Navigate, useParams } from "react-router";
import { createAgentRuntime } from "@/ai/agent-runtime/runtime";
import { useWorkspaceOverview } from "@/features/pages/workspace/provider";
import { TavernPage as TavernSurface } from "@/features/pages/tavern/components/tavern-page";
import {
  listWorkspaceFiles,
  type WorkspaceFileEntry,
} from "@/features/pages/workspace/files-api";
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

export const TavernPage = () => {
  const { workspaceId } = useParams();
  const { overview, activeWorkspace, defaultWorkspace } = useWorkspaceOverview();
  const workspaces = overview?.workspaces ?? [];
  const workspace =
    workspaces.find((item) => item.id === workspaceId) ??
    activeWorkspace ??
    defaultWorkspace ??
    workspaces[0] ??
    null;

  if (!workspace && !overview) {
    return <LoadingState />;
  }

  if (!workspace) {
    return <Navigate to="/" replace />;
  }

  return <TavernContainer workspace={workspace} />;
};

const TavernContainer = ({ workspace }: { workspace: Workspace }) => {
  const agentRuntime = useMemo(() => createAgentRuntime(), []);
  const runtimeModels = useLlmSettingsStore((store) => store.runtimeModels);
  const loadSettings = useLlmSettingsStore((store) => store.loadSettings);
  const [files, setFiles] = useState<WorkspaceFileEntry[]>([]);
  const [runtimeAgentId, setRuntimeAgentId] = useState("");
  const [, setIsRoomImmersive] = useState(false);

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

  useEffect(() => {
    let isCancelled = false;

    void agentRuntime.listAgents()
      .then((result) => {
        if (!isCancelled) {
          setRuntimeAgentId(result.defaultAgentId || result.agents[0]?.id || "");
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setRuntimeAgentId("");
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [agentRuntime]);

  return (
    <TavernSurface
      workspace={workspace}
      files={files}
      runtimeModel={runtimeModels[0] ?? null}
      runtimeAgentId={runtimeAgentId}
      onRoomImmersiveChange={setIsRoomImmersive}
    />
  );
};
