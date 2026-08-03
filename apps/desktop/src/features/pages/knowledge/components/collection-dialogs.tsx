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
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { CircleAlert, Loader2, Save } from "lucide-react";
import type { EmbeddingProfile } from "@/features/embedding/types";
import type { KnowledgeCollection, KnowledgeSettings, KnowledgeSource } from "../types";
import { relativeKnowledgePath, type CollectionDraft } from "../ui-state";

type CollectionDetailsDialogProps = {
  open: boolean;
  activeCollection: KnowledgeCollection | null;
  activeCollectionSources: KnowledgeSource[];
  sources: KnowledgeSource[];
  settings: KnowledgeSettings;
  embeddingProfiles: EmbeddingProfile[];
  collectionSourceIds: Set<string>;
  isSavingMembership: boolean;
  isSavingEmbeddingProfile: boolean;
  onOpenChange: (open: boolean) => void;
  onToggleCollectionSource: (sourceId: string, checked: boolean | "indeterminate") => void;
  onEmbeddingProfileChange: (profileId: string) => void;
  onSaveCollectionSources: () => void;
};

export const CollectionDetailsDialog = ({
  open,
  activeCollection,
  activeCollectionSources,
  sources,
  settings,
  embeddingProfiles,
  collectionSourceIds,
  isSavingMembership,
  isSavingEmbeddingProfile,
  onOpenChange,
  onToggleCollectionSource,
  onEmbeddingProfileChange,
  onSaveCollectionSources,
}: CollectionDetailsDialogProps) => {
  const activeEmbeddingProfile =
    embeddingProfiles.find((profile) => profile.id === activeCollection?.embeddingProfileId) ?? null;
  const hasInvalidEmbeddingProfile = Boolean(activeCollection?.embeddingProfileId) && !activeEmbeddingProfile;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!flex h-[min(720px,calc(100vh-2rem))] max-h-[calc(100vh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border/60 bg-surface-raised/85 px-6 py-5 pr-14 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>{activeCollection?.name ?? "知识库详情"}</DialogTitle>
            {activeCollection && (
              <Badge variant={activeCollection.enabled ? "outline" : "secondary"}>
                {activeCollection.enabled ? "已启用检索" : "未参与检索"}
              </Badge>
            )}
            <Badge variant="secondary">{collectionSourceIds.size} 个来源</Badge>
          </div>
          <DialogDescription>选择这个知识库使用的向量模型，并管理它包含的文件。</DialogDescription>
        </DialogHeader>
        <div className="app-canvas flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-6 py-5">
          {activeCollection?.description && (
            <div className="app-panel rounded-xl px-4 py-3 text-sm leading-6 text-muted-foreground">
              {activeCollection.description}
            </div>
          )}
          <div
            className={[
              "rounded-xl border px-4 py-3",
              hasInvalidEmbeddingProfile ? "border-destructive/30 bg-destructive/7" : "bg-muted/25",
            ].join(" ")}
            role={hasInvalidEmbeddingProfile ? "alert" : undefined}
          >
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <Label htmlFor="knowledge-collection-embedding-profile">向量模型</Label>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">
                  {hasInvalidEmbeddingProfile
                    ? "原绑定配置已被删除。请选择新模型，系统不会自动替换。"
                    : "仅影响当前知识库；切换后需要重建索引。"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {hasInvalidEmbeddingProfile && <CircleAlert className="size-4 shrink-0 text-destructive" />}
                {isSavingEmbeddingProfile && (
                  <Loader2 className="size-4 animate-spin text-muted-foreground motion-reduce:animate-none" />
                )}
                <NativeSelect
                  id="knowledge-collection-embedding-profile"
                  className="w-72 max-w-full"
                  value={activeEmbeddingProfile?.id ?? ""}
                  aria-invalid={hasInvalidEmbeddingProfile || !activeCollection?.embeddingProfileId}
                  disabled={isSavingEmbeddingProfile || embeddingProfiles.length === 0}
                  onChange={(event) => onEmbeddingProfileChange(event.currentTarget.value)}
                >
                  <NativeSelectOption value="" disabled>
                    {hasInvalidEmbeddingProfile
                      ? "模型失效，请重新选择"
                      : embeddingProfiles.length === 0
                        ? "没有可用的 Embedding 配置"
                        : "请选择向量模型"}
                  </NativeSelectOption>
                  {embeddingProfiles.map((profile) => (
                    <NativeSelectOption key={profile.id} value={profile.id}>
                      {profile.name} · {profile.modelId}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="text-sm font-medium">知识库来源</div>
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
};

type CollectionFormDialogProps = {
  open: boolean;
  collectionDraft: CollectionDraft;
  embeddingProfiles: EmbeddingProfile[];
  isSavingCollection: boolean;
  setCollectionDraft: Dispatch<SetStateAction<CollectionDraft>>;
  onOpenChange: (open: boolean) => void;
  onSaveCollection: () => void;
};

export const CollectionFormDialog = ({
  open,
  collectionDraft,
  embeddingProfiles,
  isSavingCollection,
  setCollectionDraft,
  onOpenChange,
  onSaveCollection,
}: CollectionFormDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="!flex max-h-[calc(100vh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
      <DialogHeader className="border-b border-border/60 bg-surface-raised/85 px-6 py-5 pr-14 text-left">
        <DialogTitle>新建知识库</DialogTitle>
        <DialogDescription>选择向量模型；创建后可以为它分配已上传文件。</DialogDescription>
      </DialogHeader>
      <div className="app-canvas min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
        <div>
          <Label htmlFor="knowledge-collection-name">知识库名称</Label>
          <Input
            id="knowledge-collection-name"
            className="mt-2"
            value={collectionDraft.name}
            placeholder="知识库名称"
            onChange={(event) =>
              setCollectionDraft((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
          />
        </div>
        <div>
          <Label htmlFor="knowledge-collection-description">描述</Label>
          <Textarea
            id="knowledge-collection-description"
            className="mt-2 min-h-24 resize-none"
            value={collectionDraft.description}
            placeholder="知识库描述"
            onChange={(event) =>
              setCollectionDraft((current) => ({
                ...current,
                description: event.target.value,
              }))
            }
          />
        </div>
        <div>
          <Label htmlFor="knowledge-collection-create-embedding-profile">向量模型</Label>
          <NativeSelect
            id="knowledge-collection-create-embedding-profile"
            className="mt-2 w-full"
            value={collectionDraft.embeddingProfileId}
            aria-invalid={!collectionDraft.embeddingProfileId}
            disabled={embeddingProfiles.length === 0}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setCollectionDraft((current) => ({ ...current, embeddingProfileId: value }));
            }}
          >
            <NativeSelectOption value="" disabled>
              {embeddingProfiles.length === 0 ? "请先在设置中添加 Embedding 配置" : "请选择向量模型"}
            </NativeSelectOption>
            {embeddingProfiles.map((profile) => (
              <NativeSelectOption key={profile.id} value={profile.id}>
                {profile.name} · {profile.modelId}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">创建后仍可单独切换，不影响其他知识库。</p>
        </div>
      </div>
      <DialogFooter className="border-t border-border/60 bg-surface-raised/85 px-6 py-4">
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSavingCollection}>
          取消
        </Button>
        <Button
          type="button"
          onClick={onSaveCollection}
          disabled={isSavingCollection || !collectionDraft.embeddingProfileId}
        >
          {isSavingCollection ? (
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
          ) : (
            <Save className="size-4" />
          )}
          <span>创建知识库</span>
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
