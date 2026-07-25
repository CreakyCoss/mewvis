import type { Dispatch, SetStateAction } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save } from "lucide-react";
import type { KnowledgeCollection, KnowledgeSettings, KnowledgeSource } from "../types";
import { relativeKnowledgePath, type CollectionDraft } from "../ui-state";

type CollectionDetailsDialogProps = {
  open: boolean;
  activeCollection: KnowledgeCollection | null;
  activeCollectionSources: KnowledgeSource[];
  sources: KnowledgeSource[];
  settings: KnowledgeSettings;
  collectionSourceIds: Set<string>;
  isSavingMembership: boolean;
  onOpenChange: (open: boolean) => void;
  onToggleCollectionSource: (sourceId: string, checked: boolean | "indeterminate") => void;
  onSaveCollectionSources: () => void;
};

export const CollectionDetailsDialog = ({
  open,
  activeCollection,
  activeCollectionSources,
  sources,
  settings,
  collectionSourceIds,
  isSavingMembership,
  onOpenChange,
  onToggleCollectionSource,
  onSaveCollectionSources,
}: CollectionDetailsDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="!flex h-[min(720px,calc(100vh-2rem))] max-h-[calc(100vh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
      <DialogHeader className="border-b border-border/60 bg-surface-raised/85 px-6 py-5 pr-14 text-left">
        <div className="flex flex-wrap items-center gap-2">
          <DialogTitle>{activeCollection?.name ?? "集合详情"}</DialogTitle>
          {activeCollection && (
            <Badge variant={activeCollection.enabled ? "outline" : "secondary"}>
              {activeCollection.enabled ? "已启用检索" : "未参与检索"}
            </Badge>
          )}
          <Badge variant="secondary">{collectionSourceIds.size} 个来源</Badge>
        </div>
        <DialogDescription>勾选这个集合包含的文件，保存后启用集合即可参与知识检索。</DialogDescription>
      </DialogHeader>
      <div className="app-canvas flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-6 py-5">
        {activeCollection?.description && (
          <div className="app-panel rounded-xl px-4 py-3 text-sm leading-6 text-muted-foreground">
            {activeCollection.description}
          </div>
        )}
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="text-sm font-medium">集合来源</div>
            <span className="text-xs text-muted-foreground">已保存 {activeCollectionSources.length} 个</span>
          </div>
          <ScrollArea className="min-h-0 flex-1 overflow-hidden">
            <div className="space-y-2 pr-3">
              {sources.length ? (
                sources.map((source) => (
                  <label
                    key={source.id}
                    className="app-interactive-card flex min-h-14 min-w-0 cursor-pointer items-start gap-3 rounded-xl px-3.5 py-3"
                  >
                    <Checkbox
                      className="mt-0.5"
                      checked={collectionSourceIds.has(source.id)}
                      onCheckedChange={(checked) => onToggleCollectionSource(source.id, checked)}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{source.title}</span>
                      <span className="mt-1 block truncate text-xs text-muted-foreground">
                        {relativeKnowledgePath(source.uri, settings.storageDirectory)}
                      </span>
                    </span>
                  </label>
                ))
              ) : (
                <div className="app-empty-state flex min-h-40 items-center justify-center rounded-xl px-5 text-sm text-muted-foreground">
                  先上传文本文件
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
      <DialogFooter className="border-t border-border/60 bg-surface-raised/85 px-6 py-4">
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSavingMembership}>
          取消
        </Button>
        <Button type="button" onClick={onSaveCollectionSources} disabled={!activeCollection || isSavingMembership}>
          {isSavingMembership ? (
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
          ) : (
            <Save className="size-4" />
          )}
          <span>保存来源</span>
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

type CollectionFormDialogProps = {
  open: boolean;
  collectionDraft: CollectionDraft;
  isSavingCollection: boolean;
  setCollectionDraft: Dispatch<SetStateAction<CollectionDraft>>;
  onOpenChange: (open: boolean) => void;
  onSaveCollection: () => void;
};

export const CollectionFormDialog = ({
  open,
  collectionDraft,
  isSavingCollection,
  setCollectionDraft,
  onOpenChange,
  onSaveCollection,
}: CollectionFormDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="!flex max-h-[calc(100vh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
      <DialogHeader className="border-b border-border/60 bg-surface-raised/85 px-6 py-5 pr-14 text-left">
        <DialogTitle>新建集合</DialogTitle>
        <DialogDescription>创建后可在右侧为它分配已上传文件。</DialogDescription>
      </DialogHeader>
      <div className="app-canvas min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
        <div>
          <Input
            id="knowledge-collection-name"
            value={collectionDraft.name}
            placeholder="集合名称"
            onChange={(event) =>
              setCollectionDraft((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
          />
        </div>
        <div>
          <Textarea
            id="knowledge-collection-description"
            value={collectionDraft.description}
            placeholder="集合描述"
            className="min-h-24 resize-none"
            onChange={(event) =>
              setCollectionDraft((current) => ({
                ...current,
                description: event.target.value,
              }))
            }
          />
        </div>
      </div>
      <DialogFooter className="border-t border-border/60 bg-surface-raised/85 px-6 py-4">
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSavingCollection}>
          取消
        </Button>
        <Button type="button" onClick={onSaveCollection} disabled={isSavingCollection}>
          {isSavingCollection ? (
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
          ) : (
            <Save className="size-4" />
          )}
          <span>创建集合</span>
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
