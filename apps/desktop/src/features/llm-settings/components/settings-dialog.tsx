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
import { Switch } from "@/components/ui/switch";
import {
  getApiFormatLabel,
  getProviderApiFormatOptions,
  getProviderModelOptions,
  getProviderOption,
  getProviderOptions,
} from "../settings/options";
import { useSettings } from "../settings/use-settings";
import {
  applyApiFormatDefaults,
  applyModelDefaults,
  applyProviderDefaults,
} from "../settings/draft";

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
    updateModel,
    setDefaultProvider,
    addModel,
    removeModel,
    save,
  } = useSettings(open);
  const selectedProviderOption = selectedProvider
    ? getProviderOption(selectedProvider.provider)
    : undefined;
  const selectedApiFormatOptions = selectedProvider
    ? getProviderApiFormatOptions(selectedProvider.provider)
    : [];
  const selectedModelOptions = selectedProvider
    ? getProviderModelOptions(selectedProvider.provider)
    : [];

  const handleSave = async () => {
    const didSave = await save();

    if (didSave) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 border-transparent p-0 shadow-lg sm:max-w-5xl">
        <DialogHeader>
          <div className="px-6 pt-6 pb-4 shadow-[0_10px_30px_-30px_rgb(15_23_42_/_0.35)]">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <span className="flex size-8 items-center justify-center rounded-md bg-accent text-primary shadow-xs">
                <Settings className="size-4" />
              </span>
              <span>LLM 设置</span>
            </DialogTitle>
            <DialogDescription className="mt-2">
              管理 Provider、API Key、API Endpoint 和可用模型。
            </DialogDescription>
          </div>
        </DialogHeader>

        {error && (
          <div className="mx-6 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="grid min-h-[500px] gap-0 md:grid-cols-[260px_1fr]">
          <aside className="flex min-h-0 flex-col gap-3 bg-muted/35 px-4 py-4 shadow-[10px_0_30px_-30px_rgb(15_23_42_/_0.35)]">
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
                      ? "border-primary/20 bg-card text-foreground ring-1 ring-primary/10"
                      : "border-transparent bg-card/65 hover:bg-card",
                  ].join(" ")}
                  onClick={() => setSelectedProviderId(provider.id)}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {provider.name ||
                        getProviderOption(provider.provider)?.label ||
                        "未命名 Provider"}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[
                        getProviderOption(provider.provider)?.label ||
                          provider.provider,
                        getApiFormatLabel(provider.apiFormat),
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
                    <Label htmlFor="llm-provider">供应商</Label>
                    <select
                      id="llm-provider"
                      className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      value={selectedProvider.provider}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        updateProvider(selectedProvider.id, (provider) =>
                          applyProviderDefaults(provider, value),
                        );
                      }}
                    >
                      {getProviderOptions().map((provider) => (
                        <option key={provider.value} value={provider.value}>
                          {provider.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="llm-api-format">API Format</Label>
                    <select
                      id="llm-api-format"
                      className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      value={selectedProvider.apiFormat}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        updateProvider(selectedProvider.id, (provider) =>
                          applyApiFormatDefaults(provider, value),
                        );
                      }}
                    >
                      {selectedApiFormatOptions.map((apiFormat) => (
                        <option key={apiFormat.value} value={apiFormat.value}>
                          {apiFormat.label}
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
                    <Label htmlFor="llm-api-endpoint">API Endpoint</Label>
                    <Input
                      id="llm-api-endpoint"
                      value={selectedProvider.apiEndpoint}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        updateProvider(selectedProvider.id, (provider) => ({
                          ...provider,
                          apiEndpoint: value,
                        }));
                      }}
                      placeholder="自动匹配供应商和 API Format"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/35 px-3 py-2.5">
                  <div className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={selectedProvider.isDefault}
                      onCheckedChange={() =>
                        setDefaultProvider(selectedProvider.id)
                      }
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

                <div className="space-y-3 rounded-2xl bg-muted/20 p-3">
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
                        className="grid gap-3 rounded-md bg-card p-3 shadow-xs md:grid-cols-[1fr_1fr_auto_auto_auto]"
                      >
                        <div className="space-y-2">
                          <Label htmlFor={`${model.id}-model-id`}>模型 ID</Label>
                          <Input
                            id={`${model.id}-model-id`}
                            list={`${selectedProvider.id}-model-options`}
                            value={model.modelId}
                            onChange={(event) => {
                              const value = event.currentTarget.value;
                              updateModel(
                                selectedProvider.id,
                                model.id,
                                (item) =>
                                  applyModelDefaults(
                                    item,
                                    selectedProvider.provider,
                                    value,
                                  ),
                              );
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
                              updateModel(
                                selectedProvider.id,
                                model.id,
                                (item) => ({
                                  ...item,
                                  modelName: value,
                                }),
                              );
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
                            checked={model.isOneMillionContext}
                            onCheckedChange={(checked) => {
                              updateModel(
                                selectedProvider.id,
                                model.id,
                                (item) => ({
                                  ...item,
                                  isOneMillionContext: checked,
                                }),
                              );
                            }}
                          />
                          <span className="text-sm text-muted-foreground">1M</span>
                        </div>

                        <div className="flex items-end gap-2 pb-2">
                          <Switch
                            checked={model.isEnabled}
                            onCheckedChange={(checked) => {
                              updateModel(
                                selectedProvider.id,
                                model.id,
                                (item) => ({
                                  ...item,
                                  isEnabled: checked,
                                }),
                              );
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
                            onClick={() =>
                              removeModel(selectedProvider.id, model.id)
                            }
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

        <DialogFooter className="px-6 pb-6 pt-4 shadow-[0_-10px_30px_-32px_rgb(15_23_42_/_0.35)]">
          <Button
            type="button"
            onClick={handleSave}
            disabled={isSaving || isLoading}
          >
            <Save className="size-4" />
            <span>{isSaving ? "正在保存" : "保存设置"}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
