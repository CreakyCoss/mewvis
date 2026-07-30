import { useImperativeHandle, useState, type Ref } from "react";
import { CheckCircle2, Eye, EyeOff, Loader2, Plus, Save, ServerCog, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { saveLlmSettings } from "@/api/llm";
import { getProviderOption, getProviderOptions } from "../options";
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
  const [isApiKeyVisible, setIsApiKeyVisible] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [error, setError] = useState("");

  const resetTransientState = () => {
    setError("");
    setIsApiKeyVisible(false);
    setIsDeleteConfirmOpen(false);
  };

  const openCreateProvider = () => {
    setMode("create");
    setProviderDraft(createProviderConfig(providers.length === 0));
    resetTransientState();
    setOpen(true);
  };

  const openEditProvider = (provider: LlmProvider) => {
    const providerConfig = toProviderConfig(provider);

    setMode("edit");
    setProviderDraft(providerConfig ? cloneProviderConfig(providerConfig) : null);
    resetTransientState();
    setOpen(true);
  };

  const closeDialog = () => {
    setOpen(false);
    setProviderDraft(null);
    resetTransientState();
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
    if (!providerDraft || mode !== "edit" || providers.length <= 1) return;

    const providerConfigs = toLlmSettingsConfig({ providers }).providers;
    const didSave = await saveProviders(
      normalizeProvidersForSave(providerConfigs.filter((item) => item.id !== providerDraft.id)),
    );

    if (didSave) {
      setIsDeleteConfirmOpen(false);
      closeDialog();
      await onSaved?.();
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (isSaving) return;

    if (!nextOpen) {
      closeDialog();
      return;
    }

    setOpen(true);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="!flex max-h-[calc(100vh-2rem)] w-[min(720px,calc(100vw-2rem))] flex-col gap-0 overflow-hidden border-border/70 bg-popover p-0 shadow-[var(--shadow-floating)] sm:max-w-[720px]">
          <DialogHeader className="shrink-0">
            <div className="border-b border-border/70 bg-card/35 px-6 pt-6 pb-5">
              <DialogTitle className="flex items-center gap-3 text-lg font-semibold">
                <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-primary">
                  <ServerCog className="size-5" />
                </span>
                <span>{mode === "create" ? "新增 Provider" : "编辑 Provider"}</span>
              </DialogTitle>
              <DialogDescription className="mt-1.5 pl-[52px]">配置连接信息和可用模型。</DialogDescription>
            </div>
          </DialogHeader>

          {providerDraft && (
            <form
              className="flex min-h-0 flex-col"
              onSubmit={(event) => {
                event.preventDefault();
                void saveProvider();
              }}
            >
              <div className="min-h-0 max-h-[calc(100vh-12rem)] overflow-y-auto">
                {error && (
                  <div
                    role="alert"
                    className="mx-6 mt-5 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
                  >
                    {error}
                  </div>
                )}

                <section className="px-6 py-5" aria-labelledby="llm-connection-heading">
                  <h3 id="llm-connection-heading" className="mb-4 text-sm font-semibold">
                    连接信息
                  </h3>

                  <div className="grid gap-x-4 gap-y-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="llm-provider-name">Provider 名称</Label>
                      <Input
                        id="llm-provider-name"
                        value={providerDraft.name}
                        placeholder={selectedProviderOption?.label ?? "Provider 名称"}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          updateProviderDraft((current) => ({ ...current, name: value }));
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
                          updateProviderDraft((current) => applyProviderDefaults(current, event.currentTarget.value));
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
                          if (value) updateProviderDraft((current) => applyApiFormatDefaults(current, value));
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
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="relative min-w-0 flex-1">
                          <Input
                            id="llm-api-key"
                            className="pr-10"
                            type={isApiKeyVisible ? "text" : "password"}
                            value={providerDraft.apiKey}
                            onChange={(event) => {
                              const value = event.currentTarget.value;
                              updateProviderDraft((current) => ({ ...current, apiKey: value }));
                            }}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="absolute top-1/2 right-1 -translate-y-1/2"
                            aria-label={isApiKeyVisible ? "隐藏 API Key" : "显示 API Key"}
                            title={isApiKeyVisible ? "隐藏 API Key" : "显示 API Key"}
                            onClick={() => setIsApiKeyVisible((visible) => !visible)}
                          >
                            {isApiKeyVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                          </Button>
                        </div>
                        {providerDraft.apiKey.trim() && (
                          <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-success">
                            <CheckCircle2 className="size-4" />
                            凭据已配置
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="llm-api-endpoint">API Endpoint</Label>
                      <Input
                        id="llm-api-endpoint"
                        value={providerDraft.apiEndpoint}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          updateProviderDraft((current) => ({ ...current, apiEndpoint: value }));
                        }}
                        placeholder="自动匹配供应商和 API Format"
                      />
                    </div>
                  </div>

                  <div className="mt-5 flex items-center gap-3 border-t border-border/70 pt-4">
                    <Switch
                      id="llm-default-provider"
                      checked={providerDraft.isDefault}
                      onCheckedChange={(checked) => {
                        if (!checked) return;
                        updateProviderDraft((current) => ({ ...current, isDefault: true }));
                      }}
                    />
                    <Label htmlFor="llm-default-provider" className="font-normal">
                      设为默认 Provider
                    </Label>
                  </div>
                </section>

                <section className="border-t border-border/70 px-6 py-5" aria-labelledby="llm-models-heading">
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                      <h3 id="llm-models-heading" className="text-sm font-semibold">
                        可用模型
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">管理此 Provider 下可用于对话和角色的模型。</p>
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

                  <div className="overflow-hidden rounded-xl border border-border/70 bg-card/55">
                    <div className="hidden min-h-10 grid-cols-[minmax(150px,1fr)_minmax(140px,1fr)_92px_68px_36px] items-center gap-2 border-b border-border/70 bg-muted/25 px-3 text-xs font-medium text-muted-foreground md:grid">
                      <span>模型 ID</span>
                      <span>显示名称</span>
                      <span>上下文</span>
                      <span>启用</span>
                      <span className="sr-only">操作</span>
                    </div>

                    {providerDraft.models.map((model, index) => (
                      <div
                        key={model.id}
                        className="grid gap-3 border-t border-border/60 p-3 first:border-t-0 md:grid-cols-[minmax(150px,1fr)_minmax(140px,1fr)_92px_68px_36px] md:items-center md:gap-2 md:border-t md:first:border-t-0"
                      >
                        <div className="space-y-2 md:space-y-0">
                          <Label className="md:hidden" htmlFor={`${model.id}-model-id`}>
                            模型 ID
                          </Label>
                          <Input
                            id={`${model.id}-model-id`}
                            className="border-transparent bg-transparent shadow-none hover:bg-card/80 focus-visible:bg-card"
                            list={modelOptionListId}
                            value={model.modelId}
                            onChange={(event) => {
                              const value = event.currentTarget.value;
                              updateModel(model.id, (item) => applyModelDefaults(item, providerDraft.provider, value));
                            }}
                          />
                        </div>

                        <div className="space-y-2 md:space-y-0">
                          <Label className="md:hidden" htmlFor={`${model.id}-model-name`}>
                            显示名称
                          </Label>
                          <Input
                            id={`${model.id}-model-name`}
                            className="border-transparent bg-transparent shadow-none hover:bg-card/80 focus-visible:bg-card"
                            value={model.modelName}
                            onChange={(event) => {
                              const value = event.currentTarget.value;
                              updateModel(model.id, (item) => ({ ...item, modelName: value }));
                            }}
                            placeholder={
                              selectedModelOptions.find((item) => item.id === model.modelId)?.name ?? "自定义显示名称"
                            }
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <Switch
                            id={`${model.id}-context`}
                            checked={model.isOneMillionContext}
                            onCheckedChange={(checked) => {
                              updateModel(model.id, (item) => ({ ...item, isOneMillionContext: checked }));
                            }}
                          />
                          <Label htmlFor={`${model.id}-context`} className="font-normal text-muted-foreground">
                            1M
                          </Label>
                        </div>

                        <div className="flex items-center gap-2">
                          <Switch
                            id={`${model.id}-enabled`}
                            checked={model.isEnabled}
                            onCheckedChange={(checked) => {
                              updateModel(model.id, (item) => ({ ...item, isEnabled: checked }));
                            }}
                          />
                          <Label
                            htmlFor={`${model.id}-enabled`}
                            className="font-normal text-muted-foreground md:sr-only"
                          >
                            启用
                          </Label>
                        </div>

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="justify-self-end text-muted-foreground hover:text-destructive"
                          title={`删除模型 ${index + 1}`}
                          aria-label={`删除模型 ${index + 1}`}
                          onClick={() => removeModel(model.id)}
                          disabled={providerDraft.models.length <= 1}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <DialogFooter className="shrink-0 border-t border-border/70 bg-card/35 px-6 py-4 sm:justify-between">
                <div>
                  {canDelete && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setIsDeleteConfirmOpen(true)}
                      disabled={isSaving}
                    >
                      <Trash2 className="size-4" />
                      <span>删除 Provider</span>
                    </Button>
                  )}
                </div>
                <div className="flex justify-end gap-2">
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
                </div>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除“{providerDraft?.name || "这个 Provider"}”？</AlertDialogTitle>
            <AlertDialogDescription>
              删除后，此 Provider 下的模型将不再出现在对话、角色和酒馆中。此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={isSaving} onClick={() => void deleteProvider()}>
              {isSaving && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />}
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
