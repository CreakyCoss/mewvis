import { open } from "@tauri-apps/plugin-dialog";
import { ArrowLeft, Database, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { listEmbeddingProfiles } from "@/api/embedding";
import {
  deleteKnowledgeCollection,
  deleteKnowledgeSource,
  getKnowledgeIndexStatus,
  getKnowledgeSettings,
  importKnowledgeFiles,
  listKnowledgeLibrary,
  rebuildKnowledgeIndex,
  saveKnowledgeCollection,
  saveKnowledgeSettings,
  setKnowledgeCollectionEmbeddingProfile,
  setKnowledgeCollectionSources,
} from "@/api/knowledge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { EmbeddingProfile } from "@/features/embedding/types";
import { CollectionDetailsDialog, CollectionFormDialog } from "./collection-dialogs";
import { CollectionsView } from "./collections-view";
import { DeleteConfirmDialog, RebuildIndexConfirmDialog } from "./confirm-dialogs";
import { FilesView } from "./files-view";
import { OverviewView } from "./overview-view";
import type {
  KnowledgeCollection,
  KnowledgeIndexStatus,
  KnowledgeLibrary,
  KnowledgeSettings,
  KnowledgeSource,
} from "../types";
import {
  emptyCollectionDraft,
  emptyLibrary,
  emptySettings,
  missingStatus,
  supportedTextExtensions,
  type KnowledgeBaseView,
  type PendingDeleteTarget,
} from "../ui-state";

type KnowledgeBasePageProps = {
  onBack?: () => void;
};

export const KnowledgeBasePage = ({ onBack }: KnowledgeBasePageProps) => {
  const [library, setLibrary] = useState<KnowledgeLibrary>(emptyLibrary);
  const [settings, setSettings] = useState<KnowledgeSettings>(emptySettings);
  const [embeddingProfiles, setEmbeddingProfiles] = useState<EmbeddingProfile[]>([]);
  const [status, setStatus] = useState<KnowledgeIndexStatus>(missingStatus);
  const [isLoading, setIsLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isSelectingEmbedding, setIsSelectingEmbedding] = useState(false);
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const [isCollectionDialogOpen, setIsCollectionDialogOpen] = useState(false);
  const [isCollectionDetailsDialogOpen, setIsCollectionDetailsDialogOpen] = useState(false);
  const [collectionDraft, setCollectionDraft] = useState(emptyCollectionDraft);
  const [collectionSourceIds, setCollectionSourceIds] = useState<Set<string>>(new Set());
  const [isSavingCollection, setIsSavingCollection] = useState(false);
  const [isSavingMembership, setIsSavingMembership] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDeleteTarget | null>(null);
  const [isRebuildConfirmOpen, setIsRebuildConfirmOpen] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<KnowledgeBaseView>("overview");

  const enabledCollectionCount = useMemo(
    () => library.collections.filter((collection) => collection.enabled).length,
    [library.collections],
  );
  const activeCollection = useMemo(
    () => library.collections.find((collection) => collection.id === activeCollectionId) ?? null,
    [activeCollectionId, library.collections],
  );
  const activeCollectionSources = useMemo(
    () => (activeCollection ? library.sources.filter((source) => activeCollection.sourceIds.includes(source.id)) : []),
    [activeCollection, library.sources],
  );
  const embeddingProfilesById = useMemo(
    () => new Map(embeddingProfiles.map((profile) => [profile.id, profile])),
    [embeddingProfiles],
  );
  const validEnabledCollections = useMemo(
    () =>
      library.collections.filter(
        (collection) =>
          collection.enabled &&
          Boolean(collection.embeddingProfileId) &&
          embeddingProfilesById.has(collection.embeddingProfileId ?? ""),
      ),
    [embeddingProfilesById, library.collections],
  );
  const invalidEnabledCollections = useMemo(
    () =>
      library.collections.filter(
        (collection) =>
          collection.enabled &&
          (!collection.embeddingProfileId || !embeddingProfilesById.has(collection.embeddingProfileId)),
      ),
    [embeddingProfilesById, library.collections],
  );
  const boundEmbeddingProfileCount = useMemo(
    () => new Set(validEnabledCollections.map((collection) => collection.embeddingProfileId)).size,
    [validEnabledCollections],
  );
  const enabledCollectionNamesBySourceId = useMemo(() => {
    const namesBySourceId = new Map<string, string[]>();
    for (const collection of library.collections) {
      if (!collection.enabled) {
        continue;
      }

      for (const sourceId of collection.sourceIds) {
        const names = namesBySourceId.get(sourceId) ?? [];
        names.push(collection.name);
        namesBySourceId.set(sourceId, names);
      }
    }

    return namesBySourceId;
  }, [library.collections]);
  const viewTitle = (
    {
      overview: "知识库",
      files: "上传文件",
      collections: "知识库管理",
    } as const
  )[view];
  const viewDescription = (
    {
      overview: "管理多个知识库、资料来源，以及各自使用的向量模型。",
      files: "设置知识库目录，上传文本文件并维护已导入来源。",
      collections: "创建知识库，选择向量模型，并分配已上传文件。",
    } as const
  )[view];

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const [nextLibrary, nextStatus, nextSettings, nextEmbeddingProfiles] = await Promise.all([
        listKnowledgeLibrary(),
        getKnowledgeIndexStatus(),
        getKnowledgeSettings(),
        listEmbeddingProfiles(),
      ]);
      setLibrary(nextLibrary);
      setStatus(nextStatus);
      setSettings(nextSettings);
      setEmbeddingProfiles(nextEmbeddingProfiles);
    } catch (caught) {
      setError(String(caught));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeCollection) {
      setCollectionSourceIds(new Set(activeCollection.sourceIds));
      return;
    }

    setCollectionSourceIds(new Set());
  }, [activeCollection]);

  useEffect(() => {
    void load();
  }, [load]);

  const applySavedLibrary = (nextLibrary: KnowledgeLibrary) => {
    setLibrary(nextLibrary);
    if (activeCollectionId && !nextLibrary.collections.some((collection) => collection.id === activeCollectionId)) {
      setActiveCollectionId(null);
    }
  };

  const openCollectionDetails = (collection: KnowledgeCollection) => {
    setActiveCollectionId(collection.id);
    setCollectionSourceIds(new Set(collection.sourceIds));
    setIsCollectionDetailsDialogOpen(true);
  };

  const handleCollectionDetailsOpenChange = (open: boolean) => {
    setIsCollectionDetailsDialogOpen(open);
    if (!open && activeCollection) {
      setCollectionSourceIds(new Set(activeCollection.sourceIds));
    }
  };

  const chooseStorageDirectory = async () => {
    setIsSavingSettings(true);
    setError("");
    try {
      const selected = await open({
        multiple: false,
        directory: true,
        title: "选择知识库目录",
      });
      const path = typeof selected === "string" ? selected : null;
      if (!path) {
        return;
      }

      setSettings(await saveKnowledgeSettings({ storageDirectory: path }));
    } catch (caught) {
      setError(String(caught));
    } finally {
      setIsSavingSettings(false);
    }
  };

  const addTextFiles = async () => {
    if (!settings.storageDirectory) {
      setError("请先设置知识库目录，再上传文本文件");
      return;
    }

    setIsAdding(true);
    setError("");
    try {
      const selected = await open({
        multiple: true,
        directory: false,
        title: "选择要加入知识库的文本文件",
        filters: [
          {
            name: "文本文件",
            extensions: supportedTextExtensions,
          },
        ],
      });
      const paths = Array.isArray(selected)
        ? selected.filter((item): item is string => typeof item === "string")
        : typeof selected === "string"
          ? [selected]
          : [];

      if (paths.length > 0) {
        applySavedLibrary(await importKnowledgeFiles(paths));
        setStatus(await getKnowledgeIndexStatus());
      }
    } catch (caught) {
      setError(String(caught));
    } finally {
      setIsAdding(false);
    }
  };

  const removeSource = async (source: KnowledgeSource) => {
    setError("");
    try {
      applySavedLibrary(await deleteKnowledgeSource(source.id));
      setStatus(await getKnowledgeIndexStatus());
    } catch (caught) {
      setError(String(caught));
    }
  };

  const requestRemoveSource = (source: KnowledgeSource) => {
    const blockingCollectionNames = enabledCollectionNamesBySourceId.get(source.id) ?? [];
    if (blockingCollectionNames.length > 0) {
      setError(`文件已被启用知识库使用，请先从知识库中移除：${blockingCollectionNames.join("、")}`);
      return;
    }

    setPendingDelete({ kind: "source", source });
  };

  const rebuild = async () => {
    setIsRebuilding(true);
    setError("");
    try {
      const result = await rebuildKnowledgeIndex();
      setStatus(result.status);
      applySavedLibrary(await listKnowledgeLibrary());
    } catch (caught) {
      setError(String(caught));
    } finally {
      setIsRebuilding(false);
    }
  };

  const requestRebuild = () => {
    setIsRebuildConfirmOpen(true);
  };

  const selectEmbeddingProfile = async (collectionId: string, profileId: string) => {
    const collection = library.collections.find((item) => item.id === collectionId);
    if (!profileId || profileId === collection?.embeddingProfileId) return;
    setIsSelectingEmbedding(true);
    setError("");
    try {
      applySavedLibrary(await setKnowledgeCollectionEmbeddingProfile(collectionId, profileId));
      setStatus(await getKnowledgeIndexStatus());
    } catch (caught) {
      setError(String(caught));
    } finally {
      setIsSelectingEmbedding(false);
    }
  };

  const confirmRebuild = async () => {
    setIsRebuildConfirmOpen(false);
    await rebuild();
  };

  const startNewCollection = () => {
    setCollectionDraft({
      ...emptyCollectionDraft(),
      embeddingProfileId: embeddingProfiles[0]?.id ?? "",
    });
    setIsCollectionDialogOpen(true);
  };

  const saveCollection = async () => {
    const name = collectionDraft.name.trim();
    if (!name) {
      setError("知识库名称不能为空");
      return;
    }
    if (!collectionDraft.embeddingProfileId) {
      setError("请先在设置中添加 Embedding 配置，并为知识库选择向量模型");
      return;
    }

    setIsSavingCollection(true);
    setError("");
    try {
      const nextLibrary = await saveKnowledgeCollection({
        id: collectionDraft.id,
        name,
        description: collectionDraft.description,
        color: null,
        order: collectionDraft.id ? (activeCollection?.order ?? 0) : library.collections.length,
        enabled: true,
        embeddingProfileId: collectionDraft.embeddingProfileId,
      });
      applySavedLibrary(nextLibrary);

      const nextActive = collectionDraft.id
        ? nextLibrary.collections.find((collection) => collection.id === collectionDraft.id)
        : [...nextLibrary.collections]
            .filter((collection) => collection.name === name)
            .sort((left, right) => right.updatedAt - left.updatedAt)[0];
      if (nextActive) {
        openCollectionDetails(nextActive);
      }
      setIsCollectionDialogOpen(false);
    } catch (caught) {
      setError(String(caught));
    } finally {
      setIsSavingCollection(false);
    }
  };

  const removeCollection = async (collection: KnowledgeCollection) => {
    setError("");
    try {
      if (collection.id === activeCollectionId) {
        setActiveCollectionId(null);
        setIsCollectionDetailsDialogOpen(false);
      }
      applySavedLibrary(await deleteKnowledgeCollection(collection.id));
    } catch (caught) {
      setError(String(caught));
    }
  };

  const confirmPendingDelete = async () => {
    if (!pendingDelete) {
      return;
    }

    setIsDeleting(true);
    try {
      if (pendingDelete.kind === "source") {
        await removeSource(pendingDelete.source);
      } else {
        await removeCollection(pendingDelete.collection);
      }
      setPendingDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleCollectionEnabled = async (collection: KnowledgeCollection, enabled: boolean) => {
    setError("");
    try {
      applySavedLibrary(
        await saveKnowledgeCollection({
          id: collection.id,
          name: collection.name,
          description: collection.description,
          color: collection.color,
          order: collection.order,
          enabled,
          embeddingProfileId: collection.embeddingProfileId,
        }),
      );
    } catch (caught) {
      setError(String(caught));
    }
  };

  const toggleCollectionSource = (sourceId: string, checked: boolean | "indeterminate") => {
    setCollectionSourceIds((current) => {
      const next = new Set(current);
      if (checked === true) {
        next.add(sourceId);
      } else {
        next.delete(sourceId);
      }
      return next;
    });
  };

  const saveCollectionSources = async () => {
    if (!activeCollectionId) {
      setError("请先保存或选择一个知识库");
      return;
    }

    setIsSavingMembership(true);
    setError("");
    try {
      applySavedLibrary(await setKnowledgeCollectionSources(activeCollectionId, [...collectionSourceIds]));
      setIsCollectionDetailsDialogOpen(false);
    } catch (caught) {
      setError(String(caught));
    } finally {
      setIsSavingMembership(false);
    }
  };

  return (
    <section className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <header className="app-page-header flex min-h-16 items-center justify-between px-6 py-4">
        <div className="flex min-w-0 items-center gap-3">
          {view !== "overview" && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="rounded-xl"
              title="返回知识库"
              aria-label="返回知识库"
              onClick={() => setView("overview")}
            >
              <ArrowLeft className="size-5" />
            </Button>
          )}
          <div className="min-w-0">
            <h2 className="flex items-center gap-3 text-xl font-semibold tracking-[-0.02em]">
              <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-primary">
                <Database className="size-5" />
              </span>
              <span>{viewTitle}</span>
            </h2>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">{viewDescription}</p>
          </div>
        </div>
        {onBack && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="rounded-xl"
            title={view === "overview" ? "关闭知识库" : "返回知识库"}
            aria-label={view === "overview" ? "关闭知识库" : "返回知识库"}
            onClick={view === "overview" ? onBack : () => setView("overview")}
          >
            <X className="size-5" />
          </Button>
        )}
      </header>

      {isRebuilding && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/70 backdrop-blur-sm">
          <div className="app-panel w-[min(440px,calc(100%-2rem))] rounded-2xl px-5 py-5 shadow-[var(--shadow-floating)]">
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
                <Loader2 className="size-5 animate-spin motion-reduce:animate-none" />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold">正在重建知识库索引</div>
                <div className="mt-1 text-sm leading-6 text-muted-foreground">
                  正在重新读取文件、生成向量并写入 sqlite-vec。资料较多时可能需要几分钟。
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden bg-surface/45">
        <ScrollArea className="h-full">
          <div className="mx-auto w-full max-w-6xl p-6">
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {status.error && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{status.error}</AlertDescription>
              </Alert>
            )}

            {isLoading ? (
              <div className="app-empty-state flex min-h-[360px] flex-col items-center justify-center rounded-2xl px-6 text-center">
                <span className="flex size-11 items-center justify-center rounded-xl bg-accent text-primary">
                  <Loader2 className="size-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                </span>
                <div className="mt-3 text-sm font-semibold">正在读取知识库</div>
              </div>
            ) : view === "overview" ? (
              <OverviewView
                settings={settings}
                isSavingSettings={isSavingSettings}
                isLoading={isLoading}
                status={status}
                isRebuilding={isRebuilding}
                library={library}
                enabledCollectionCount={enabledCollectionCount}
                validEmbeddingBindingCount={validEnabledCollections.length}
                invalidEmbeddingBindingCount={invalidEnabledCollections.length}
                boundEmbeddingProfileCount={boundEmbeddingProfileCount}
                onChooseStorageDirectory={() => void chooseStorageDirectory()}
                onRequestRebuild={requestRebuild}
                onViewChange={setView}
              />
            ) : view === "files" ? (
              <FilesView
                settings={settings}
                sources={library.sources}
                isAdding={isAdding}
                isLoading={isLoading}
                enabledCollectionNamesBySourceId={enabledCollectionNamesBySourceId}
                onAddTextFiles={() => void addTextFiles()}
                onRequestRemoveSource={requestRemoveSource}
              />
            ) : (
              <CollectionsView
                collections={library.collections}
                activeCollectionId={activeCollectionId}
                enabledCollectionCount={enabledCollectionCount}
                embeddingProfiles={embeddingProfiles}
                onStartNewCollection={startNewCollection}
                onOpenCollectionDetails={openCollectionDetails}
                onToggleCollectionEnabled={(collection, enabled) => void toggleCollectionEnabled(collection, enabled)}
                onRequestRemoveCollection={(collection) => setPendingDelete({ kind: "collection", collection })}
              />
            )}
          </div>
        </ScrollArea>
      </div>
      <DeleteConfirmDialog
        pendingDelete={pendingDelete}
        isDeleting={isDeleting}
        onOpenChange={(open) => {
          if (!open && !isDeleting) {
            setPendingDelete(null);
          }
        }}
        onConfirm={() => void confirmPendingDelete()}
      />
      <RebuildIndexConfirmDialog
        open={isRebuildConfirmOpen}
        isRebuilding={isRebuilding}
        onOpenChange={(open) => {
          if (!isRebuilding) {
            setIsRebuildConfirmOpen(open);
          }
        }}
        onConfirm={() => void confirmRebuild()}
      />
      <CollectionDetailsDialog
        open={isCollectionDetailsDialogOpen}
        activeCollection={activeCollection}
        activeCollectionSources={activeCollectionSources}
        sources={library.sources}
        settings={settings}
        embeddingProfiles={embeddingProfiles}
        collectionSourceIds={collectionSourceIds}
        isSavingMembership={isSavingMembership}
        isSavingEmbeddingProfile={isSelectingEmbedding}
        onOpenChange={handleCollectionDetailsOpenChange}
        onToggleCollectionSource={toggleCollectionSource}
        onEmbeddingProfileChange={(profileId) => {
          if (activeCollectionId) void selectEmbeddingProfile(activeCollectionId, profileId);
        }}
        onSaveCollectionSources={() => void saveCollectionSources()}
      />
      <CollectionFormDialog
        open={isCollectionDialogOpen}
        collectionDraft={collectionDraft}
        embeddingProfiles={embeddingProfiles}
        isSavingCollection={isSavingCollection}
        setCollectionDraft={setCollectionDraft}
        onOpenChange={setIsCollectionDialogOpen}
        onSaveCollection={() => void saveCollection()}
      />
    </section>
  );
};
