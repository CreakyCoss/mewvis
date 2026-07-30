import { useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { Plus, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getApiFormatLabel, getProviderWebsiteUrl } from "./options";
import type { LlmProvider } from "./types";
import { ProviderEditDialog, type ProviderEditDialogHandle } from "./provider-edit";
import { useLlmSettingsStore } from "./store";

type LlmSettingsPageProps = {
  onBack: () => void;
  onSettingsSaved?: () => void;
};

const countEnabledModels = (provider: LlmProvider) => provider.models.filter((model) => model.isEnabled).length;

const Status = ({ children }: { children: string }) => (
  <span className="inline-flex items-center gap-2 text-sm text-success">
    <span className="size-1.5 shrink-0 rounded-full bg-success" aria-hidden="true" />
    {children}
  </span>
);

const ProviderRow = ({ provider, onOpen }: { provider: LlmProvider; onOpen: () => void }) => {
  const apiEndpoint = provider.apiEndpoint?.trim() || getProviderWebsiteUrl(provider.provider).trim();
  const enabledModelCount = countEnabledModels(provider);

  return (
    <button
      type="button"
      className="group grid min-h-15 w-full min-w-0 grid-cols-[minmax(160px,1.15fr)_minmax(140px,0.85fr)_minmax(200px,1.35fr)_110px_120px_72px] items-center gap-4 border-b border-border/70 px-4 text-left transition-colors hover:bg-accent/20 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/20 max-lg:grid-cols-[minmax(160px,1.15fr)_minmax(130px,0.9fr)_100px_116px]"
      onClick={onOpen}
      aria-label={`编辑 ${provider.name || "未命名 Provider"}`}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <span className="truncate text-sm font-medium">{provider.name || "未命名 Provider"}</span>
        {provider.isDefault && (
          <Badge variant="secondary" className="shrink-0 bg-primary/9 px-2 py-0.5 text-xs font-medium text-primary">
            默认
          </Badge>
        )}
      </span>

      <span className="truncate text-sm text-muted-foreground">{getApiFormatLabel(provider.apiFormat)}</span>
      <span className="truncate text-sm text-muted-foreground max-lg:hidden">{apiEndpoint || "未设置 Endpoint"}</span>
      <span className="text-sm text-foreground">{enabledModelCount} 个模型</span>
      {provider.apiKey?.trim() ? <Status>凭据已配置</Status> : <span className="text-sm text-warning">缺少凭据</span>}
      <span className="inline-flex items-center gap-2 text-sm text-foreground max-lg:hidden">
        <span className="size-1.5 shrink-0 rounded-full bg-success" aria-hidden="true" />
        可用
      </span>
    </button>
  );
};

const ProviderTableHeader = () => (
  <div className="grid min-h-15 grid-cols-[minmax(160px,1.15fr)_minmax(140px,0.85fr)_minmax(200px,1.35fr)_110px_120px_72px] items-center gap-4 border-b border-border/70 px-4 text-xs font-medium text-muted-foreground max-lg:grid-cols-[minmax(160px,1.15fr)_minmax(130px,0.9fr)_100px_116px]">
    <span>Provider</span>
    <span>API 格式</span>
    <span className="max-lg:hidden">Endpoint</span>
    <span>已启用模型</span>
    <span>凭据状态</span>
    <span className="max-lg:hidden">状态</span>
  </div>
);

export const LlmSettingsPage = ({ onSettingsSaved }: LlmSettingsPageProps) => {
  const providerEditDialogRef = useRef<ProviderEditDialogHandle>(null);
  const { settings, error, loadSettings } = useLlmSettingsStore(
    useShallow((store) => ({
      settings: store.settings,
      error: store.error,
      loadSettings: store.loadSettings,
    })),
  );
  const providers = settings.providers;

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
    <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-surface/45">
      <header className="app-page-header -mt-10 flex min-h-30 items-center justify-between gap-4 bg-transparent px-6 py-5 lg:px-8">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-[-0.02em]">LLM 设置</h2>
          <p className="mt-1 truncate text-sm text-muted-foreground">管理模型服务、凭据与可用模型</p>
        </div>

        <Button type="button" onClick={openCreateProvider}>
          <Plus className="size-4" />
          <span>添加 Provider</span>
        </Button>
      </header>

      <ScrollArea className="min-h-0 flex-1 bg-transparent">
        <div className="w-full px-6">
          {error && (
            <div
              role="alert"
              className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
            >
              {error}
            </div>
          )}

          {providers.length > 0 ? (
            <div className="w-full">
              <ProviderTableHeader />
              <div aria-label="已配置的 Provider">
                {providers.map((provider) => (
                  <ProviderRow key={provider.id} provider={provider} onOpen={() => openEditProvider(provider)} />
                ))}
              </div>
            </div>
          ) : (
            <div className="app-empty-state mt-8 flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-2xl px-6 text-center">
              <span className="flex size-12 items-center justify-center rounded-xl bg-accent text-primary">
                <Sparkles className="size-6" />
              </span>
              <div className="space-y-1">
                <h3 className="font-semibold">还没有配置 Provider</h3>
                <p className="text-sm text-muted-foreground">
                  添加模型服务后，就可以在聊天、角色和酒馆中选择启用的模型。
                </p>
              </div>
              <Button type="button" onClick={openCreateProvider}>
                <Plus className="size-4" />
                <span>添加 Provider</span>
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>

      <ProviderEditDialog bind={providerEditDialogRef} providers={providers} onSaved={handleSettingsSaved} />
    </section>
  );
};
