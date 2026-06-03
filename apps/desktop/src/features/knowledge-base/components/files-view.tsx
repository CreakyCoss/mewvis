import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Loader2, Trash2, Upload } from "lucide-react";
import type { KnowledgeSettings, KnowledgeSource } from "../types";
import { relativeKnowledgePath, sourceKindLabel } from "../ui-state";

type FilesViewProps = {
  settings: KnowledgeSettings;
  sources: KnowledgeSource[];
  isAdding: boolean;
  isLoading: boolean;
  enabledCollectionNamesBySourceId: Map<string, string[]>;
  onAddTextFiles: () => void;
  onRequestRemoveSource: (source: KnowledgeSource) => void;
};

export const FilesView = ({
  settings,
  sources,
  isAdding,
  isLoading,
  enabledCollectionNamesBySourceId,
  onAddTextFiles,
  onRequestRemoveSource,
}: FilesViewProps) => (
  <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-card px-4 py-4 shadow-xs">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold">上传文本文件</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          文件会导入到一级页设置的知识库目录中。
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={settings.storageDirectory ? "outline" : "secondary"}>
          {settings.storageDirectory ? "目录已设置" : "目录未设置"}
        </Badge>
        <Button
          type="button"
          onClick={onAddTextFiles}
          disabled={isAdding || isLoading}
        >
          {isAdding ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Upload className="size-4" />
          )}
          <span>上传文本文件</span>
        </Button>
      </div>
    </div>

    <section className="rounded-md bg-background p-4 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">已上传文件</h3>
        <span className="text-xs text-muted-foreground">
          {sources.length} 个
        </span>
      </div>

      <div className="mt-3 space-y-3">
        {sources.length ? (
          sources.map((source) => {
            const blockingCollectionNames =
              enabledCollectionNamesBySourceId.get(source.id) ?? [];
            const isDeleteBlocked = blockingCollectionNames.length > 0;
            return (
              <article
                key={source.id}
                className="flex min-w-0 items-start justify-between gap-3 rounded-md bg-card px-4 py-3 shadow-xs"
              >
                <div className="flex min-w-0 gap-3">
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <FileText className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{source.title}</div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">
                      {relativeKnowledgePath(source.uri, settings.storageDirectory)}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary">
                        {sourceKindLabel(source.kind)}
                      </Badge>
                      {isDeleteBlocked && (
                        <Badge variant="outline">
                          已被集合使用
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title={isDeleteBlocked
                    ? `先从启用集合中移除：${blockingCollectionNames.join("、")}`
                    : "删除来源"}
                  aria-label="删除来源"
                  disabled={isDeleteBlocked}
                  onClick={() => onRequestRemoveSource(source)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </article>
            );
          })
        ) : (
          <div className="flex min-h-[320px] items-center justify-center rounded-md bg-muted/25 text-sm text-muted-foreground">
            暂无文件，先设置目录并上传文本文件
          </div>
        )}
      </div>
    </section>
  </div>
);
