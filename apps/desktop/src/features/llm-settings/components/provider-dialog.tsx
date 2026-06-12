import { useEffect, useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import {
  getDefaultApiFormat,
  getProviderApiFormats,
  getProviderApiFormatOptions,
  getProviderModelOptions,
  getProviderOption,
  getProviderOptions,
  inferApiEndpoint,
} from "../settings/options";
import { saveLlmSettings } from "../settings/api";
import type {
  LlmProvider,
  LlmProviderConfig,
  LlmSettings,
  LlmSettingsConfig,
  ProviderModelConfig,
} from "../settings/types";

export type ProviderDialogMode = "create" | "edit";

type ProviderDialogProps = {
  open: boolean;
  mode: ProviderDialogMode;
  provider: LlmProvider | null;
  providers: LlmProvider[];
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void | Promise<void>;
};

const selectClassName =
  "h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const createId = (prefix: string) => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const createModelConfig = (): ProviderModelConfig => ({
  id: createId("model"),
  modelId: "",
  modelName: "",
  isEnabled: true,
  isOneMillionContext: false,
});

const createProviderConfig = (isDefault: boolean): LlmProviderConfig => {
  const providerOption =
    getProviderOption("openai") ??
    getProviderOptions()[0] ??
    {
      value: "openai",
      label: "OpenAI",
    };
  const provider = providerOption.value;
  const apiFormat = getDefaultApiFormat(provider);
  const defaultModel = getProviderModelOptions(provider)[0];

  return {
    id: createId("provider"),
    name: providerOption.label,
    provider,
    apiFormat,
    apiKey: "",
    apiEndpoint: inferApiEndpoint(provider, apiFormat),
    isDefault,
    models: [
      {
        ...createModelConfig(),
        modelId: defaultModel?.id ?? "",
        modelName: defaultModel?.name ?? "",
      },
    ],
  };
};

const toLlmSettingsConfig = (settings: LlmSettings): LlmSettingsConfig => {
  const providers = settings.providers.map((provider) => {
    const providerId =
      getProviderOption(provider.provider)?.value ??
      getProviderOptions()[0]?.value ??
      "openai";
    const apiFormat = provider.apiFormat || getDefaultApiFormat(providerId);

    return {
      id: provider.id,
      name: provider.name,
      provider: providerId,
      apiFormat,
      apiKey: provider.apiKey ?? "",
      apiEndpoint:
        provider.apiEndpoint ?? inferApiEndpoint(providerId, apiFormat),
      isDefault: provider.isDefault,
      models: provider.models.map((model) => ({
        id: model.id,
        modelId: model.modelId,
        modelName: model.modelName,
        isEnabled: model.isEnabled,
        isOneMillionContext: model.isOneMillionContext,
      })),
    };
  });

  return { providers };
};

const normalizeLlmSettingsConfig = (
  draft: LlmSettingsConfig,
): LlmSettingsConfig => {
  const providers = draft.providers.map((provider, index) => ({
    ...provider,
    name:
      provider.name.trim() ||
      getProviderOption(provider.provider)?.label ||
      provider.provider,
    provider: provider.provider.trim(),
    apiFormat: provider.apiFormat.trim(),
    apiKey: provider.apiKey.trim(),
    apiEndpoint: provider.apiEndpoint.trim(),
    isDefault: index === draft.providers.findIndex((item) => item.isDefault),
    models: provider.models.map((model) => ({
      ...model,
      modelId: model.modelId.trim(),
      modelName: model.modelName.trim(),
      isOneMillionContext: model.isOneMillionContext,
    })),
  }));

  if (!providers.some((provider) => provider.isDefault) && providers[0]) {
    providers[0] = { ...providers[0], isDefault: true };
  }

  return { providers };
};

