import { useImperativeHandle, useRef, useState, type Ref } from "react";
import { CheckCircle2, Download, Eye, EyeOff, Loader2, Pencil, Plus, Save, ServerCog, Trash2 } from "lucide-react";
import {
  getModelThinking,
  type LlmProvider,
  type LlmProviderConfig,
  type ProviderModelConfig,
} from "@/agent-client/runtime-model";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "design-system/components/ui/alert-dialog";
import { Button } from "design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "design-system/components/ui/dialog";
import { Input } from "design-system/components/ui/input";
import { Label } from "design-system/components/ui/label";
import { NativeSelect, NativeSelectOption } from "design-system/components/ui/native-select";
import { Switch } from "design-system/components/ui/switch";
import { cn } from "design-system/lib/utils";
import { saveLlmSettings } from "@/api/llm";
import { getProviderApiFormatOptions, getProviderOption, getProviderOptions } from "../options";
import {
  applyApiFormatDefaults,
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

import { ModelEditDialog } from "./model";
import { DiscoverModelsDialog } from "./discover-models";

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
  const [modelEditor, setModelEditor] = useState<{ model?: ProviderModelConfig } | null>(null);
  const [isDiscoveryOpen, setIsDiscoveryOpen] = useState(false);
  const modelFocusTarget = useRef<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isApiKeyVisible, setIsApiKeyVisible] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [error, setError] = useState("");

  const resetTransientState = () => {
    setError("");
    setModelEditor(null);
    setIsDiscoveryOpen(false);
    modelFocusTarget.current = null;
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
  const canDelete = mode === "edit" && providers.length > 1;

  const updateProviderDraft = (updater: (provider: LlmProviderConfig) => LlmProviderConfig) => {
    setProviderDraft((current) => (current ? updater(current) : current));
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
      <Dialog open={open && !modelEditor && !isDiscoveryOpen} onOpenChange={handleOpenChange}>
        <DialogContent
          className="!flex max-h-[calc(100vh-2rem)] w-[min(720px,calc(100vw-2rem))] flex-col gap-0 overflow-hidden border-border/70 bg-popover p-0 shadow-[var(--shadow-floating)] sm:max-w-[720px]"
          onOpenAutoFocus={(event) => {
            if (!modelFocusTarget.current) return;
            const target = document.getElementById(modelFocusTarget.current);
            if (target) {
              event.preventDefault();
              target.focus();
            }
            modelFocusTarget.current = null;
          }}
        >
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
                          const provider = event.currentTarget.value;
                          updateProviderDraft((current) => applyProviderDefaults(current, provider));
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
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                    <h3 id="llm-models-heading" className="flex items-center gap-2 text-sm font-semibold">
                      可用模型{" "}
                      <span className="text-xs font-normal text-muted-foreground">{providerDraft.models.length}</span>
                    </h3>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        id="llm-discover-models"
                        type="button"
                        variant="outline"
                        onClick={(event) => {
                          modelFocusTarget.current = event.currentTarget.id;
                          setIsDiscoveryOpen(true);
                        }}
                      >
                        <Download className="size-4" />
                        <span>获取模型</span>
                      </Button>
                      <Button
                        id="llm-add-model"
                        type="button"
                        variant="outline"
                        onClick={(event) => {
                          modelFocusTarget.current = event.currentTarget.id;
                          setModelEditor({});
                        }}
                      >
                        <Plus className="size-4" />
                        <span>新增模型</span>
                      </Button>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-lg border border-border/70">
                    <table className="w-full table-fixed text-left text-sm" aria-labelledby="llm-models-heading">
                      <thead className="border-b border-border/70 bg-muted/30 text-xs text-muted-foreground">
                        <tr>
                          <th scope="col" className="px-3 py-2.5 font-normal">
                            模型
                          </th>
                          <th scope="col" className="w-16 px-2 py-2.5 text-center font-normal sm:w-20 sm:px-3">
                            状态
                          </th>
                          <th scope="col" className="hidden w-20 px-3 py-2.5 text-center font-normal sm:table-cell">
                            上下文
                          </th>
                          <th scope="col" className="w-24 px-2 py-2.5 font-normal sm:w-36 sm:px-3">
                            思考等级
                          </th>
                          <th scope="col" className="w-20 px-2 py-2.5 text-center font-normal sm:w-24 sm:px-3">
                            操作
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {providerDraft.models.map((model) => {
                          const thinking = getModelThinking(providerDraft, model);
                          const defaultLevel = thinking?.levels.find((level) => level.value === thinking.defaultLevel);
                          return (
                            <tr key={model.id} className="transition-colors hover:bg-muted/20">
                              <td className="px-3 py-3">
                                <p className="truncate font-medium" title={model.modelName || model.modelId}>
                                  {model.modelName || model.modelId || "未命名模型"}
                                </p>
                                <p
                                  className="mt-1 truncate font-mono text-[11px] text-muted-foreground"
                                  title={model.modelId}
                                >
                                  {model.modelId || "待设置模型 ID"}
                                </p>
                              </td>
                              <td className="px-2 py-3 text-center sm:px-3">
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-1.5 text-xs",
                                    model.isEnabled ? "text-success" : "text-muted-foreground",
                                  )}
                                >
                                  <span className="size-1.5 shrink-0 rounded-full bg-current" />
                                  {model.isEnabled ? "启用" : "停用"}
                                </span>
                              </td>
                              <td className="hidden px-3 py-3 text-center text-xs text-muted-foreground sm:table-cell">
                                {model.isOneMillionContext ? "1M" : "默认"}
                              </td>
                              <td className="px-2 py-3 text-xs sm:px-3">
                                {thinking?.levels.length ? (
                                  <>
                                    <p
                                      className="truncate"
                                      title={
                                        defaultLevel
                                          ? `默认 ${defaultLevel.label || defaultLevel.value}`
                                          : "不指定默认等级"
                                      }
                                    >
                                      {defaultLevel ? `默认 ${defaultLevel.label || defaultLevel.value}` : "默认不指定"}
                                    </p>
                                    <p className="mt-1 text-[11px] text-muted-foreground">
                                      {thinking.levels.length} 个等级
                                    </p>
                                  </>
                                ) : (
                                  <span className="text-muted-foreground">未配置</span>
                                )}
                              </td>
                              <td className="px-2 py-3 text-center sm:px-3">
                                <Button
                                  id={`llm-model-${model.id}`}
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-8 min-w-16 gap-1.5 px-2 text-xs"
                                  aria-label={`编辑模型 ${model.modelName || model.modelId || "未命名模型"}`}
                                  onClick={(event) => {
                                    modelFocusTarget.current = event.currentTarget.id;
                                    setModelEditor({ model });
                                  }}
                                >
                                  <Pencil className="size-3.5" />
                                  编辑
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
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

      {open && providerDraft && isDiscoveryOpen && (
        <DiscoverModelsDialog
          provider={providerDraft}
          onClose={() => setIsDiscoveryOpen(false)}
          onConfirm={(models) => {
            updateProviderDraft((current) => {
              const existing = new Set(current.models.map((model) => model.modelId.trim()));
              const additions = models
                .filter((model) => !existing.has(model.modelId))
                .map((model) => ({
                  ...createModelConfig(),
                  modelId: model.modelId,
                  modelName: model.modelName || model.modelId,
                }));
              return { ...current, models: [...current.models, ...additions] };
            });
            setIsDiscoveryOpen(false);
          }}
        />
      )}

      {open && providerDraft && modelEditor && (
        <ModelEditDialog
          provider={providerDraft}
          model={modelEditor.model}
          onClose={() => setModelEditor(null)}
          onConfirm={(model) => {
            modelFocusTarget.current = `llm-model-${model.id}`;
            updateProviderDraft((current) => ({
              ...current,
              models: modelEditor.model
                ? current.models.map((item) => (item.id === model.id ? model : item))
                : [...current.models, model],
            }));
            setModelEditor(null);
          }}
          onDelete={
            modelEditor.model && providerDraft.models.length > 1
              ? () => {
                  modelFocusTarget.current = "llm-add-model";
                  updateProviderDraft((current) => ({
                    ...current,
                    models: current.models.filter((item) => item.id !== modelEditor.model?.id),
                  }));
                  setModelEditor(null);
                }
              : undefined
          }
        />
      )}

      <AlertDialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除“{providerDraft?.name || "这个 Provider"}”？</AlertDialogTitle>
            <AlertDialogDescription>
              删除后，此 Provider 下的模型将不再出现在对话、角色和应用中。此操作无法撤销。
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
