import { Plus, Save, Settings, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  getProviderTypeLabel,
  getVendorModelOptions,
  getVendorOption,
  getVendorOptions,
  providerTypeOptions,
} from "../constants";
import { useSettings } from "../hooks/use-settings";
import {
  applyModelDefaults,
  applyProviderDefaults,
  applyProviderTypeDefaults,
} from "../utils";

type SettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export const SettingsDialog = ({
  open,
  onOpenChange,
}: SettingsDialogProps) => {
  const {
    draft,
    selectedProvider,
    selectedProviderId,
    isLoading,
    isSaving,
    error,
    setSelectedProviderId,
    addProvider,
    removeProvider,
    updateProvider,
    setDefaultProvider,
    addModel,
    removeModel,
    save,
  } = useSettings(open);
  const selectedProviderOption = selectedProvider
    ? getVendorOption(selectedProvider.vendor)
    : undefined;
  const selectedModelOptions = selectedProvider
    ? getVendorModelOptions(selectedProvider.vendor, selectedProvider.provider)
    : [];

  const handleSave = async () => {
    const didSave = await save();

    if (didSave) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="size-4" />
            <span>LLM 设置</span>
          </DialogTitle>
          <DialogDescription>
            管理 Provider、API Key、Base URL 和可用模型。
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="grid min-h-[460px] gap-5 md:grid-cols-[220px_1fr]">
          <aside className="flex min-h-0 flex-col gap-3 border-r border-border pr-4">
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start"
              onClick={addProvider}
              disabled={isLoading}
            >
              <Plus className="size-4" />
              <span>新增 Provider</span>
            </Button>

            <div className="min-h-0 space-y-2 overflow-y-auto pr-1">
              {draft.providers.map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  className={[
                    "flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors",
                    provider.id === selectedProviderId
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border hover:bg-muted/60",
                  ].join(" ")}
                  onClick={() => setSelectedProviderId(provider.id)}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {provider.name ||
                        getVendorOption(provider.vendor)?.label ||
                        "未命名 Provider"}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[
                        getVendorOption(provider.vendor)?.label || provider.vendor,
                        getProviderTypeLabel(provider.provider),
                      ]
                        .filter(Boolean)
                        .join(" / ") || "未选择供应商"}
                    </span>
                  </span>
                  {provider.isDefault && (
                    <span className="shrink-0 text-xs text-primary">默认</span>
                  )}
                </button>
              ))}
            </div>
          </aside>

          <section className="min-h-0 overflow-y-auto pr-1">
            {isLoading ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                正在读取 LLM 设置
              </div>
            ) : selectedProvider ? (
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="llm-provider-name">Provider 名称</Label>
                    <Input
                      id="llm-provider-name"
                      value={selectedProvider.name}
                      placeholder={selectedProviderOption?.label ?? "Provider 名称"}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        updateProvider(selectedProvider.id, (provider) => ({
                          ...provider,
                          name: value,
                        }));
                      }}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="llm-vendor">供应商</Label>
                    <select
                      id="llm-vendor"
                      className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      value={selectedProvider.vendor}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        updateProvider(selectedProvider.id, (provider) =>
                          applyProviderDefaults(provider, value),
                        );
                      }}
                    >
                      {getVendorOptions().map((provider) => (
                        <option key={provider.value} value={provider.value}>
                          {provider.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="llm-provider-type">Provider 类型</Label>
                    <select
                      id="llm-provider-type"
                      className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      value={selectedProvider.provider}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        updateProvider(selectedProvider.id, (provider) =>
                          applyProviderTypeDefaults(provider, value),
                        );
                      }}
                    >
                      {providerTypeOptions.map((providerType) => (
                        <option key={providerType.value} value={providerType.value}>
                          {providerType.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="llm-api-key">API Key</Label>
                    <Input
                      id="llm-api-key"
                      type="password"
                      value={selectedProvider.apiKey}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        updateProvider(selectedProvider.id, (provider) => ({
                          ...provider,
                          apiKey: value,
                        }));
                      }}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="llm-base-url">Base URL</Label>
                    <Input
                      id="llm-base-url"
                      value={selectedProvider.baseUrl}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        updateProvider(selectedProvider.id, (provider) => ({
                          ...provider,
                          baseUrl: value,
                        }));
                      }}
                      placeholder="自动匹配供应商和 Provider 类型"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={selectedProvider.isDefault}
                      onCheckedChange={() => setDefaultProvider(selectedProvider.id)}
                    />
                    <span className="text-sm">默认 Provider</span>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => removeProvider(selectedProvider.id)}
                    disabled={draft.providers.length <= 1}
                  >
                    <Trash2 className="size-4" />
                    <span>删除 Provider</span>
                  </Button>
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-medium">模型</h3>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => addModel(selectedProvider.id)}
                    >
                      <Plus className="size-4" />
                      <span>新增模型</span>
                    </Button>
                  </div>

                  <datalist id={`${selectedProvider.id}-model-options`}>
                    {selectedModelOptions.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                      </option>
                    ))}
                  </datalist>

                  <div className="space-y-3">
                    {selectedProvider.models.map((model) => (
                      <div
                        key={model.id}
                        className="grid gap-3 rounded-md border border-border p-3 md:grid-cols-[1fr_1fr_auto_auto]"
                      >
                        <div className="space-y-2">
                          <Label htmlFor={`${model.id}-model-id`}>模型 ID</Label>
                          <Input
                            id={`${model.id}-model-id`}
                            list={`${selectedProvider.id}-model-options`}
                            value={model.modelId}
                            onChange={(event) => {
                              const value = event.currentTarget.value;
                              updateProvider(selectedProvider.id, (provider) => ({
                                ...provider,
                                models: provider.models.map((item) =>
                                  item.id === model.id
                                    ? applyModelDefaults(
                                        item,
                                        selectedProvider.vendor,
                                        selectedProvider.provider,
                                        value,
                                      )
                                    : item,
                                ),
                              }));
                            }}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor={`${model.id}-model-name`}>
                            显示名称
                          </Label>
                          <Input
                            id={`${model.id}-model-name`}
                            value={model.modelName}
                            onChange={(event) => {
                              const value = event.currentTarget.value;
                              updateProvider(selectedProvider.id, (provider) => ({
                                ...provider,
                                models: provider.models.map((item) =>
                                  item.id === model.id
                                    ? { ...item, modelName: value }
                                    : item,
                                ),
                              }));
                            }}
                            placeholder={
                              selectedModelOptions.find(
                                (item) => item.id === model.modelId,
                              )?.name ?? "自定义显示名称"
                            }
                          />
                        </div>

                        <div className="flex items-end gap-2 pb-2">
                          <Switch
                            checked={model.isEnabled}
                            onCheckedChange={(checked) => {
                              updateProvider(selectedProvider.id, (provider) => ({
                                ...provider,
                                models: provider.models.map((item) =>
                                  item.id === model.id
                                    ? { ...item, isEnabled: checked }
                                    : item,
                                ),
                              }));
                            }}
                          />
                          <span className="text-sm">启用</span>
                        </div>

                        <div className="flex items-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            title="删除模型"
                            onClick={() => removeModel(selectedProvider.id, model.id)}
                            disabled={selectedProvider.models.length <= 1}
                          >
                            <Trash2 className="size-4" />
                            <span className="sr-only">删除模型</span>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                <span>暂无 Provider</span>
                <Button type="button" variant="outline" onClick={addProvider}>
                  <Plus className="size-4" />
                  <span>新增 Provider</span>
                </Button>
              </div>
            )}
          </section>
        </div>

        <DialogFooter>
          <Button type="button" onClick={handleSave} disabled={isSaving || isLoading}>
            <Save className="size-4" />
            <span>{isSaving ? "正在保存" : "保存设置"}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
