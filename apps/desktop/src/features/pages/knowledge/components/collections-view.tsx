import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2 } from "lucide-react";
import type { KnowledgeCollection } from "../types";

type CollectionsViewProps = {
  collections: KnowledgeCollection[];
  activeCollectionId: string | null;
  enabledCollectionCount: number;
  onStartNewCollection: () => void;
  onOpenCollectionDetails: (collection: KnowledgeCollection) => void;
  onToggleCollectionEnabled: (collection: KnowledgeCollection, enabled: boolean) => void;
  onRequestRemoveCollection: (collection: KnowledgeCollection) => void;
};

export const CollectionsView = ({
  collections,
  activeCollectionId,
  enabledCollectionCount,
  onStartNewCollection,
  onOpenCollectionDetails,
  onToggleCollectionEnabled,
  onRequestRemoveCollection,
}: CollectionsViewProps) => (
  <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-card px-4 py-4 shadow-xs">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold">集合</h3>
        <p className="mt-1 text-sm text-muted-foreground">启用的集合会参与知识检索，集合详情中可分配来源。</p>
      </div>
      <Button type="button" variant="outline" onClick={onStartNewCollection}>
        <Plus className="size-4" />
        <span>新建集合</span>
      </Button>
    </div>

    <section className="rounded-md bg-background p-4 shadow-xs">
      <div className="mb-3 text-xs text-muted-foreground">
        {collections.length} 个集合，{enabledCollectionCount} 个参与检索
      </div>
      <div className="space-y-2">
        {collections.length ? (
          collections.map((collection) => (
            <article
              key={collection.id}
              className={[
                "flex min-w-0 items-start justify-between gap-3 rounded-md px-3 py-3 shadow-xs transition-colors",
                collection.id === activeCollectionId ? "bg-primary/10" : "bg-card",
              ].join(" ")}
            >
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => onOpenCollectionDetails(collection)}
              >
                <div className="truncate text-sm font-medium">{collection.name}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{collection.sourceIds.length} 个来源</span>
                  <Badge variant={collection.enabled ? "outline" : "secondary"}>
                    {collection.enabled ? "参与检索" : "不检索"}
                  </Badge>
                </div>
              </button>
              <div className="flex shrink-0 items-center pt-1" onClick={(event) => event.stopPropagation()}>
                <Switch
                  size="sm"
                  checked={collection.enabled}
                  title={collection.enabled ? "停用集合检索" : "启用集合检索"}
                  aria-label={`${collection.name}${collection.enabled ? "停用集合检索" : "启用集合检索"}`}
                  onCheckedChange={(checked) => onToggleCollectionEnabled(collection, checked)}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                title="删除集合"
                aria-label="删除集合"
                onClick={() => onRequestRemoveCollection(collection)}
              >
                <Trash2 className="size-4" />
              </Button>
            </article>
          ))
        ) : (
          <div className="flex min-h-[320px] items-center justify-center rounded-md bg-muted/25 text-sm text-muted-foreground">
            暂无集合
          </div>
        )}
      </div>
    </section>
  </div>
);