const validateLlmSettingsConfig = (draft: LlmSettingsConfig) => {
  if (draft.providers.length === 0) {
    return "至少添加一个 Provider";
  }

  for (const provider of draft.providers) {
    if (!provider.name.trim()) {
      return "Provider 名称不能为空";
    }

    if (!provider.provider.trim()) {
      return "供应商不能为空";
    }

    if (!getProviderOption(provider.provider)) {
      return "请选择支持的供应商";
    }

    if (!provider.apiFormat.trim()) {
      return "API Format 不能为空";
    }

    if (
      !getProviderApiFormats(provider.provider).some(
        (apiFormat) => apiFormat === provider.apiFormat,
      )
    ) {
      return "请选择支持的 API Format";
    }

    if (provider.models.length === 0) {
      return "每个 Provider 至少需要一个模型";
    }

    for (const model of provider.models) {
      if (!model.modelId.trim()) {
        return "模型 ID 不能为空";
      }

      if (!model.modelName.trim()) {
        return "模型名称不能为空";
      }
    }
  }

  if (
    !draft.providers.some((provider) =>
      provider.models.some((model) => model.isEnabled),
    )
  ) {
    return "至少启用一个模型";
  }

  return "";
};

const cloneProviderConfig = (
  provider: LlmProviderConfig,
): LlmProviderConfig => ({
  ...provider,
  models: provider.models.map((model) => ({ ...model })),
});

const toProviderConfig = (provider: LlmProvider) => {
  return toLlmSettingsConfig({ providers: [provider] }).providers[0] ?? null;
};

const normalizeProvidersForSave = (
  providers: LlmProviderConfig[],
  providerId?: string,
) => {
  const shouldSetDefault = Boolean(
    providerId &&
      providers.find((provider) => provider.id === providerId)?.isDefault,
  );
  const nextProviders = shouldSetDefault
    ? providers.map((provider) => ({
        ...provider,
        isDefault: provider.id === providerId,
      }))
    : [...providers];

  if (!nextProviders.some((provider) => provider.isDefault) && nextProviders[0]) {
    nextProviders[0] = { ...nextProviders[0], isDefault: true };
  }

  return nextProviders;
};

const applyProviderDefaults = (
  provider: LlmProviderConfig,
  providerId: string,
): LlmProviderConfig => {
  const currentOption = getProviderOption(provider.provider);
  const nextOption = getProviderOption(providerId);
  const apiFormat = getDefaultApiFormat(providerId);
  const defaultModel = getProviderModelOptions(providerId)[0];
  const shouldFollowName =
    !provider.name.trim() ||
    provider.name === currentOption?.label ||
    provider.name === provider.provider;

  return {
    ...provider,
    provider: providerId,
    apiFormat,
    name: shouldFollowName ? nextOption?.label ?? providerId : provider.name,
    apiEndpoint: inferApiEndpoint(providerId, apiFormat),
    models: defaultModel
      ? [
          {
            ...createModelConfig(),
            modelId: defaultModel.id,
            modelName: defaultModel.name,
          },
        ]
      : provider.models,
  };
};

const applyApiFormatDefaults = (
  provider: LlmProviderConfig,
  apiFormat: string,
): LlmProviderConfig => {
  return {
    ...provider,
    apiFormat,
    apiEndpoint: inferApiEndpoint(provider.provider, apiFormat),
  };
};

const applyModelDefaults = (
  model: ProviderModelConfig,
  provider: string,
  modelId: string,
): ProviderModelConfig => {
  const options = getProviderModelOptions(provider);
  const currentOption = options.find((item) => item.id === model.modelId);
  const option = options.find((item) => item.id === modelId);
  const shouldFollowName =
    !model.modelName.trim() || model.modelName === currentOption?.name;

  return {
    ...model,
    modelId,
    modelName: option?.name ?? (shouldFollowName ? modelId : model.modelName),
  };
};

