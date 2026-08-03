import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { CircleAlert, Plus, Trash2 } from "lucide-react";
import type { EmbeddingProfile } from "@/features/embedding/types";
import type { KnowledgeCollection } from "../types";

type CollectionsViewProps = {
  collections: KnowledgeCollection[];
  activeCollectionId: string | null;
  enabledCollectionCount: number;
  embeddingProfiles: EmbeddingProfile[];
  onStartNewCollection: () => void;
  onOpenCollectionDetails: (collection: KnowledgeCollection) => void;
  onToggleCollectionEnabled: (collection: KnowledgeCollection, enabled: boolean) => void;
  onRequestRemoveCollection: (collection: KnowledgeCollection) => void;
};

export const CollectionsView = ({
  collections,
  activeCollectionId,
  enabledCollectionCount,
  embeddingProfiles,
  onStartNewCollection,
  onOpenCollectionDetails,
  onToggleCollectionEnabled,
  onRequestRemoveCollection,
}: CollectionsViewProps) => (
  <div className="space-y-4">
    <div className="app-panel flex flex-wrap items-center justify-between gap-3 rounded-xl px-5 py-4">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold">知识库</h3>
        <p className="mt-1 text-sm text-muted-foreground">每个知识库独立选择向量模型，并管理自己的资料来源。</p>
      </div>
      <Button type="button" variant="outline" onClick={onStartNewCollection}>
        <Plus className="size-4" />
        <span>新建知识库</span>
      </Button>
    </div>

    <section className="app-panel rounded-xl p-4">
      <div className="mb-3 text-xs text-muted-foreground">
        {collections.length} 个知识库，{enabledCollectionCount} 个参与检索
      </div>
      <div className="space-y-2">
        {collections.length ? (
          collections.map((collection) => {
            const profile = embeddingProfiles.find((item) => item.id === collection.embeddingProfileId) ?? null;
            const hasInvalidProfile = Boolean(collection.embeddingProfileId) && !profile;

            return (
              <article
                key={collection.id}
                className={[
                  "app-interactive-card flex min-w-0 items-start justify-between gap-3 rounded-xl px-4 py-3",
                  collection.id === activeCollectionId ? "border-primary/30 bg-primary/5" : "",
                ].join(" ")}
              >
                <button
                  type="button"
                  className="min-h-11 min-w-0 flex-1 text-left focus-visible:rounded-lg focus-visible:ring-3 focus-visible:ring-ring/25 focus-visible:outline-none"
                  onClick={() => onOpenCollectionDetails(collection)}
                >
                  <div className="truncate text-sm font-medium">{collection.name}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{collection.sourceIds.length} 个来源</span>
                    <Badge variant={collection.enabled ? "outline" : "secondary"}>
                      {collection.enabled ? "参与检索" : "不检索"}
                    </Badge>
                    {profile ? (
                      <Badge variant="secondary">
                        {profile.name} · {profile.modelId}
                      </Badge>
                    ) : (
                      <Badge variant="destructive">
                        <CircleAlert />
                        {hasInvalidProfile ? "模型失效" : "未选择模型"}
                      </Badge>
                    )}
                  </div>
                </button>
                <div className="flex shrink-0 items-center pt-1" onClick={(event) => event.stopPropagation()}>
                  <Switch
                    size="sm"
                    checked={collection.enabled}
                    title={collection.enabled ? "停用知识库检索" : "启用知识库检索"}
                    aria-label={`${collection.name}${collection.enabled ? "停用知识库检索" : "启用知识库检索"}`}
                    onCheckedChange={(checked) => onToggleCollectionEnabled(collection, checked)}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title="删除知识库"
                  aria-label="删除知识库"
                  onClick={() => onRequestRemoveCollection(collection)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </article>
            );
          })
        ) : (
          <div className="app-empty-state flex min-h-[320px] items-center justify-center rounded-2xl px-6 text-sm text-muted-foreground">
            暂无知识库
          </div>
        )}
      </div>
    </section>
  </div>
);
