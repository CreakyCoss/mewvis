import { useImperativeHandle, useState, type Ref } from "react";
import { Loader2, Plus, Save, ServerCog, Trash2 } from "lucide-react";
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
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { getProviderOption, getProviderOptions } from "../options";
import { saveLlmSettings } from "@/api/llm";
import type { LlmProvider, LlmProviderConfig, ProviderModelConfig } from "../types";
import { getProviderApiFormatOptions, getProviderModelOptions } from "./form";
import {
  applyApiFormatDefaults,
  applyModelDefaults,
  applyProviderDefaults,
  cloneProviderConfig,
  createModelConfig,
  createProviderConfig,
  normalizeLlmSettingsConfig,
  normalizeProvidersForSave,
  toLlmSettingsConfig,
  toProviderConfig,
  validateLlmSettingsConfig,
} from "./utils";

type ProviderEditMode = "create" | "edit";

type ProviderEditDialogOpenOptions = { mode: "create" } | { mode: "edit"; provider: LlmProvider };

export type ProviderEditDialogHandle = {
  open: (options?: ProviderEditDialogOpenOptions) => void;
};

type ProviderEditDialogProps = {
  bind: Ref<ProviderEditDialogHandle>;
  providers: LlmProvider[];
  onSaved?: () => void | Promise<void>;
};