export const ProviderDialog = ({
  open,
  mode,
  provider,
  providers,
  onOpenChange,
  onSaved,
}: ProviderDialogProps) => {
  const [providerDraft, setProviderDraft] =
    useState<LlmProviderConfig | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setProviderDraft(null);
      setError("");
      return;
    }

    setError("");

    if (mode === "edit") {
      const providerConfig = provider ? toProviderConfig(provider) : null;
      setProviderDraft(
        providerConfig ? cloneProviderConfig(providerConfig) : null,
      );
      return;
    }

    setProviderDraft(createProviderConfig(providers.length === 0));
  }, [mode, open, provider, providers.length]);

  const selectedProviderOption = providerDraft
    ? getProviderOption(providerDraft.provider)
    : undefined;
  const selectedApiFormatOptions = providerDraft
    ? getProviderApiFormatOptions(providerDraft.provider)
    : [];
  const selectedModelOptions = providerDraft
    ? getProviderModelOptions(providerDraft.provider)
    : [];
  const modelOptionListId = providerDraft
    ? `${providerDraft.id}-model-options`
    : "";
  const canDelete = mode === "edit" && providers.length > 1;

  const updateProviderDraft = (
    updater: (provider: LlmProviderConfig) => LlmProviderConfig,
  ) => {
    setProviderDraft((current) => current ? updater(current) : current);
  };

  const updateModel = (
    modelId: string,
    updater: (model: ProviderModelConfig) => ProviderModelConfig,
  ) => {
    updateProviderDraft((current) => ({
      ...current,
      models: current.models.map((model) =>
        model.id === modelId ? updater(model) : model,
      ),
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
        : providerConfigs.map((item) =>
            item.id === nextProvider.id ? nextProvider : item
          );
    const didSave = await saveProviders(
      normalizeProvidersForSave(nextProviders, nextProvider.id),
    );

    if (didSave) {
      onOpenChange(false);
      await onSaved?.();
    }
  };

  const deleteProvider = async () => {
    if (!providerDraft || mode !== "edit" || providers.length <= 1) {
      return;
    }

    const providerConfigs = toLlmSettingsConfig({ providers }).providers;
    const didSave = await saveProviders(
      normalizeProvidersForSave(
        providerConfigs.filter((item) => item.id !== providerDraft.id),
      ),
    );

    if (didSave) {
      onOpenChange(false);
      await onSaved?.();
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (isSaving) {
      return;
    }

    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[calc(100vh-4rem)] gap-0 overflow-hidden border-transparent p-0 shadow-lg sm:max-w-4xl">
        <DialogHeader>
          <div className="px-6 pt-6 pb-4 shadow-[0_10px_30px_-30px_rgb(15_23_42_/_0.35)]">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <span className="flex size-8 items-center justify-center rounded-md bg-accent text-primary shadow-xs">
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
              <div className="mx-6 mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
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
                  <select
                    id="llm-provider"
                    className={selectClassName}
                    value={providerDraft.provider}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      updateProviderDraft((current) =>
                        applyProviderDefaults(current, value),
                      );
                    }}
                  >
                    {getProviderOptions().map((providerOption) => (
                      <option
                        key={providerOption.value}
                        value={providerOption.value}
                      >
                        {providerOption.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="llm-api-format">API Format</Label>
                  <select
                    id="llm-api-format"
                    className={selectClassName}
                    value={providerDraft.apiFormat}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      updateProviderDraft((current) =>
                        applyApiFormatDefaults(current, value),
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

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/35 px-3 py-2.5">
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
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => void deleteProvider()}
                    disabled={isSaving}
                  >
                    <Trash2 className="size-4" />
                    <span>删除 Provider</span>
                  </Button>
                )}
              </div>

              <div className="mt-5 space-y-3 rounded-md bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">模型</h3>
                    <p className="text-xs text-muted-foreground">
                      可从供应商模型中选择，也可以手动输入自定义模型 ID。
                    </p>
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
                      className="grid gap-3 rounded-md bg-card p-3 shadow-xs md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto_auto]"
                    >
                      <div className="space-y-2">
                        <Label htmlFor={`${model.id}-model-id`}>模型 ID</Label>
                        <Input
                          id={`${model.id}-model-id`}
                          list={modelOptionListId}
                          value={model.modelId}
                          onChange={(event) => {
                            const value = event.currentTarget.value;
                            updateModel(model.id, (item) =>
                              applyModelDefaults(
                                item,
                                providerDraft.provider,
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
                            updateModel(model.id, (item) => ({
                              ...item,
                              modelName: value,
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

            <DialogFooter className="px-6 pb-6 pt-4 shadow-[0_-10px_30px_-32px_rgb(15_23_42_/_0.35)]">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isSaving}
              >
                取消
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? (
                  <Loader2 className="size-4 animate-spin" />
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
