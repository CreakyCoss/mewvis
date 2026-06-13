import { useMemo, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronRight,
  KeyRound,
  Plus,
  ServerCog,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  getApiFormatLabel,
  getProviderWebsiteUrl,
} from "./options";
import type { LlmProvider } from "./types";
import {
  ProviderEditDialog,
  type ProviderEditDialogHandle,
} from "./provider-edit";
import { useLlmSettingsStore } from "./store";

type LlmSettingsPageProps = {
  onBack: () => void;
  onSettingsSaved?: () => void;
};

const countEnabledModels = (provider: LlmProvider) =>
  provider.models.filter((model) => model.isEnabled).length;

const ProviderTile = ({
  provider,
  onOpen,
}: {
  provider: LlmProvider;
  onOpen: () => void;
}) => {
  const apiEndpoint = provider.apiEndpoint?.trim() ?? "";
  const websiteUrl = getProviderWebsiteUrl(provider.provider).trim();
  const enabledModelCount = countEnabledModels(provider);

  return (
    <button
      type="button"
      className="group flex w-full min-w-0 items-center gap-4 rounded-md border border-border bg-card px-4 py-4 text-left shadow-xs transition-all hover:border-primary/35 hover:bg-accent/25 hover:shadow-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      onClick={onOpen}
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-md border bg-background text-primary shadow-xs">
        <ServerCog className="size-5" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate text-base font-semibold">
            {provider.name || "未命名 Provider"}
          </span>
          {provider.isDefault && (
            <Badge variant="secondary" className="bg-primary/10 text-primary">
              默认
            </Badge>
          )}
          <Badge variant="outline">{getApiFormatLabel(provider.apiFormat)}</Badge>
        </span>
        <span
          className={[
            "mt-1 block truncate text-sm",
            apiEndpoint || websiteUrl ? "text-primary" : "text-muted-foreground",
          ].join(" ")}
        >
          {apiEndpoint || websiteUrl || "未设置 API Endpoint"}
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{enabledModelCount}/{provider.models.length} 个模型启用</span>
          <span>·</span>
          <span>{provider.apiKey?.trim() ? "API Key 已配置" : "API Key 未配置"}</span>
        </span>
      </span>

      <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
    </button>
  );
};

export const LlmSettingsPage = ({
  onBack,
  onSettingsSaved,
}: LlmSettingsPageProps) => {
  const providerEditDialogRef = useRef<ProviderEditDialogHandle>(null);
  const { settings, error, loadSettings } = useLlmSettingsStore(
    useShallow((store) => ({
      settings: store.settings,
      error: store.error,
      loadSettings: store.loadSettings,
    })),
  );
  const providers = settings.providers;
  const providerCount = providers.length;
  const enabledModelCount = useMemo(
    () => providers.reduce(
      (total, provider) => total + countEnabledModels(provider),
      0,
    ),
    [providers],
  );

  const openCreateProvider = () => {
    providerEditDialogRef.current?.open({ mode: "create" });
  };

  const openEditProvider = (provider: LlmProvider) => {
    providerEditDialogRef.current?.open({ mode: "edit", provider });
  };

  const handleSettingsSaved = async () => {
    await loadSettings();
    onSettingsSaved?.();
  };

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <header className="flex min-h-14 items-center justify-between gap-3 bg-card/80 px-5 py-3 shadow-[0_10px_30px_-30px_rgb(15_23_42_/_0.35)] backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="rounded-md"
            title="返回"
            aria-label="返回"
            onClick={onBack}
          >
            <ArrowLeft className="size-5" />
          </Button>
          <div className="min-w-0">
            <h2 className="text-base font-semibold">LLM 设置</h2>
            <p className="truncate text-xs text-muted-foreground">
              管理 Provider、API Endpoint、API Key 和可暴露模型。
            </p>
          </div>
        </div>

        <Button type="button" onClick={openCreateProvider}>
          <Plus className="size-4" />
          <span>添加 LLM</span>
        </Button>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto w-full max-w-6xl px-6 py-7">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-2">
              <h3 className="text-2xl font-semibold">已配置 LLM</h3>
              <p className="max-w-2xl text-sm text-muted-foreground">
                已保存的 Provider 会在这里平铺展示，聊天、角色和酒馆会从启用模型中选择。
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">
                <Bot className="size-3" />
                {providerCount} 个 Provider
              </Badge>
              <Badge variant="outline">
                <CheckCircle2 className="size-3" />
                {enabledModelCount} 个启用模型
              </Badge>
              <Badge variant="outline">
                <KeyRound className="size-3" />
                {providers.filter((provider) => provider.apiKey?.trim()).length} 个 Key
              </Badge>
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {providers.length > 0 ? (
            <div className="space-y-3">
              {providers.map((provider) => (
                <ProviderTile
                  key={provider.id}
                  provider={provider}
                  onOpen={() => openEditProvider(provider)}
                />
              ))}
            </div>
          ) : (
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-md border border-dashed bg-card px-6 text-center shadow-xs">
              <span className="flex size-12 items-center justify-center rounded-md bg-accent text-primary">
                <Sparkles className="size-6" />
              </span>
              <div className="space-y-1">
                <h3 className="font-semibold">还没有配置 LLM</h3>
                <p className="text-sm text-muted-foreground">
                  添加一个 Provider 后，就可以为聊天、角色和酒馆选择模型。
                </p>
              </div>
              <Button type="button" onClick={openCreateProvider}>
                <Plus className="size-4" />
                <span>添加 LLM</span>
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>

      <ProviderEditDialog
        bind={providerEditDialogRef}
        providers={providers}
        onSaved={handleSettingsSaved}
      />
    </section>
  );
};
