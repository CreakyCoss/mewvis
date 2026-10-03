import { useEffect, useId, useState } from "react";
import { Download, Loader2, RefreshCw } from "lucide-react";
import type { LlmProviderConfig } from "@/agent-client/runtime-model";
import { discoverProviderModels, type DiscoveredProviderModel } from "@/api/llm";
import { Button } from "design-system/components/ui/button";
import { Checkbox } from "design-system/components/ui/checkbox";
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

type DiscoverModelsDialogProps = {
  provider: LlmProviderConfig;
  onConfirm: (models: DiscoveredProviderModel[]) => void;
  onClose: () => void;
};

export const DiscoverModelsDialog = ({ provider, onConfirm, onClose }: DiscoverModelsDialogProps) => {
  const id = useId();
  const [models, setModels] = useState<DiscoveredProviderModel[]>([]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const { apiFormat, apiEndpoint, apiKey } = provider;

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setError("");
    setModels([]);
    setSelected(new Set());
    void discoverProviderModels({ apiFormat, apiEndpoint, apiKey }, controller.signal)
      .then(({ models: discovered }) => {
        if (!controller.signal.aborted) setModels(discovered);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : String(caught));
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [apiFormat, apiEndpoint, apiKey, attempt]);

  const existing = new Set(provider.models.map((model) => model.modelId.trim()));
  const search = query.trim().toLowerCase();
  const visibleModels = models.filter(
    (model) => model.modelId.toLowerCase().includes(search) || model.modelName.toLowerCase().includes(search),
  );
  const selectedModels = models.filter((model) => selected.has(model.modelId) && !existing.has(model.modelId));
  const existingCount = models.filter((model) => existing.has(model.modelId)).length;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        overlayClassName="z-60 bg-overlay/20 supports-backdrop-filter:backdrop-blur-none"
        className="!flex z-70 max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[640px]"
      >
        <DialogHeader className="shrink-0 border-b border-border/70 px-6 py-5 pr-14">
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
            <Download className="size-5 text-primary" />
            获取模型
          </DialogTitle>
          <DialogDescription className="truncate">{provider.name} · 勾选要添加的模型</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-col px-6 py-5" aria-busy={isLoading}>
          {isLoading ? (
            <div role="status" className="flex min-h-48 items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
              正在获取模型…
            </div>
          ) : error ? (
            <div className="space-y-4 py-6">
              <p
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
              >
                {error}
              </p>
              <Button type="button" variant="outline" onClick={() => setAttempt((current) => current + 1)}>
                <RefreshCw className="size-4" />
                重新获取
              </Button>
            </div>
          ) : models.length === 0 ? (
            <p role="status" className="py-12 text-center text-muted-foreground">
              服务未返回模型，可返回后使用“新增模型”手动添加。
            </p>
          ) : (
            <>
              <div className="mb-4 shrink-0 space-y-3">
                <p role="status" className="text-xs text-muted-foreground">
                  获取到 {models.length} 个模型，其中 {existingCount} 个已添加
                </p>
                <Label htmlFor={`${id}-search`} className="sr-only">
                  搜索模型名称或 ID
                </Label>
                <Input
                  id={`${id}-search`}
                  placeholder="搜索模型名称或 ID"
                  value={query}
                  onChange={(event) => setQuery(event.currentTarget.value)}
                />
              </div>
              <div
                className="min-h-0 max-h-[50dvh] overflow-y-auto rounded-lg border border-border/70"
                aria-label="获取到的模型"
              >
                {visibleModels.map((model, index) => {
                  const isAdded = existing.has(model.modelId);
                  const checkboxId = `${id}-model-${index}`;
                  return (
                    <div
                      key={model.modelId}
                      className="flex min-h-16 items-center gap-3 border-b border-border/60 px-4 py-3 last:border-b-0 hover:bg-muted/20"
                    >
                      <Checkbox
                        id={checkboxId}
                        checked={isAdded || selected.has(model.modelId)}
                        disabled={isAdded}
                        onCheckedChange={(checked) => {
                          setSelected((current) => {
                            const next = new Set(current);
                            if (checked === true) next.add(model.modelId);
                            else next.delete(model.modelId);
                            return next;
                          });
                        }}
                      />
                      <Label htmlFor={checkboxId} className="block min-w-0 flex-1 cursor-pointer font-normal">
                        <span className="block truncate text-sm font-medium" title={model.modelName}>
                          {model.modelName}
                        </span>
                        <span
                          className="mt-1 block truncate font-mono text-xs text-muted-foreground"
                          title={model.modelId}
                        >
                          {model.modelId}
                        </span>
                      </Label>
                      {isAdded && <span className="shrink-0 text-xs text-muted-foreground">已添加</span>}
                    </div>
                  );
                })}
                {visibleModels.length === 0 && (
                  <p role="status" className="px-4 py-8 text-center text-muted-foreground">
                    没有匹配的模型
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <div className="shrink-0 border-t border-border/70 bg-muted/20 px-6 py-4">
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button
              type="button"
              disabled={isLoading || selectedModels.length === 0}
              onClick={() => onConfirm(selectedModels)}
            >
              添加所选（{selectedModels.length}）
            </Button>
          </DialogFooter>
          <p className="mt-3 text-right text-xs text-muted-foreground">添加后需保存 Provider 配置才能生效</p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