export const ProviderEditDialog = ({ bind, providers, onSaved }: ProviderEditDialogProps) => {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ProviderEditMode>("create");
  const [providerDraft, setProviderDraft] = useState<LlmProviderConfig | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const openCreateProvider = () => {
    setMode("create");
    setProviderDraft(createProviderConfig(providers.length === 0));
    setError("");
    setOpen(true);
  };

  const openEditProvider = (provider: LlmProvider) => {
    const providerConfig = toProviderConfig(provider);

    setMode("edit");
    setProviderDraft(providerConfig ? cloneProviderConfig(providerConfig) : null);
    setError("");
    setOpen(true);
  };

  const closeDialog = () => {
    setOpen(false);
    setProviderDraft(null);
    setError("");
  };

  useImperativeHandle(
    bind,
    () => ({
      open: (options = { mode: "create" }) => {
        if (options.mode === "edit") {
          openEditProvider(options.provider);
          return;
        }

        openCreateProvider();
      },
    }),
    [providers.length],
  );

  const selectedProviderOption = providerDraft ? getProviderOption(providerDraft.provider) : undefined;
  const selectedApiFormatOptions = providerDraft ? getProviderApiFormatOptions(providerDraft.provider) : [];
  const selectedModelOptions = providerDraft ? getProviderModelOptions(providerDraft.provider) : [];
  const modelOptionListId = providerDraft ? `${providerDraft.id}-model-options` : "";
  const canDelete = mode === "edit" && providers.length > 1;

  const updateProviderDraft = (updater: (provider: LlmProviderConfig) => LlmProviderConfig) => {
    setProviderDraft((current) => (current ? updater(current) : current));
  };

  const updateModel = (modelId: string, updater: (model: ProviderModelConfig) => ProviderModelConfig) => {
    updateProviderDraft((current) => ({
      ...current,
      models: current.models.map((model) => (model.id === modelId ? updater(model) : model)),
    }));
  };

  const addModel = () => {
    updateProviderDraft((current) => ({
      ...current,
      models: [...current.models, createModelConfig()],
    }));
  };

  const removeModel = (modelId: string) => {
    updateProviderDraft((current) => ({
      ...current,
      models: current.models.filter((model) => model.id !== modelId),
    }));
  };

  const saveProviders = async (nextProviders: LlmProviderConfig[]) => {
    const config = normalizeLlmSettingsConfig({ providers: nextProviders });
    const validationError = validateLlmSettingsConfig(config);

    if (validationError) {
      setError(validationError);
      return false;
    }

    setIsSaving(true);
    setError("");

    try {
      await saveLlmSettings(config);
      return true;
    } catch (caught) {
      setError(String(caught));
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const saveProvider = async () => {
    if (!providerDraft) return;

    const nextProvider = cloneProviderConfig(providerDraft);
    const providerConfigs = toLlmSettingsConfig({ providers }).providers;
    const nextProviders =
      mode === "create"
        ? [...providerConfigs, nextProvider]
        : providerConfigs.map((item) => (item.id === nextProvider.id ? nextProvider : item));
    const didSave = await saveProviders(normalizeProvidersForSave(nextProviders, nextProvider.id));

    if (didSave) {
      closeDialog();
      await onSaved?.();
    }
  };

  const deleteProvider = async () => {
    if (!providerDraft || mode !== "edit" || providers.length <= 1) {
      return;
    }

    const providerConfigs = toLlmSettingsConfig({ providers }).providers;
    const didSave = await saveProviders(
      normalizeProvidersForSave(providerConfigs.filter((item) => item.id !== providerDraft.id)),
    );

    if (didSave) {
      closeDialog();
      await onSaved?.();
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (isSaving) {
      return;
    }

    if (!nextOpen) {
      closeDialog();
      return;
    }

    setOpen(true);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[calc(100vh-4rem)] gap-0 overflow-hidden border-border/70 bg-popover p-0 shadow-[var(--shadow-floating)] sm:max-w-4xl">
        <DialogHeader>
          <div className="border-b border-border/70 bg-card/35 px-6 pt-6 pb-4">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-primary">
                <ServerCog className="size-4" />
              </span>
              <span>{mode === "create" ? "新增 LLM" : "编辑 LLM"}</span>
            </DialogTitle>
            <DialogDescription className="mt-2">
              配置 Provider、API Format、API Endpoint、API Key 和可用模型。
            </DialogDescription>
          </div>
        </DialogHeader>

        {providerDraft && (
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              void saveProvider();
            }}
          >
            {error && (
              <div className="mx-6 mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="min-h-0 max-h-[64vh] overflow-y-auto px-6 py-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="llm-provider-name">Provider 名称</Label>
                  <Input
                    id="llm-provider-name"
                    value={providerDraft.name}
                    placeholder={selectedProviderOption?.label ?? "Provider 名称"}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      updateProviderDraft((current) => ({
                        ...current,
                        name: value,
                      }));
                    }}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="llm-provider">供应商</Label>
                  <NativeSelect
                    id="llm-provider"
                    className="w-full"
                    value={providerDraft.provider}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      updateProviderDraft((current) => applyProviderDefaults(current, value));
                    }}
                  >
                    {getProviderOptions().map((providerOption) => (
                      <NativeSelectOption key={providerOption.value} value={providerOption.value}>
                        {providerOption.label}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="llm-api-format">API Format</Label>
                  <NativeSelect
                    id="llm-api-format"
                    className="w-full"
                    value={providerDraft.apiFormat}
                    onChange={(event) => {
                      const value = selectedApiFormatOptions.find(
                        (apiFormat) => apiFormat.value === event.currentTarget.value,
                      )?.value;
                      if (!value) return;

                      updateProviderDraft((current) => applyApiFormatDefaults(current, value));
                    }}
                  >
                    {selectedApiFormatOptions.map((apiFormat) => (
                      <NativeSelectOption key={apiFormat.value} value={apiFormat.value}>
                        {apiFormat.label}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="llm-api-key">API Key</Label>
                  <Input
                    id="llm-api-key"
                    type="password"
                    value={providerDraft.apiKey}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      updateProviderDraft((current) => ({
                        ...current,
                        apiKey: value,
                      }));
                    }}
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="llm-api-endpoint">API Endpoint</Label>
                  <Input
                    id="llm-api-endpoint"
                    value={providerDraft.apiEndpoint}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      updateProviderDraft((current) => ({
                        ...current,
                        apiEndpoint: value,
                      }));
                    }}
                    placeholder="自动匹配供应商和 API Format"
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/25 px-3 py-2.5">
                <div className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={providerDraft.isDefault}
                    onCheckedChange={(checked) => {
                      if (!checked) return;
                      updateProviderDraft((current) => ({
                        ...current,
                        isDefault: true,
                      }));
                    }}
                  />
                  <span>默认 Provider</span>
                </div>

                {canDelete && (
                  <Button type="button" variant="destructive" onClick={() => void deleteProvider()} disabled={isSaving}>
                    <Trash2 className="size-4" />
                    <span>删除 Provider</span>
                  </Button>
                )}
              </div>

              <div className="mt-5 space-y-3 rounded-xl border border-border/60 bg-muted/15 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">模型</h3>
                    <p className="text-xs text-muted-foreground">可从供应商模型中选择，也可以手动输入自定义模型 ID。</p>
                  </div>
                  <Button type="button" variant="outline" onClick={addModel}>
                    <Plus className="size-4" />
                    <span>新增模型</span>
                  </Button>
                </div>

                <datalist id={modelOptionListId}>
                  {selectedModelOptions.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </datalist>

                <div className="space-y-3">
                  {providerDraft.models.map((model) => (
                    <div
                      key={model.id}
                      className="grid gap-3 rounded-xl border border-border/60 bg-card/75 p-3 shadow-xs md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto_auto]"
                    >
                      <div className="space-y-2">
                        <Label htmlFor={`${model.id}-model-id`}>模型 ID</Label>
                        <Input
                          id={`${model.id}-model-id`}
                          list={modelOptionListId}
                          value={model.modelId}
                          onChange={(event) => {
                            const value = event.currentTarget.value;
                            updateModel(model.id, (item) => applyModelDefaults(item, providerDraft.provider, value));
                          }}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`${model.id}-model-name`}>显示名称</Label>
                        <Input
                          id={`${model.id}-model-name`}
                          value={model.modelName}
                          onChange={(event) => {
                            const value = event.currentTarget.value;
                            updateModel(model.id, (item) => ({
                              ...item,
                              modelName: value,
                            }));
                          }}
                          placeholder={
                            selectedModelOptions.find((item) => item.id === model.modelId)?.name ?? "自定义显示名称"
                          }
                        />
                      </div>

                      <div className="flex items-end gap-2 pb-2">
                        <Switch
                          checked={model.isOneMillionContext}
                          onCheckedChange={(checked) => {
                            updateModel(model.id, (item) => ({
                              ...item,
                              isOneMillionContext: checked,
                            }));
                          }}
                        />
                        <span className="text-sm text-muted-foreground">1M</span>
                      </div>

                      <div className="flex items-end gap-2 pb-2">
                        <Switch
                          checked={model.isEnabled}
                          onCheckedChange={(checked) => {
                            updateModel(model.id, (item) => ({
                              ...item,
                              isEnabled: checked,
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
                          onClick={() => removeModel(model.id)}
                          disabled={providerDraft.models.length <= 1}
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

            <DialogFooter className="border-t border-border/70 bg-card/35 px-6 pt-4 pb-6">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isSaving}>
                取消
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? (
                  <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                ) : (
                  <Save className="size-4" />
                )}
                <span>{isSaving ? "正在保存" : "保存配置"}</span>
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};

ProviderEditDialog.displayName = "ProviderEditDialog";
