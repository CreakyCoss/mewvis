import type { KnowledgeIndexStatus, KnowledgeLibrary, KnowledgeSettings } from "../types";
import type { KnowledgeBaseView } from "../ui-state";
import { formatTime, statusLabel } from "../ui-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronRight, CircleAlert, FileText, Layers3, Loader2, RefreshCw, Settings2, Tags } from "lucide-react";

type OverviewViewProps = {
  settings: KnowledgeSettings;
  isSavingSettings: boolean;
  isLoading: boolean;
  status: KnowledgeIndexStatus;
  isRebuilding: boolean;
  library: KnowledgeLibrary;
  enabledCollectionCount: number;
  validEmbeddingBindingCount: number;
  invalidEmbeddingBindingCount: number;
  boundEmbeddingProfileCount: number;
  onChooseStorageDirectory: () => void;
  onRequestRebuild: () => void;
  onViewChange: (view: KnowledgeBaseView) => void;
};

export const OverviewView = ({
  settings,
  isSavingSettings,
  isLoading,
  status,
  isRebuilding,
  library,
  enabledCollectionCount,
  validEmbeddingBindingCount,
  invalidEmbeddingBindingCount,
  boundEmbeddingProfileCount,
  onChooseStorageDirectory,
  onRequestRebuild,
  onViewChange,
}: OverviewViewProps) => (
  <div className="space-y-4">
    <div className="grid gap-4">
      <div className="app-panel rounded-xl px-5 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-medium text-muted-foreground">当前目录</div>
            <div className="mt-1 text-sm font-medium">
              {settings.storageDirectory ? "知识文件将保存到这里" : "尚未设置知识库目录"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={settings.storageDirectory ? "outline" : "secondary"}>
              {settings.storageDirectory ? "存储就绪" : "需要设置"}
            </Badge>
            <Button
              type="button"
              variant="outline"
              onClick={onChooseStorageDirectory}
              disabled={isSavingSettings || isLoading}
            >
              {isSavingSettings ? (
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
              ) : (
                <Settings2 className="size-4" />
              )}
              <span>{settings.storageDirectory ? "修改目录" : "设置目录"}</span>
            </Button>
          </div>
        </div>
        <div className="mt-4 rounded-lg border bg-muted/35 px-3 py-2.5">
          <div className="break-all font-mono text-xs leading-5 text-muted-foreground">
            {settings.storageDirectory ?? "未选择"}
          </div>
        </div>
      </div>
    </div>

    <div className="app-panel rounded-xl px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
            <Layers3 className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-semibold">语义检索</h3>
              <Badge variant="outline">sqlite-vec</Badge>
            </div>
            <div className="mt-0.5 truncate text-xs text-muted-foreground">
              按已启用知识库的模型绑定生成和维护向量索引
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onRequestRebuild}
            disabled={
              isRebuilding ||
              isLoading ||
              invalidEmbeddingBindingCount > 0 ||
              validEmbeddingBindingCount === 0 ||
              library.sources.length === 0
            }
          >
            {isRebuilding ? (
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            <span>重建索引</span>
          </Button>
        </div>
      </div>

      <div
        className={[
          "mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-3",
          invalidEmbeddingBindingCount > 0 ? "border-destructive/30 bg-destructive/7" : "bg-muted/25",
        ].join(" ")}
        role={invalidEmbeddingBindingCount > 0 ? "alert" : undefined}
      >
        <div className="flex min-w-0 items-start gap-2.5">
          {invalidEmbeddingBindingCount > 0 && <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />}
          <div className="min-w-0">
            <div className="text-sm font-medium">
              {invalidEmbeddingBindingCount > 0
                ? `${invalidEmbeddingBindingCount} 个知识库的向量模型已失效`
                : "每个知识库独立选择向量模型"}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {invalidEmbeddingBindingCount > 0
                ? "进入知识库管理，为失效的知识库手动选择新模型后再重建索引。"
                : "模型配置不会在删除或变更时自动替换知识库已有绑定。"}
            </div>
          </div>
        </div>
        <Badge variant={invalidEmbeddingBindingCount > 0 ? "destructive" : "outline"}>
          {invalidEmbeddingBindingCount > 0 ? "需要处理" : `${validEmbeddingBindingCount} 个绑定可用`}
        </Badge>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border bg-muted/25 px-3 py-2.5">
          <div className="text-xs text-muted-foreground">向量模型</div>
          <div className="mt-1 truncate text-sm font-medium">{boundEmbeddingProfileCount} 个配置参与索引</div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">由各知识库独立绑定</div>
        </div>
        <div className="rounded-lg border bg-muted/25 px-3 py-2.5">
          <div className="text-xs text-muted-foreground">索引状态</div>
          <div className="mt-1 text-sm font-medium">{statusLabel(status.status)}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{formatTime(status.updatedAt)}</div>
        </div>
        <div className="rounded-lg border bg-muted/25 px-3 py-2.5">
          <div className="text-xs text-muted-foreground">检索内容</div>
          <div className="mt-1 text-sm font-medium">
            {status.documentCount} 个文档 · {status.chunkCount} 个片段
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">来自 {enabledCollectionCount} 个已启用知识库</div>
        </div>
      </div>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="app-panel rounded-xl px-4 py-3">
        <div className="text-xs text-muted-foreground">来源</div>
        <div className="mt-2 text-2xl font-semibold">{library.sources.length}</div>
      </div>
      <div className="app-panel rounded-xl px-4 py-3">
        <div className="text-xs text-muted-foreground">启用知识库</div>
        <div className="mt-2 text-2xl font-semibold">{enabledCollectionCount}</div>
      </div>
      <div className="app-panel rounded-xl px-4 py-3">
        <div className="text-xs text-muted-foreground">文档</div>
        <div className="mt-2 text-2xl font-semibold">{status.documentCount}</div>
      </div>
      <div className="app-panel rounded-xl px-4 py-3">
        <div className="text-xs text-muted-foreground">片段</div>
        <div className="mt-2 text-2xl font-semibold">{status.chunkCount}</div>
      </div>
    </div>

    <div className="grid gap-4 lg:grid-cols-2">
      <button
        type="button"
        className="app-interactive-card group flex min-h-36 items-start justify-between gap-4 rounded-2xl p-5 text-left focus-visible:ring-3 focus-visible:ring-ring/25 focus-visible:outline-none"
        onClick={() => onViewChange("files")}
      >
        <span className="min-w-0">
          <span className="mb-4 flex size-10 items-center justify-center rounded-xl bg-accent text-primary">
            <FileText className="size-4" />
          </span>
          <span className="block text-base font-semibold">上传文件</span>
          <span className="mt-1 block text-sm leading-6 text-muted-foreground">
            上传文本文件到知识库目录，并查看、删除已导入来源。
          </span>
          <span className="mt-3 inline-flex text-xs text-muted-foreground">{library.sources.length} 个来源</span>
        </span>
        <ChevronRight className="mt-1 size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </button>

      <button
        type="button"
        className="app-interactive-card group flex min-h-36 items-start justify-between gap-4 rounded-2xl p-5 text-left focus-visible:ring-3 focus-visible:ring-ring/25 focus-visible:outline-none"
        onClick={() => onViewChange("collections")}
      >
        <span className="min-w-0">
          <span className="mb-4 flex size-10 items-center justify-center rounded-xl bg-accent text-primary">
            <Tags className="size-4" />
          </span>
          <span className="block text-base font-semibold">知识库管理</span>
          <span className="mt-1 block text-sm leading-6 text-muted-foreground">
            创建知识库、选择向量模型，并为知识库分配已上传文件。
          </span>
          <span className="mt-3 inline-flex text-xs text-muted-foreground">
            {library.collections.length} 个知识库，{enabledCollectionCount} 个参与检索
          </span>
        </span>
        <ChevronRight className="mt-1 size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </button>
    </div>
  </div>
);
