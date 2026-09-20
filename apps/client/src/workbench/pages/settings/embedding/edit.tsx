import { useImperativeHandle, useState, type Ref } from "react";
import { CheckCircle2, Eye, EyeOff, Layers3, Loader2, Save, Trash2 } from "lucide-react";
import {
  deleteEmbeddingProfile,
  saveEmbeddingProfile,
  type EmbeddingProfile,
  type EmbeddingProviderKind,
} from "@/api/embedding";
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
import {
  embeddingDraftFromProfile,
  emptyEmbeddingDraft,
  localOllamaBaseUrl,
  localOllamaBatchSize,
  localOllamaDimensions,
  localOllamaModelId,
  localOllamaModelOptions,
  openAiCompatibleEmbeddingModelOptions,
  type EmbeddingDraft,
} from "./ui-state";

type EmbeddingEditMode = "create" | "edit";
type EmbeddingEditDialogOpenOptions = { mode: "create" } | { mode: "edit"; profile: EmbeddingProfile };

export type EmbeddingEditDialogHandle = {
  open: (options?: EmbeddingEditDialogOpenOptions) => void;
};

type EmbeddingEditDialogProps = {
  bind: Ref<EmbeddingEditDialogHandle>;
  profiles: EmbeddingProfile[];
  onSaved?: () => void | Promise<void>;
};

const validateDraft = (draft: EmbeddingDraft) => {
  if (!draft.name.trim()) return "配置名称不能为空";
  if (!draft.modelId.trim()) return "请选择或填写 Embedding 模型";
  if (!Number.isFinite(draft.dimensions) || draft.dimensions <= 0) return "Embedding 维度必须大于 0";
  if (!Number.isFinite(draft.batchSize) || draft.batchSize <= 0) return "Embedding 批量大小必须大于 0";
  return null;
};

