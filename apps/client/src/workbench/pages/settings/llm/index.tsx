import { useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { Plus, Sparkles } from "lucide-react";
import type { LlmProvider } from "@/agent-client/runtime-model";
import { Badge } from "design-system/components/ui/badge";
import { Button } from "design-system/components/ui/button";
import { ScrollArea } from "design-system/components/ui/scroll-area";
import { getApiFormatLabel, getProviderWebsiteUrl } from "./options";
import { ProviderEditDialog, type ProviderEditDialogHandle } from "./edit";
import { useLlmSettingsStore } from "./store";
import { PageHeader } from "../../page-header";

const Status = ({ children }: { children: string }) => (
  <span className="inline-flex items-center gap-2 text-sm text-success">
    <span className="size-1.5 shrink-0 rounded-full bg-success" aria-hidden="true" />
    {children}
  </span>
);

const providerColumns =
  "grid grid-cols-[minmax(160px,1.15fr)_minmax(140px,0.85fr)_minmax(200px,1.35fr)_100px_120px_72px_136px] gap-4 max-lg:grid-cols-[minmax(140px,1.1fr)_minmax(120px,0.9fr)_100px_116px_116px] max-lg:gap-3 max-md:grid-cols-[minmax(86px,1fr)_56px_84px_96px] max-md:gap-2";

const ProviderRow = ({
  provider,
  onEdit,
  onDelete,
}: {
  provider: LlmProvider;
  onEdit: () => void;
  onDelete: () => void;
}) => {
  const apiEndpoint = provider.apiEndpoint?.trim() || getProviderWebsiteUrl(provider.provider).trim();

  return (
    <div
      className={`${providerColumns} min-h-15 w-full min-w-0 items-center border-b border-border/70 px-4 text-left max-md:px-3`}
      role="row"
    >
      <span className="flex min-w-0 items-center gap-2.5" role="cell">
        <span className="truncate text-sm font-medium">{provider.name || "未命名 Provider"}</span>
        {provider.isDefault && (
          <Badge variant="secondary" className="shrink-0 bg-primary/9 px-2 py-0.5 text-xs font-medium text-primary">
            默认
          </Badge>
        )}
      </span>

      <span className="truncate text-sm text-muted-foreground max-md:hidden" role="cell">
        {getApiFormatLabel(provider.apiFormat)}
      </span>
      <span className="truncate text-sm text-muted-foreground max-lg:hidden" role="cell">
        {apiEndpoint || "未设置 Endpoint"}
      </span>
      <span className="truncate text-sm text-foreground" role="cell">
        {provider.models.length} 个模型
      </span>
      <span role="cell">
        {provider.apiKey?.trim() ? <Status>凭据已配置</Status> : <span className="text-sm text-warning">缺少凭据</span>}
      </span>
      <span className="inline-flex items-center gap-2 text-sm text-foreground max-lg:hidden" role="cell">
        <span className="size-1.5 shrink-0 rounded-full bg-success" aria-hidden="true" />
        可用
      </span>
      <span className="flex items-center justify-start gap-4" role="cell">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-auto min-w-0 rounded-none p-0 text-primary hover:bg-transparent"
          aria-label={`编辑 ${provider.name || "未命名 Provider"}`}
          title="编辑"
          onClick={onEdit}
        >
          编辑
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-auto min-w-0 rounded-none p-0 text-destructive hover:bg-transparent hover:text-destructive"
          aria-label={`删除 ${provider.name || "未命名 Provider"}`}
          title="删除"
          onClick={onDelete}
        >
          删除
        </Button>
      </span>
    </div>
  );
};

const ProviderTableHeader = () => (
  <div
    className={`${providerColumns} min-h-15 items-center border-b border-border/70 px-4 text-xs font-medium text-muted-foreground max-md:px-3`}
    role="row"
  >
    <span role="columnheader">Provider</span>
    <span className="max-md:hidden" role="columnheader">
      API 格式
    </span>
    <span className="max-lg:hidden" role="columnheader">
      Endpoint
    </span>
    <span role="columnheader">可用模型</span>
    <span role="columnheader">凭据状态</span>
    <span className="max-lg:hidden" role="columnheader">
      状态
    </span>
    <span role="columnheader">操作</span>
  </div>
);

export const LlmSettingsPage = () => {
  const providerEditDialogRef = useRef<ProviderEditDialogHandle>(null);
  const { settings, error, loadSettings } = useLlmSettingsStore(
    useShallow((store) => ({
      settings: store.settings,
      error: store.error,
      loadSettings: store.loadSettings,
    })),
  );
  const providers = settings.providers;

  useEffect(() => {
    // StartupGate completes database migrations before this page mounts.
    void loadSettings();
  }, [loadSettings]);

  const openCreateProvider = () => {
    providerEditDialogRef.current?.open({ mode: "create" });
  };

  const openEditProvider = (provider: LlmProvider) => {
    providerEditDialogRef.current?.open({ mode: "edit", provider });
  };

  const confirmDeleteProvider = (provider: LlmProvider) => {
    providerEditDialogRef.current?.confirmDelete(provider);
  };

  const handleSettingsSaved = async () => {
    await loadSettings();
  };

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-surface/45">
      <PageHeader
        title="模型设置"
        description="管理模型服务、凭据与可用模型"
        backLink={{ to: "/settings", label: "返回设置" }}
        action={
          <Button type="button" onClick={openCreateProvider}>
            <Plus className="size-4" />
            <span>添加 Provider</span>
          </Button>
        }
      />

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
            <div className="w-full" role="table" aria-label="已配置的 Provider">
              <div role="rowgroup">
                <ProviderTableHeader />
              </div>
              <div role="rowgroup">
                {providers.map((provider) => (
                  <ProviderRow
                    key={provider.id}
                    provider={provider}
                    onEdit={() => openEditProvider(provider)}
                    onDelete={() => confirmDeleteProvider(provider)}
                  />
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
                  添加模型服务后，就可以在聊天、角色和应用中选择已添加的模型。
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
