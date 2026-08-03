import { Bot, ChevronRight, GitBranch, Layers3, Settings, X } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AgentSettingsPage } from "./agent";
import { EmbeddingSettingsPage } from "./embedding";
import { LlmSettingsPage } from "./llm";
import { WorkflowSettingsPage } from "./workflow";

type SettingsPanelProps = {
  settingsError: string;
  skillsError: string;
  onBack: () => void;
  onOpenLlmSettings: () => void;
  onOpenEmbeddingSettings: () => void;
  onOpenAgentSettings: () => void;
  onOpenCollaborationWorkflowSettings: () => void;
};

export const SettingsPanel = ({
  settingsError,
  skillsError,
  onBack,
  onOpenLlmSettings,
  onOpenEmbeddingSettings,
  onOpenAgentSettings,
  onOpenCollaborationWorkflowSettings,
}: SettingsPanelProps) => {
  const settingsItems = [
    {
      title: "LLM 设置",
      description: "管理 Provider、API Key、API Endpoint 和启用模型。",
      category: "模型与凭据",
      icon: Settings,
      onClick: onOpenLlmSettings,
    },
    {
      title: "Embedding 设置",
      description: "管理向量化服务、API Key、服务地址和默认模型。",
      category: "模型与凭据",
      icon: Layers3,
      onClick: onOpenEmbeddingSettings,
    },
    {
      title: "角色设置",
      description: "创建和维护角色画像，聊天时独立选择模型。",
      category: "角色画像",
      icon: Bot,
      onClick: onOpenAgentSettings,
    },
    {
      title: "协作流程设置",
      description: "自定义协作流程、步骤顺序和每步执行的角色。",
      category: "流程编排",
      icon: GitBranch,
      onClick: onOpenCollaborationWorkflowSettings,
    },
  ];

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <ScrollArea className="min-h-0 flex-1 bg-background">
        <div className="mx-auto w-full max-w-6xl px-6 pt-8 pb-10">
          <div className="mb-5 flex items-start justify-between gap-6">
            <div className="min-w-0 space-y-1.5">
              <h2 className="text-xl font-semibold tracking-[-0.02em]">应用设置</h2>
              <p className="max-w-2xl text-sm text-muted-foreground">
                设置会影响所有工作区中的模型服务、语义检索、角色画像和协作流程。
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="-mt-1 shrink-0 rounded-xl"
              title="关闭设置"
              aria-label="关闭设置"
              onClick={onBack}
            >
              <X className="size-5" />
            </Button>
          </div>

          <div className="divide-y divide-border/75">
            {settingsItems.map(({ title, description, category, icon: Icon, onClick }) => (
              <button
                key={title}
                type="button"
                className="group relative grid min-h-24 w-full cursor-pointer grid-cols-[3.5rem_minmax(0,1fr)_auto_1.5rem] items-center gap-4 px-4 py-5 text-left transition-colors duration-150 hover:bg-primary/[0.025] focus-visible:z-10 focus-visible:rounded-xl focus-visible:ring-3 focus-visible:ring-ring/20 focus-visible:outline-none active:bg-primary/[0.045] max-sm:grid-cols-[2.75rem_minmax(0,1fr)_1.25rem] max-sm:gap-3 max-sm:px-2"
                onClick={onClick}
              >
                <span className="flex items-center justify-center text-primary">
                  <Icon className="size-7 stroke-[1.8]" />
                </span>
                <span className="min-w-0">
                  <span className="block text-base font-semibold tracking-[-0.01em]">{title}</span>
                  <span className="mt-1 block text-sm leading-6 text-muted-foreground">{description}</span>
                </span>
                <span className="justify-self-end text-sm text-muted-foreground max-sm:hidden">{category}</span>
                <ChevronRight className="size-5 justify-self-end text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-foreground" />
              </button>
            ))}
          </div>

          {(settingsError || skillsError) && (
            <div className="mt-5 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              {settingsError || skillsError}
            </div>
          )}
        </div>
      </ScrollArea>
    </section>
  );
};

export const SettingsPage = () => {
  const navigate = useNavigate();

  return (
    <SettingsPanel
      settingsError=""
      skillsError=""
      onBack={() => navigate("/")}
      onOpenLlmSettings={() => navigate("/settings/llm")}
      onOpenEmbeddingSettings={() => navigate("/settings/embedding")}
      onOpenAgentSettings={() => navigate("/settings/agent")}
      onOpenCollaborationWorkflowSettings={() => navigate("/settings/workflow")}
    />
  );
};

export const LlmPage = () => {
  return <LlmSettingsPage />;
};

export const EmbeddingPage = () => {
  return <EmbeddingSettingsPage />;
};

export const AgentPage = () => {
  return <AgentSettingsPage />;
};

export const WorkflowPage = () => {
  return <WorkflowSettingsPage />;
};