export const EmbeddingEditDialog = ({ bind, profiles, onSaved }: EmbeddingEditDialogProps) => {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<EmbeddingEditMode>("create");
  const [draft, setDraft] = useState<EmbeddingDraft | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isApiKeyVisible, setIsApiKeyVisible] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [error, setError] = useState("");

  const resetTransientState = () => {
    setError("");
    setIsApiKeyVisible(false);
    setIsDeleteConfirmOpen(false);
  };

  const openCreate = () => {
    setMode("create");
    setDraft(emptyEmbeddingDraft());
    resetTransientState();
    setOpen(true);
  };

  const openEdit = (profile: EmbeddingProfile) => {
    setMode("edit");
    setDraft(embeddingDraftFromProfile(profile));
    resetTransientState();
    setOpen(true);
  };

  const closeDialog = () => {
    setOpen(false);
    setDraft(null);
    resetTransientState();
  };

  useImperativeHandle(
    bind,
    () => ({
      open: (options = { mode: "create" }) => {
        if (options.mode === "edit") {
          openEdit(options.profile);
          return;
        }
        openCreate();
      },
    }),
    [],
  );

  const editingProfile = draft?.id ? (profiles.find((profile) => profile.id === draft.id) ?? null) : null;
  const knowledgeBaseCount = editingProfile?.knowledgeBaseCount ?? 0;
  const isUsedByKnowledge = knowledgeBaseCount > 0;
  const isLocalOllama = draft?.providerKind === "ollama";
  const modelOptions = isLocalOllama ? localOllamaModelOptions : openAiCompatibleEmbeddingModelOptions;
  const canDelete = mode === "edit";

  const updateDraft = (updater: (current: EmbeddingDraft) => EmbeddingDraft) => {
    setDraft((current) => (current ? updater(current) : current));
    setError("");
  };

  const changeProvider = (providerKind: EmbeddingProviderKind) => {
    updateDraft((current) => {
      if (providerKind === "ollama") {
        return {
          ...current,
          providerKind,
          baseUrl: localOllamaBaseUrl,
          modelId: localOllamaModelId,
          apiKey: "",
          dimensions: localOllamaDimensions,
          batchSize: localOllamaBatchSize,
        };
      }

      return {
        ...current,
        providerKind,
        baseUrl: "",
        modelId: "",
        dimensions: 1536,
        batchSize: 32,
      };
    });
  };

  const save = async () => {
    if (!draft) return;
    const validationError = validateDraft(draft);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSaving(true);
    setError("");
    try {
      await saveEmbeddingProfile({
        id: draft.id,
        name: draft.name.trim(),
        providerKind: draft.providerKind,
        baseUrl: draft.baseUrl.trim() || null,
        apiKey: isLocalOllama ? null : draft.apiKey.trim() || null,
        modelId: draft.modelId.trim(),
        dimensions: Math.floor(draft.dimensions),
        batchSize: Math.floor(draft.batchSize),
      });
      closeDialog();
      await onSaved?.();
    } catch (caught) {
      setError(String(caught));
    } finally {
      setIsSaving(false);
    }
  };

  const deleteProfile = async () => {
    if (!draft?.id || !canDelete) return;
    setIsSaving(true);
    setError("");
    try {
      await deleteEmbeddingProfile(draft.id);
      setIsDeleteConfirmOpen(false);
      closeDialog();
      await onSaved?.();
    } catch (caught) {
      setIsDeleteConfirmOpen(false);
      setError(String(caught));
    } finally {
      setIsSaving(false);
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
                  <Layers3 className="size-5" />
                </span>
                <span>{mode === "create" ? "新增 Embedding 配置" : "编辑 Embedding 配置"}</span>
              </DialogTitle>
              <DialogDescription className="mt-1.5 pl-[52px]">配置可供知识库选择的向量化服务与模型。</DialogDescription>
            </div>
          </DialogHeader>

          {draft && (
            <form
              className="flex min-h-0 flex-col"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
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

                {isUsedByKnowledge && (
                  <div className="mx-6 mt-5 rounded-xl border border-warning/25 bg-warning/10 px-3.5 py-3 text-xs leading-5 text-warning">
                    此配置当前被 {knowledgeBaseCount} 个知识库使用。修改模型、地址或向量维度后，需要重建相关索引。
                  </div>
                )}

                <section className="px-6 py-5" aria-labelledby="embedding-connection-heading">
                  <h3 id="embedding-connection-heading" className="mb-4 text-sm font-semibold">
                    模型服务
                  </h3>
                  <div className="grid gap-x-4 gap-y-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="embedding-profile-name">配置名称</Label>
                      <Input
                        id="embedding-profile-name"
                        value={draft.name}
                        placeholder={isLocalOllama ? "本地 Ollama" : "OpenAI Embedding"}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          updateDraft((current) => ({ ...current, name: value }));
                        }}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="embedding-provider">Provider</Label>
                      <NativeSelect
                        id="embedding-provider"
                        className="w-full"
                        value={draft.providerKind}
                        onChange={(event) => changeProvider(event.currentTarget.value as EmbeddingProviderKind)}
                      >
                        <NativeSelectOption value="openai-compatible">OpenAI-compatible</NativeSelectOption>
                        <NativeSelectOption value="ollama">本地 Ollama</NativeSelectOption>
                      </NativeSelect>
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="embedding-model">模型 ID</Label>
                      <Input
                        id="embedding-model"
                        list="embedding-model-options"
                        value={draft.modelId}
                        placeholder={isLocalOllama ? "embeddinggemma" : "text-embedding-3-small"}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          updateDraft((current) => ({ ...current, modelId: value }));
                        }}
                      />
                      <datalist id="embedding-model-options">
                        {modelOptions.map((model) => (
                          <option key={model.id} value={model.modelId}>
                            {model.modelName ?? model.modelId}
                          </option>
                        ))}
                      </datalist>
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="embedding-base-url">服务地址</Label>
                      <Input
                        id="embedding-base-url"
                        value={draft.baseUrl}
                        placeholder={isLocalOllama ? localOllamaBaseUrl : "https://api.openai.com/v1"}
                        aria-describedby="embedding-base-url-help"
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          updateDraft((current) => ({ ...current, baseUrl: value }));
                        }}
                      />
                      <p id="embedding-base-url-help" className="text-xs leading-5 text-muted-foreground">
                        {isLocalOllama
                          ? "本地 Ollama 默认使用 127.0.0.1:11434。"
                          : "在线或第三方 OpenAI-compatible 服务可在这里覆盖默认地址。"}
                      </p>
                    </div>

                    {!isLocalOllama && (
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="embedding-api-key">API Key</Label>
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="relative min-w-0 flex-1">
                            <Input
                              id="embedding-api-key"
                              className="pr-10"
                              type={isApiKeyVisible ? "text" : "password"}
                              value={draft.apiKey}
                              placeholder="按服务要求填写"
                              onChange={(event) => {
                                const value = event.currentTarget.value;
                                updateDraft((current) => ({ ...current, apiKey: value }));
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
                          {draft.apiKey.trim() && (
                            <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-success">
                              <CheckCircle2 className="size-4" />
                              凭据已配置
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </section>

                <section className="border-t border-border/70 px-6 py-5" aria-labelledby="embedding-index-heading">
                  <div className="mb-4">
                    <h3 id="embedding-index-heading" className="text-sm font-semibold">
                      索引参数
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">参数必须与模型输出的向量规格一致。</p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="embedding-dimensions">向量维度</Label>
                      <Input
                        id="embedding-dimensions"
                        type="number"
                        min={1}
                        value={draft.dimensions}
                        onChange={(event) => {
                          const value = Number(event.currentTarget.value);
                          updateDraft((current) => ({ ...current, dimensions: value }));
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="embedding-batch-size">批量大小</Label>
                      <Input
                        id="embedding-batch-size"
                        type="number"
                        min={1}
                        disabled={isLocalOllama}
                        value={draft.batchSize}
                        aria-describedby="embedding-batch-size-help"
                        onChange={(event) => {
                          const value = Number(event.currentTarget.value);
                          updateDraft((current) => ({ ...current, batchSize: value }));
                        }}
                      />
                      <p id="embedding-batch-size-help" className="text-xs leading-5 text-muted-foreground">
                        {isLocalOllama ? "本地 Ollama 固定按单条请求生成向量。" : "批量越大，越容易触发服务限流。"}
                      </p>
                    </div>
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
                      <span>删除配置</span>
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
            <AlertDialogTitle>删除“{draft?.name || "这个配置"}”？</AlertDialogTitle>
            <AlertDialogDescription>
              {isUsedByKnowledge
                ? `此配置当前被 ${knowledgeBaseCount} 个知识库使用。删除后不会自动切换模型；这些知识库会显示“模型失效”，需要手动选择新模型。`
                : "删除后，此配置将不再出现在知识库的向量模型选项中。此操作无法撤销。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={isSaving} onClick={() => void deleteProfile()}>
              {isSaving && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />}
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
