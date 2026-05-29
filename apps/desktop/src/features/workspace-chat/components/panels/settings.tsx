import { Bot, MessageSquare, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

type SettingsPanelProps = {
  settingsError: string;
  skillsError: string;
  onBack: () => void;
  onOpenLlmSettings: () => void;
  onOpenAgentSettings: () => void;
};

export const SettingsPanel = ({
  settingsError,
  skillsError,
  onBack,
  onOpenLlmSettings,
  onOpenAgentSettings,
}: SettingsPanelProps) => (
  <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
    <header className="flex min-h-14 items-center justify-between border-b border-border/80 bg-card/80 px-5 py-3 backdrop-blur">
      <div className="min-w-0">
        <h2 className="text-base font-semibold">设置</h2>
        <p className="truncate text-xs text-muted-foreground">
          配置模型 Provider、可用模型，以及工作区中可复用的 Agent。
        </p>
      </div>
      <Button type="button" variant="outline" onClick={onBack}>
        <MessageSquare className="size-4" />
        <span>返回应用</span>
      </Button>
    </header>

    <ScrollArea className="min-h-0 flex-1">
      <div className="mx-auto w-full max-w-6xl px-6 py-8">
        <div className="mb-7 space-y-2">
          <h3 className="text-2xl font-semibold">应用设置</h3>
          <p className="max-w-2xl text-sm text-muted-foreground">
            设置会影响所有工作区中的模型选择、Agent 配置和运行方式。
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <button
            type="button"
            className="rounded-md border border-border/80 bg-card p-4 text-left shadow-xs transition-colors hover:border-primary/30 hover:bg-accent/35 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            onClick={onOpenLlmSettings}
          >
            <span className="mb-4 flex size-10 items-center justify-center rounded-md border border-primary/15 bg-accent text-primary">
              <Settings className="size-5" />
            </span>
            <span className="block text-base font-semibold">LLM 设置</span>
            <span className="mt-1 block text-sm leading-6 text-muted-foreground">
              管理 Provider、API Key、Base URL 和启用模型。
            </span>
          </button>

          <button
            type="button"
            className="rounded-md border border-border/80 bg-card p-4 text-left shadow-xs transition-colors hover:border-primary/30 hover:bg-accent/35 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            onClick={onOpenAgentSettings}
          >
            <span className="mb-4 flex size-10 items-center justify-center rounded-md border border-primary/15 bg-accent text-primary">
              <Bot className="size-5" />
            </span>
            <span className="block text-base font-semibold">Agent 设置</span>
            <span className="mt-1 block text-sm leading-6 text-muted-foreground">
              创建和维护 Agent，并绑定已配置的模型。
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
