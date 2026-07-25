import { Bot, GitBranch, Settings, X } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AgentSettingsDialog } from "./agent/components/dialog";
import { LlmSettingsPage } from "./llm";
import { useLlmSettingsStore } from "./llm/store";
import { CollaborationWorkflowSettingsDialog } from "./workflow/components/dialog";

type SettingsPanelProps = {
  settingsError: string;
  skillsError: string;
  onBack: () => void;
  onOpenLlmSettings: () => void;
  onOpenAgentSettings: () => void;
  onOpenCollaborationWorkflowSettings: () => void;
};

export const SettingsPanel = ({
  settingsError,
  skillsError,
  onBack,
  onOpenLlmSettings,
  onOpenAgentSettings,
  onOpenCollaborationWorkflowSettings,
}: SettingsPanelProps) => {
  return (
    <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <header className="app-page-header flex min-h-16 items-center justify-between px-6 py-4">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-[-0.02em]">设置</h2>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            配置模型 Provider、可用模型、角色画像和协作流程。
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="rounded-xl"
          title="关闭设置"
          aria-label="关闭设置"
          onClick={onBack}
        >
          <X className="size-5" />
        </Button>
      </header>

      <ScrollArea className="min-h-0 flex-1 bg-surface/45">
        <div className="mx-auto w-full max-w-6xl px-6 py-8">
          <div className="mb-6 space-y-1.5">
            <h3 className="text-lg font-semibold">应用设置</h3>
            <p className="max-w-2xl text-sm text-muted-foreground">
              设置会影响所有工作区中的模型选择、角色画像和协作流程。
            </p>
          </div>

          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            <button
              type="button"
              className="app-interactive-card min-h-44 rounded-2xl p-5 text-left focus-visible:ring-3 focus-visible:ring-ring/25 focus-visible:outline-none"
              onClick={onOpenLlmSettings}
            >
              <span className="mb-5 flex size-11 items-center justify-center rounded-xl bg-accent text-primary">
                <Settings className="size-5" />
              </span>
              <span className="block text-base font-semibold">LLM 设置</span>
              <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                管理 Provider、API Key、API Endpoint 和启用模型。
              </span>
            </button>

            <button
              type="button"
              className="app-interactive-card min-h-44 rounded-2xl p-5 text-left focus-visible:ring-3 focus-visible:ring-ring/25 focus-visible:outline-none"
              onClick={onOpenAgentSettings}
            >
              <span className="mb-5 flex size-11 items-center justify-center rounded-xl bg-accent text-primary">
                <Bot className="size-5" />
              </span>
              <span className="block text-base font-semibold">角色设置</span>
              <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                创建和维护角色画像，聊天时独立选择模型。
              </span>
            </button>

            <button
              type="button"
              className="app-interactive-card min-h-44 rounded-2xl p-5 text-left focus-visible:ring-3 focus-visible:ring-ring/25 focus-visible:outline-none"
              onClick={onOpenCollaborationWorkflowSettings}
            >
              <span className="mb-5 flex size-11 items-center justify-center rounded-xl bg-accent text-primary">
                <GitBranch className="size-5" />
              </span>
              <span className="block text-base font-semibold">协作流程设置</span>
              <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                自定义协作流程、步骤顺序和每步执行的角色。
              </span>
            </button>
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
      onOpenAgentSettings={() => navigate("/settings/agent")}
      onOpenCollaborationWorkflowSettings={() => navigate("/settings/workflow")}
    />
  );
};

export const LlmPage = () => {
  const navigate = useNavigate();

  return (
    <LlmSettingsPage
      onBack={() => navigate("/settings")}
      onSettingsSaved={() => void useLlmSettingsStore.getState().loadSettings()}
    />
  );
};

export const AgentPage = () => {
  const navigate = useNavigate();

  return (
    <>
      <SettingsPage />
      <AgentSettingsDialog
        open
        onOpenChange={(open) => {
          if (!open) {
            navigate("/settings");
          }
        }}
      />
    </>
  );
};

export const WorkflowPage = () => {
  const navigate = useNavigate();

  return (
    <>
      <SettingsPage />
      <CollaborationWorkflowSettingsDialog
        open
        onOpenChange={(open) => {
          if (!open) {
            navigate("/settings");
          }
        }}
      />
    </>
  );
};
