import { Bot, BrainCircuit, Settings, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ContextEngine } from "@/ai/agent-context";

type SettingsPanelProps = {
  settingsError: string;
  skillsError: string;
  contextEngineId: string;
  contextEngines: ContextEngine[];
  onBack: () => void;
  onOpenLlmSettings: () => void;
  onOpenAgentSettings: () => void;
  onContextEngineChange: (engineId: string) => void;
};

export const SettingsPanel = ({
  settingsError,
  skillsError,
  contextEngineId,
  contextEngines,
  onBack,
  onOpenLlmSettings,
  onOpenAgentSettings,
  onContextEngineChange,
}: SettingsPanelProps) => {
  const selectedEngine = contextEngines.find((engine) => engine.id === contextEngineId) ?? contextEngines[0];

  return (
  <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
    <header className="flex min-h-14 items-center justify-between bg-card/80 px-5 py-3 shadow-[0_10px_30px_-30px_rgb(15_23_42_/_0.35)] backdrop-blur">
      <div className="min-w-0">
        <h2 className="text-base font-semibold">设置</h2>
        <p className="truncate text-xs text-muted-foreground">
          配置模型 Provider、可用模型，以及工作区中可复用的 Agent。
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
            设置会影响所有工作区中的模型选择、Agent 配置和运行方式。
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
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
            <span className="block text-base font-semibold">Agent 设置</span>
            <span className="mt-1 block text-sm leading-6 text-muted-foreground">
              创建和维护 Agent，并绑定已配置的模型。
            </span>
          </button>
        </div>

        <div className="mt-6 rounded-md bg-card p-4 shadow-xs">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <span className="mb-4 flex size-10 items-center justify-center rounded-md bg-accent text-primary shadow-xs">
                <BrainCircuit className="size-5" />
              </span>
              <h4 className="text-base font-semibold">上下文引擎</h4>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                {selectedEngine?.description ?? "选择当前聊天用于摘要、检索和 Agent 长期上下文同步的实现。"}
              </p>
              {selectedEngine?.experimental && (
                <span className="mt-3 inline-flex rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                  实验性
                </span>
              )}
            </div>
            <NativeSelect
              className="w-full md:w-72"
              value={contextEngineId}
              onChange={(event) => onContextEngineChange(event.currentTarget.value)}
            >
              {contextEngines.map((engine) => (
                <NativeSelectOption key={engine.id} value={engine.id}>
                  {engine.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
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
