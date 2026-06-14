import type { ContextEngineDescriptor } from "@/ai/agent-context";
import type {
  EmbeddingProfile,
  KnowledgeIndexStatus,
  KnowledgeLibrary,
  KnowledgeSettings,
} from "../types";
import type { KnowledgeBaseView } from "../ui-state";
import { formatTime, statusLabel } from "../ui-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import {
  BrainCircuit,
  ChevronRight,
  FileText,
  Layers3,
  Loader2,
  RefreshCw,
  Settings2,
  Tags,
} from "lucide-react";

type OverviewViewProps = {
  settings: KnowledgeSettings;
  isSavingSettings: boolean;
  isLoading: boolean;
  canConfigureContextEngine: boolean;
  selectedContextEngine: ContextEngineDescriptor | null;
  contextEngineId?: string;
  contextEngines: ContextEngineDescriptor[];
  defaultEmbeddingProfile: EmbeddingProfile | null;
  embeddingSummary: string;
  defaultEmbeddingBaseUrl: string;
  status: KnowledgeIndexStatus;
  isRebuilding: boolean;
  library: KnowledgeLibrary;
  enabledCollectionCount: number;
  onChooseStorageDirectory: () => void;
  onContextEngineChange?: (engineId: string) => void;
  onOpenEmbeddingDialog: () => void;
  onRequestRebuild: () => void;
  onViewChange: (view: KnowledgeBaseView) => void;
};

