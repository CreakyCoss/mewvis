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
      <DialogContent className="gap-5 border border-border/70 p-0 shadow-lg sm:max-w-5xl">
        <DialogHeader>
          <div className="border-b border-border/80 px-6 pt-6 pb-4">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <span className="flex size-8 items-center justify-center rounded-md border border-primary/15 bg-accent text-primary">
                <Settings className="size-4" />
              </span>
              <span>LLM 设置</span>
            </DialogTitle>
            <DialogDescription className="mt-2">
              管理 Provider、API Key、Base URL 和可用模型。
            </DialogDescription>
          </div>
        </DialogHeader>

        {error && (
          <div className="mx-6 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="grid min-h-[500px] gap-0 md:grid-cols-[260px_1fr]">
          <aside className="flex min-h-0 flex-col gap-3 border-b border-border/80 bg-muted/35 px-4 py-4 md:border-r md:border-b-0">
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
                    "flex w-full items-center justify-between rounded-md border px-3 py-2.5 text-left text-sm shadow-xs transition-all",
                    provider.id === selectedProviderId
                      ? "border-primary/30 bg-card text-foreground ring-1 ring-primary/15"
                      : "border-border/70 bg-card/65 hover:bg-card",
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
                    <span className="shrink-0 rounded-sm bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                      默认
                    </span>
                  )}
                </button>
              ))}
            </div>
          </aside>

          <section className="min-h-0 overflow-y-auto px-5 py-4">
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

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/70 bg-muted/35 px-3 py-2.5">
                  <div className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={selectedProvider.isDefault}
                      onCheckedChange={() => setDefaultProvider(selectedProvider.id)}
                    />
                    <span>默认 Provider</span>
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
                    <div>
                      <h3 className="text-sm font-semibold">模型</h3>
                      <p className="text-xs text-muted-foreground">
                        可从供应商模型中选择，也可以手动输入自定义模型 ID。
                      </p>
                    </div>
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
                        className="grid gap-3 rounded-md border border-border/80 bg-card p-3 shadow-xs md:grid-cols-[1fr_1fr_auto_auto]"
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
                          <span className="text-sm text-muted-foreground">启用</span>
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

        <DialogFooter className="border-t border-border/80 px-6 pb-6 pt-4">
          <Button type="button" onClick={handleSave} disabled={isSaving || isLoading}>
            <Save className="size-4" />
            <span>{isSaving ? "正在保存" : "保存设置"}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
