import type { Dispatch, SetStateAction } from "react";
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
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Loader2, Save } from "lucide-react";
import type { EmbeddingProfile } from "../types";
import {
  localOllamaBaseUrl,
  localOllamaBatchSize,
  localOllamaDimensions,
  localOllamaModelId,
  localOllamaProviderId,
  type EmbeddingProviderOption,
  type EmbeddingDraft,
} from "../ui-state";

type EmbeddingConfigDialogProps = {
  open: boolean;
  embeddingDraft: EmbeddingDraft;
  defaultEmbeddingProfile: EmbeddingProfile | null;
  selectedEmbeddingProvider: EmbeddingProviderOption | null;
  supportedEmbeddingProviders: EmbeddingProviderOption[];
  embeddingModelOptions: EmbeddingProviderOption["models"];
  isLocalOllamaEmbedding: boolean;
  isEmbeddingConfigChanged: boolean;
  isSavingEmbedding: boolean;
  setEmbeddingDraft: Dispatch<SetStateAction<EmbeddingDraft>>;
  onOpenChange: (open: boolean) => void;
  onRequestSave: () => void;
};

export const EmbeddingConfigDialog = ({
  open,
  embeddingDraft,
  defaultEmbeddingProfile,
  selectedEmbeddingProvider,
  supportedEmbeddingProviders,
  embeddingModelOptions,
  isLocalOllamaEmbedding,
  isEmbeddingConfigChanged,
  isSavingEmbedding,
  setEmbeddingDraft,
  onOpenChange,
  onRequestSave,
}: EmbeddingConfigDialogProps) => (
  <Dialog
    open={open}
    onOpenChange={(nextOpen) => {
      if (!nextOpen && isSavingEmbedding) {
        return;
      }
      onOpenChange(nextOpen);
    }}
  >
    <DialogContent className="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Embedding 模型配置</DialogTitle>
        <DialogDescription>
          配置知识库向量索引用的模型、服务地址和维度。保存后请重建索引，让新配置生效。
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        {(isEmbeddingConfigChanged || !defaultEmbeddingProfile) && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-700 dark:text-amber-300">
            {defaultEmbeddingProfile
              ? "模型、地址或维度变化后，现有向量索引会过期。保存配置后请执行重建索引，系统会重新生成全部向量。"
              : "首次配置后请执行重建索引，系统会为已启用集合中的文件生成向量索引。"}
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground">
              Provider
            </span>
            <NativeSelect
              className="w-full"
              value={embeddingDraft.providerId}
              onChange={(event) => {
                const value = event.target.value;
                if (value === localOllamaProviderId) {
                  setEmbeddingDraft((current) => ({
                    ...current,
                    providerId: localOllamaProviderId,
                    providerKind: "ollama",
                    baseUrl: current.providerKind === "ollama"
                      ? current.baseUrl || localOllamaBaseUrl
                      : localOllamaBaseUrl,
                    modelId: current.providerKind === "ollama"
                      ? current.modelId || localOllamaModelId
                      : localOllamaModelId,
                    dimensions: localOllamaDimensions,
                    batchSize: localOllamaBatchSize,
                  }));
                  return;
                }

                const provider = supportedEmbeddingProviders.find((item) => item.id === value);
                const model = provider?.models.find((item) => item.isEnabled)
                  ?? provider?.models[0];
                setEmbeddingDraft((current) => ({
                  ...current,
                  providerId: value,
                  providerKind: provider?.apiFormat ?? "openai-compatible",
                  baseUrl: current.providerKind === "ollama"
                    ? provider?.apiEndpoint ?? ""
                    : current.baseUrl || (provider?.apiEndpoint ?? ""),
                  modelId: model?.modelId ?? current.modelId,
                  dimensions: current.providerKind === "ollama" ? 1536 : current.dimensions,
                  batchSize: current.providerKind === "ollama" ? 32 : current.batchSize,
                }));
              }}
            >
              <NativeSelectOption value={localOllamaProviderId}>
                本地 Ollama
              </NativeSelectOption>
              {supportedEmbeddingProviders.map((provider) => (
                <NativeSelectOption key={provider.id} value={provider.id}>
                  {provider.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>

          <label className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground">
              模型 ID
            </span>
            <Input
              list="knowledge-embedding-model-options"
              value={embeddingDraft.modelId}
              placeholder={isLocalOllamaEmbedding ? "embeddinggemma" : "text-embedding-3-small"}
              onChange={(event) => {
                const value = event.target.value;
                setEmbeddingDraft((current) => ({
                  ...current,
                  modelId: value,
                }));
              }}
            />
            <datalist id="knowledge-embedding-model-options">
              {embeddingModelOptions.map((model) => (
                <option key={model.id} value={model.modelId}>
                  {model.modelName ?? model.modelId}
                </option>
              ))}
            </datalist>
          </label>
        </div>

        <label className="space-y-2">
          <span className="text-xs font-medium text-muted-foreground">
            服务地址
          </span>
          <Input
            value={embeddingDraft.baseUrl}
            placeholder={isLocalOllamaEmbedding
              ? localOllamaBaseUrl
              : selectedEmbeddingProvider?.apiEndpoint ?? "https://api.openai.com/v1"}
            onChange={(event) => {
              const value = event.target.value;
              setEmbeddingDraft((current) => ({
                ...current,
                baseUrl: value,
              }));
            }}
          />
          <p className="text-xs leading-5 text-muted-foreground">
            {isLocalOllamaEmbedding
              ? "本地 Ollama 默认使用 127.0.0.1:11434；如果服务监听在其他地址或端口，可在这里修改。"
              : "在线或第三方 OpenAI-compatible Embedding 服务可在这里覆盖 Provider 的默认地址。"}
          </p>
        </label>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground">
              向量维度
            </span>
            <Input
              type="number"
              min={1}
              value={embeddingDraft.dimensions}
              onChange={(event) => {
                const value = Number(event.target.value);
                setEmbeddingDraft((current) => ({
                  ...current,
                  dimensions: value,
                }));
              }}
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground">
              批量大小
            </span>
            <Input
              type="number"
              min={1}
              disabled={isLocalOllamaEmbedding}
              value={embeddingDraft.batchSize}
              onChange={(event) => {
                const value = Number(event.target.value);
                setEmbeddingDraft((current) => ({
                  ...current,
                  batchSize: value,
                }));
              }}
            />
            <p className="text-xs leading-5 text-muted-foreground">
              {isLocalOllamaEmbedding
                ? "本地 Ollama 按单条请求生成向量，避免模型一次处理过多文本。"
                : "批量越大重建越快，但更容易触发第三方服务限流。"}
            </p>
          </label>
        </div>
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={isSavingEmbedding}
        >
          取消
        </Button>
        <Button
          type="button"
          onClick={onRequestSave}
          disabled={isSavingEmbedding}
        >
          {isSavingEmbedding ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          <span>保存配置</span>
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
