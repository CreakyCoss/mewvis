import { Bot, GitBranch, Settings, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

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
    <header className="flex min-h-14 items-center justify-between bg-card/80 px-5 py-3 shadow-[0_10px_30px_-30px_rgb(15_23_42_/_0.35)] backdrop-blur">
      <div className="min-w-0">
        <h2 className="text-base font-semibold">设置</h2>
        <p className="truncate text-xs text-muted-foreground">
          配置模型 Provider、可用模型、角色和协作流程。
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

    <ScrollArea className="min-h-0 flex-1">
      <div className="mx-auto w-full max-w-6xl px-6 py-8">
        <div className="mb-7 space-y-2">
          <h3 className="text-2xl font-semibold">应用设置</h3>
          <p className="max-w-2xl text-sm text-muted-foreground">
            设置会影响所有工作区中的模型选择、角色和协作流程。
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <button
            type="button"
            className="rounded-md bg-card p-4 text-left shadow-xs transition-colors hover:bg-accent/35 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            onClick={onOpenLlmSettings}
          >
            <span className="mb-4 flex size-10 items-center justify-center rounded-md bg-accent text-primary shadow-xs">
              <Settings className="size-5" />
            </span>
            <span className="block text-base font-semibold">LLM 设置</span>
            <span className="mt-1 block text-sm leading-6 text-muted-foreground">
              管理 Provider、API Key、Base URL 和启用模型。
            </span>
          </button>

          <button
            type="button"
            className="rounded-md bg-card p-4 text-left shadow-xs transition-colors hover:bg-accent/35 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            onClick={onOpenAgentSettings}
          >
            <span className="mb-4 flex size-10 items-center justify-center rounded-md bg-accent text-primary shadow-xs">
              <Bot className="size-5" />
            </span>
            <span className="block text-base font-semibold">角色设置</span>
            <span className="mt-1 block text-sm leading-6 text-muted-foreground">
              创建和维护角色，并绑定已配置的模型。
            </span>
          </button>

          <button
            type="button"
            className="rounded-md bg-card p-4 text-left shadow-xs transition-colors hover:bg-accent/35 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            onClick={onOpenCollaborationWorkflowSettings}
          >
            <span className="mb-4 flex size-10 items-center justify-center rounded-md bg-accent text-primary shadow-xs">
              <GitBranch className="size-5" />
            </span>
            <span className="block text-base font-semibold">协作流程设置</span>
            <span className="mt-1 block text-sm leading-6 text-muted-foreground">
              自定义协作流程、步骤顺序和每步执行的角色。
            </span>
          </button>
        </div>

        {(settingsError || skillsError) && (
          <div className="mt-5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {settingsError || skillsError}
          </div>
        )}
      </div>
    </ScrollArea>
  </section>
  );
};
