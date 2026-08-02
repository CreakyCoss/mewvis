import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Loader2, Plus } from "lucide-react";
import { getAiAgentSettings } from "@/api/agents";
import { normalizeAgentAvatarId, resolveAvatar } from "@/assets/avatars";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDateTime } from "@/utils/time";
import { SettingsPageHeader } from "../page-header";
import { AgentEditDialog, type AgentEditDialogHandle } from "./edit";
import type { AiAgent } from "./types";

const AgentRow = ({ agent, onOpen }: { agent: AiAgent; onOpen: () => void }) => {
  const avatar = resolveAvatar(normalizeAgentAvatarId(agent.avatar));

  return (
    <button
      type="button"
      className="group grid min-h-15 w-full min-w-0 grid-cols-[minmax(180px,0.85fr)_minmax(240px,1.4fr)_150px] items-center gap-4 border-b border-border/70 px-4 text-left transition-colors hover:bg-accent/20 focus-visible:z-10 focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/20 focus-visible:outline-none max-md:grid-cols-[minmax(160px,0.9fr)_minmax(200px,1.1fr)]"
      onClick={onOpen}
      aria-label={`编辑角色 ${agent.name || "未命名角色"}`}
    >
      <span className="flex min-w-0 items-center gap-3">
        <img src={avatar.src} alt="" className="size-9 shrink-0 rounded-lg object-cover" />
        <span className="truncate text-sm font-medium">{agent.name || "未命名角色"}</span>
      </span>
      <span className="truncate text-sm text-muted-foreground">{agent.description || "暂无描述"}</span>
      <span className="text-sm text-muted-foreground max-md:hidden">{formatDateTime(agent.updatedAt)}</span>
    </button>
  );
};

const AgentTableHeader = () => (
  <div className="grid min-h-15 grid-cols-[minmax(180px,0.85fr)_minmax(240px,1.4fr)_150px] items-center gap-4 border-b border-border/70 px-4 text-xs font-medium text-muted-foreground max-md:grid-cols-[minmax(160px,0.9fr)_minmax(200px,1.1fr)]">
    <span>角色</span>
    <span>描述</span>
    <span className="max-md:hidden">更新时间</span>
  </div>
);

export const AgentSettingsPage = () => {
  const agentEditDialogRef = useRef<AgentEditDialogHandle>(null);
  const [agents, setAgents] = useState<AiAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAgents = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const settings = await getAiAgentSettings();
      setAgents(settings.agents);
    } catch (caught) {
      setError(String(caught));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  const openCreateAgent = () => {
    agentEditDialogRef.current?.open({ mode: "create" });
  };

  const openEditAgent = (agent: AiAgent) => {
    agentEditDialogRef.current?.open({ mode: "edit", agent });
  };

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-surface/45">
      <SettingsPageHeader
        title="角色设置"
        description="管理聊天和协作流程中可复用的角色"
        action={
          <Button type="button" onClick={openCreateAgent}>
            <Plus className="size-4" />
            <span>添加角色</span>
          </Button>
        }
      />

      <ScrollArea className="min-h-0 flex-1 bg-transparent">
        <div className="w-full px-6">
          {error ? (
            <div
              role="alert"
              className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
            >
              {error}
            </div>
          ) : null}

          {isLoading ? (
            <div className="flex min-h-72 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
              <span>正在读取角色设置</span>
            </div>
          ) : agents.length > 0 ? (
            <div className="w-full">
              <AgentTableHeader />
              <div aria-label="已配置的角色">
                {agents.map((agent) => (
                  <AgentRow key={agent.id} agent={agent} onOpen={() => openEditAgent(agent)} />
                ))}
              </div>
            </div>
          ) : (
            <div className="app-empty-state mt-8 flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-2xl px-6 text-center">
              <span className="flex size-12 items-center justify-center rounded-xl bg-accent text-primary">
                <Bot className="size-6" />
              </span>
              <div className="space-y-1">
                <h3 className="font-semibold">还没有创建角色</h3>
                <p className="text-sm text-muted-foreground">创建角色后，可以在聊天和协作流程中直接选择使用。</p>
              </div>
              <Button type="button" onClick={openCreateAgent}>
                <Plus className="size-4" />
                <span>添加角色</span>
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>

      <AgentEditDialog bind={agentEditDialogRef} onSaved={loadAgents} />
    </section>
  );
};
