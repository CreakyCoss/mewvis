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
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Save } from "lucide-react";
import type { EmbeddingProfile } from "../types";
import {
  localOllamaBaseUrl,
  localOllamaBatchSize,
  localOllamaDimensions,
  localOllamaModelId,
  type EmbeddingDraft,
  type EmbeddingProviderKind,
} from "../ui-state";

type EmbeddingConfigDialogProps = {
  open: boolean;
  embeddingDraft: EmbeddingDraft;
  defaultEmbeddingProfile: EmbeddingProfile | null;
  embeddingModelOptions: Array<{
    id: string;
    modelId: string;
    modelName?: string | null;
  }>;
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
    <DialogContent className="!flex h-[min(700px,calc(100vh-2rem))] max-h-[calc(100vh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
      <DialogHeader className="shrink-0 border-b border-border/60 bg-surface-raised/85 px-6 py-5 pr-14 text-left">
        <DialogTitle>Embedding 模型配置</DialogTitle>
        <DialogDescription>
          配置知识库向量索引用的模型、服务地址和维度。保存后请重建索引，让新配置生效。
        </DialogDescription>
      </DialogHeader>

      <ScrollArea className="app-canvas min-h-0 flex-1 overflow-hidden">
        <div className="space-y-5 px-6 py-5">
          {(isEmbeddingConfigChanged || !defaultEmbeddingProfile) && (
            <div className="rounded-xl border border-warning/25 bg-warning/10 px-3.5 py-3 text-xs leading-5 text-warning">
              {defaultEmbeddingProfile
                ? "模型、地址或维度变化后，现有向量索引会过期。保存配置后请执行重建索引，系统会重新生成全部向量。"
                : "首次配置后请执行重建索引，系统会为已启用集合中的文件生成向量索引。"}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="knowledge-embedding-provider">Provider</Label>
              <NativeSelect
                id="knowledge-embedding-provider"
                className="w-full"
                value={embeddingDraft.providerKind}
                onChange={(event) => {
                  const providerKind = event.target.value as EmbeddingProviderKind;
                  if (providerKind === "ollama") {
                    setEmbeddingDraft((current) => ({
                      ...current,
                      providerKind: "ollama",
                      baseUrl:
                        current.providerKind === "ollama" ? current.baseUrl || localOllamaBaseUrl : localOllamaBaseUrl,
                      modelId:
                        current.providerKind === "ollama" ? current.modelId || localOllamaModelId : localOllamaModelId,
                      apiKey: "",
                      dimensions: localOllamaDimensions,
                      batchSize: localOllamaBatchSize,
                    }));
                    return;
                  }

                  setEmbeddingDraft((current) => ({
                    ...current,
                    providerKind: "openai-compatible",
                    baseUrl: current.providerKind === "ollama" ? "" : current.baseUrl,
                    modelId: current.providerKind === "ollama" ? "" : current.modelId,
                    dimensions: current.providerKind === "ollama" ? 1536 : current.dimensions,
                    batchSize: current.providerKind === "ollama" ? 32 : current.batchSize,
                  }));
                }}
              >
                <NativeSelectOption value="openai-compatible">OpenAI-compatible</NativeSelectOption>
                <NativeSelectOption value="ollama">本地 Ollama</NativeSelectOption>
              </NativeSelect>
            </div>

            <div className="space-y-2">
              <Label htmlFor="knowledge-embedding-model">模型 ID</Label>
              <Input
                id="knowledge-embedding-model"
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
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="knowledge-embedding-base-url">服务地址</Label>
            <Input
              id="knowledge-embedding-base-url"
              value={embeddingDraft.baseUrl}
              placeholder={isLocalOllamaEmbedding ? localOllamaBaseUrl : "https://api.openai.com/v1"}
              aria-describedby="knowledge-embedding-base-url-help"
              onChange={(event) => {
                const value = event.target.value;
                setEmbeddingDraft((current) => ({
                  ...current,
                  baseUrl: value,
                }));
              }}
            />
            <p id="knowledge-embedding-base-url-help" className="text-xs leading-5 text-muted-foreground">
              {isLocalOllamaEmbedding
                ? "本地 Ollama 默认使用 127.0.0.1:11434；如果服务监听在其他地址或端口，可在这里修改。"
                : "在线或第三方 OpenAI-compatible Embedding 服务可在这里覆盖 Provider 的默认地址。"}
            </p>
          </div>

          {!isLocalOllamaEmbedding && (
            <div className="space-y-2">
              <Label htmlFor="knowledge-embedding-api-key">API Key</Label>
              <Input
                id="knowledge-embedding-api-key"
                type="password"
                value={embeddingDraft.apiKey}
                placeholder="按服务要求填写"
                aria-describedby="knowledge-embedding-api-key-help"
                onChange={(event) => {
                  const value = event.target.value;
                  setEmbeddingDraft((current) => ({
                    ...current,
                    apiKey: value,
                  }));
                }}
              />
              <p id="knowledge-embedding-api-key-help" className="text-xs leading-5 text-muted-foreground">
                如果服务不需要鉴权，可以留空。
              </p>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="knowledge-embedding-dimensions">向量维度</Label>
              <Input
                id="knowledge-embedding-dimensions"
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
            </div>

            <div className="space-y-2">
              <Label htmlFor="knowledge-embedding-batch-size">批量大小</Label>
              <Input
                id="knowledge-embedding-batch-size"
                type="number"
                min={1}
                disabled={isLocalOllamaEmbedding}
                value={embeddingDraft.batchSize}
                aria-describedby="knowledge-embedding-batch-size-help"
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setEmbeddingDraft((current) => ({
                    ...current,
                    batchSize: value,
                  }));
                }}
              />
              <p id="knowledge-embedding-batch-size-help" className="text-xs leading-5 text-muted-foreground">
                {isLocalOllamaEmbedding
                  ? "本地 Ollama 按单条请求生成向量，避免模型一次处理过多文本。"
                  : "批量越大重建越快，但更容易触发第三方服务限流。"}
              </p>
            </div>
          </div>
        </div>
      </ScrollArea>

      <DialogFooter className="shrink-0 border-t border-border/60 bg-surface-raised/85 px-6 py-4">
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSavingEmbedding}>
          取消
        </Button>
        <Button type="button" onClick={onRequestSave} disabled={isSavingEmbedding}>
          {isSavingEmbedding ? (
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
          ) : (
            <Save className="size-4" />
          )}
          <span>保存配置</span>
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