export const OverviewView = ({
  settings,
  isSavingSettings,
  isLoading,
  canConfigureContextEngine,
  selectedContextEngine,
  contextEngineId,
  contextEngines,
  defaultEmbeddingProfile,
  embeddingSummary,
  defaultEmbeddingBaseUrl,
  status,
  isRebuilding,
  library,
  enabledCollectionCount,
  onChooseStorageDirectory,
  onContextEngineChange,
  onOpenEmbeddingDialog,
  onRequestRebuild,
  onViewChange,
}: OverviewViewProps) => (
  <div className="space-y-4">
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="rounded-md bg-card px-4 py-4 shadow-xs">
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
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Settings2 className="size-4" />
              )}
              <span>{settings.storageDirectory ? "修改目录" : "设置目录"}</span>
            </Button>
          </div>
        </div>
        <div className="mt-3 rounded-md border bg-muted/35 px-3 py-2">
          <div className="break-all font-mono text-xs leading-5 text-muted-foreground">
            {settings.storageDirectory ?? "未选择"}
          </div>
        </div>
      </div>

      {canConfigureContextEngine && (
        <div className="rounded-md bg-card px-4 py-4 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent text-primary shadow-xs">
              <BrainCircuit className="size-4" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-sm font-semibold">上下文引擎</h3>
                {selectedContextEngine?.experimental && (
                  <Badge variant="secondary">实验性</Badge>
                )}
              </div>
              <div className="mt-0.5 truncate text-xs text-muted-foreground">
                {selectedContextEngine?.label ?? "未选择"}
              </div>
            </div>
          </div>
          <NativeSelect
            size="sm"
            className="mt-3 w-full"
            value={contextEngineId ?? selectedContextEngine?.id ?? ""}
            onChange={(event) => {
              const value = event.target.value;
              onContextEngineChange?.(value);
            }}
          >
            {contextEngines.map((engine) => (
              <NativeSelectOption key={engine.id} value={engine.id}>
                {engine.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      )}
    </div>

    <div className="rounded-md bg-card px-4 py-4 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent text-primary shadow-xs">
            <Layers3 className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-semibold">语义检索</h3>
              <Badge variant={defaultEmbeddingProfile ? "outline" : "secondary"}>
                sqlite-vec
              </Badge>
            </div>
            <div className="mt-0.5 truncate text-xs text-muted-foreground">
              {defaultEmbeddingProfile ? "模型与地址已配置" : "未配置 Embedding"}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={onOpenEmbeddingDialog}>
            <Settings2 className="size-4" />
            <span>{defaultEmbeddingProfile ? "修改配置" : "配置模型"}</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onRequestRebuild}
            disabled={isRebuilding || isLoading || library.sources.length === 0}
          >
            {isRebuilding ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            <span>重建索引</span>
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_160px]">
        <div className="rounded-md border bg-muted/25 px-3 py-2">
          <div className="text-xs text-muted-foreground">模型与地址</div>
          <div className="mt-1 truncate text-sm font-medium">{embeddingSummary}</div>
          <div className="mt-1 truncate font-mono text-xs text-muted-foreground">
            {defaultEmbeddingBaseUrl || "未设置"}
          </div>
        </div>
        <div className="rounded-md border bg-muted/25 px-3 py-2">
          <div className="text-xs text-muted-foreground">索引状态</div>
          <div className="mt-1 text-sm font-medium">{statusLabel(status.status)}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {formatTime(status.updatedAt)}
          </div>
        </div>
        <div className="rounded-md border bg-muted/25 px-3 py-2">
          <div className="text-xs text-muted-foreground">向量后端</div>
          <div className="mt-1 text-sm font-medium">sqlite-vec</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {isRebuilding ? "重建中" : "就绪后参与检索"}
          </div>
        </div>
      </div>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-md bg-card px-4 py-3 shadow-xs">
        <div className="text-xs text-muted-foreground">来源</div>
        <div className="mt-2 text-2xl font-semibold">{library.sources.length}</div>
      </div>
      <div className="rounded-md bg-card px-4 py-3 shadow-xs">
        <div className="text-xs text-muted-foreground">启用集合</div>
        <div className="mt-2 text-2xl font-semibold">{enabledCollectionCount}</div>
      </div>
      <div className="rounded-md bg-card px-4 py-3 shadow-xs">
        <div className="text-xs text-muted-foreground">文档</div>
        <div className="mt-2 text-2xl font-semibold">{status.documentCount}</div>
      </div>
      <div className="rounded-md bg-card px-4 py-3 shadow-xs">
        <div className="text-xs text-muted-foreground">片段</div>
        <div className="mt-2 text-2xl font-semibold">{status.chunkCount}</div>
      </div>
    </div>

    <div className="grid gap-4 lg:grid-cols-2">
      <button
        type="button"
        className="group flex min-h-32 items-start justify-between gap-4 rounded-md bg-card p-4 text-left shadow-xs transition-colors hover:bg-accent/35 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        onClick={() => onViewChange("files")}
      >
        <span className="min-w-0">
          <span className="mb-3 flex size-9 items-center justify-center rounded-md bg-accent text-primary shadow-xs">
            <FileText className="size-4" />
          </span>
          <span className="block text-base font-semibold">上传文件</span>
          <span className="mt-1 block text-sm leading-6 text-muted-foreground">
            上传文本文件到知识库目录，并查看、删除已导入来源。
          </span>
          <span className="mt-3 inline-flex text-xs text-muted-foreground">
            {library.sources.length} 个来源
          </span>
        </span>
        <ChevronRight className="mt-1 size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </button>

      <button
        type="button"
        className="group flex min-h-32 items-start justify-between gap-4 rounded-md bg-card p-4 text-left shadow-xs transition-colors hover:bg-accent/35 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        onClick={() => onViewChange("collections")}
      >
        <span className="min-w-0">
          <span className="mb-3 flex size-9 items-center justify-center rounded-md bg-accent text-primary shadow-xs">
            <Tags className="size-4" />
          </span>
          <span className="block text-base font-semibold">集合管理</span>
          <span className="mt-1 block text-sm leading-6 text-muted-foreground">
            创建集合、启用检索范围，并为集合分配已上传文件。
          </span>
          <span className="mt-3 inline-flex text-xs text-muted-foreground">
            {library.collections.length} 个集合，{enabledCollectionCount} 个参与检索
          </span>
        </span>
        <ChevronRight className="mt-1 size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </button>
    </div>
  </div>
);
