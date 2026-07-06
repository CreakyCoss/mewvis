import { open } from "@tauri-apps/plugin-dialog";
import { ArrowLeft, Database, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CollectionDetailsDialog, CollectionFormDialog } from "./collection-dialogs";
import { CollectionsView } from "./collections-view";
import { DeleteConfirmDialog, KnowledgeActionConfirmDialog } from "./confirm-dialogs";
import { EmbeddingConfigDialog } from "./embedding-config-dialog";
import { FilesView } from "./files-view";
import { OverviewView } from "./overview-view";
import {
  deleteKnowledgeCollection,
  deleteKnowledgeSource,
  listEmbeddingProfiles,
  getKnowledgeSettings,
  getKnowledgeIndexStatus,
  importKnowledgeFiles,
  listKnowledgeLibrary,
  rebuildKnowledgeIndex,
  saveEmbeddingProfile,
  saveKnowledgeCollection,
  saveKnowledgeSettings,
  setKnowledgeCollectionSources,
} from "../api";
import type {
  EmbeddingProfile,
  KnowledgeCollection,
  KnowledgeIndexStatus,
  KnowledgeLibrary,
  KnowledgeSettings,
  KnowledgeSource,
} from "../types";
import {
  embeddingDraftFromProfile,
  emptyCollectionDraft,
  emptyEmbeddingDraft,
  emptyLibrary,
  emptySettings,
  localOllamaBaseUrl,
  localOllamaModelOptions,
  missingStatus,
  openAiCompatibleEmbeddingModelOptions,
  supportedTextExtensions,
  type KnowledgeBaseView,
  type PendingDeleteTarget,
  type PendingKnowledgeAction,
} from "../ui-state";

type KnowledgeBasePageProps = {
  onBack?: () => void;
};

export const KnowledgeBasePage = ({ onBack }: KnowledgeBasePageProps) => {
  const [library, setLibrary] = useState<KnowledgeLibrary>(emptyLibrary);
  const [settings, setSettings] = useState<KnowledgeSettings>(emptySettings);
  const [embeddingProfiles, setEmbeddingProfiles] = useState<EmbeddingProfile[]>([]);
  const [embeddingDraft, setEmbeddingDraft] = useState(emptyEmbeddingDraft);
  const [status, setStatus] = useState<KnowledgeIndexStatus>(missingStatus);
  const [isLoading, setIsLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isSavingEmbedding, setIsSavingEmbedding] = useState(false);
  const [isEmbeddingDialogOpen, setIsEmbeddingDialogOpen] = useState(false);
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const [isCollectionDialogOpen, setIsCollectionDialogOpen] = useState(false);
  const [isCollectionDetailsDialogOpen, setIsCollectionDetailsDialogOpen] = useState(false);
  const [collectionDraft, setCollectionDraft] = useState(emptyCollectionDraft);
  const [collectionSourceIds, setCollectionSourceIds] = useState<Set<string>>(new Set());
  const [isSavingCollection, setIsSavingCollection] = useState(false);
  const [isSavingMembership, setIsSavingMembership] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDeleteTarget | null>(null);
  const [pendingKnowledgeAction, setPendingKnowledgeAction] = useState<PendingKnowledgeAction>(null);
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
  const defaultEmbeddingProfile = useMemo(
    () => embeddingProfiles.find((profile) => profile.isDefault) ?? embeddingProfiles[0] ?? null,
    [embeddingProfiles],
  );
  const isLocalOllamaEmbedding = embeddingDraft.providerKind === "ollama";
  const embeddingModelOptions = useMemo(
    () => (isLocalOllamaEmbedding ? localOllamaModelOptions : openAiCompatibleEmbeddingModelOptions),
    [isLocalOllamaEmbedding],
  );
  const defaultEmbeddingProviderLabel =
    defaultEmbeddingProfile?.providerKind === "ollama" ? "本地 Ollama" : "OpenAI-compatible";
  const defaultEmbeddingBaseUrl =
    defaultEmbeddingProfile?.providerKind === "ollama"
      ? defaultEmbeddingProfile.baseUrl || localOllamaBaseUrl
      : defaultEmbeddingProfile?.baseUrl || "";
  const embeddingSummary = defaultEmbeddingProfile
    ? `${defaultEmbeddingProviderLabel} · ${defaultEmbeddingProfile.modelId} · ${defaultEmbeddingProfile.dimensions} 维`
    : "未配置 Embedding";
  const isEmbeddingConfigChanged = Boolean(
    defaultEmbeddingProfile &&
    (defaultEmbeddingProfile.providerKind !== embeddingDraft.providerKind ||
      (defaultEmbeddingProfile.baseUrl ?? "") !== (embeddingDraft.baseUrl.trim() || "") ||
      (defaultEmbeddingProfile.apiKey ?? "") !== (embeddingDraft.apiKey.trim() || "") ||
      defaultEmbeddingProfile.modelId !== embeddingDraft.modelId.trim() ||
      defaultEmbeddingProfile.dimensions !== Math.floor(embeddingDraft.dimensions)),
  );
  const viewTitle = (
    {
      overview: "全局知识库",
      files: "上传文件",
      collections: "集合管理",
    } as const
  )[view];
  const viewDescription = (
    {
      overview: "管理资料来源、启用集合，以及知识检索使用的向量索引。",
      files: "设置知识库目录，上传文本文件并维护已导入来源。",
      collections: "创建集合，启用参与检索的集合，并分配已上传文件。",
    } as const
  )[view];

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const [nextLibrary, nextStatus] = await Promise.all([listKnowledgeLibrary(), getKnowledgeIndexStatus()]);
      const [nextSettings, nextEmbeddingProfiles] = await Promise.all([
        getKnowledgeSettings(),
        listEmbeddingProfiles(),
      ]);
      setLibrary(nextLibrary);
      setStatus(nextStatus);
      setSettings(nextSettings);
      setEmbeddingProfiles(nextEmbeddingProfiles);
      setEmbeddingDraft(
        embeddingDraftFromProfile(
          nextEmbeddingProfiles.find((profile) => profile.isDefault) ?? nextEmbeddingProfiles[0] ?? null,
        ),
      );
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
      setError(`文件已被启用集合使用，请先从集合中移除：${blockingCollectionNames.join("、")}`);
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
    setPendingKnowledgeAction("rebuild-index");
  };

  const openEmbeddingDialog = () => {
    setEmbeddingDraft(embeddingDraftFromProfile(defaultEmbeddingProfile));
    setIsEmbeddingDialogOpen(true);
  };

  const embeddingDraftValidationError = () => {
    if (!embeddingDraft.providerKind) {
      return "请选择 Embedding Provider";
    }
    if (!embeddingDraft.modelId.trim()) {
      return "请选择或填写 Embedding 模型";
    }
    if (!Number.isFinite(embeddingDraft.dimensions) || embeddingDraft.dimensions <= 0) {
      return "Embedding 维度必须大于 0";
    }
    if (!Number.isFinite(embeddingDraft.batchSize) || embeddingDraft.batchSize <= 0) {
      return "Embedding 批量大小必须大于 0";
    }

    return null;
  };

  const requestSaveDefaultEmbeddingProfile = () => {
    const validationError = embeddingDraftValidationError();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError("");
    setPendingKnowledgeAction("save-embedding");
  };

  const saveDefaultEmbeddingProfile = async () => {
    const validationError = embeddingDraftValidationError();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSavingEmbedding(true);
    setError("");
    try {
      const nextProfiles = await saveEmbeddingProfile({
        id: embeddingDraft.id,
        name: embeddingDraft.name,
        providerKind: isLocalOllamaEmbedding ? "ollama" : "openai-compatible",
        baseUrl: embeddingDraft.baseUrl.trim() || null,
        apiKey: isLocalOllamaEmbedding ? null : embeddingDraft.apiKey.trim() || null,
        modelId: embeddingDraft.modelId.trim(),
        dimensions: Math.floor(embeddingDraft.dimensions),
        batchSize: Math.floor(embeddingDraft.batchSize),
        isDefault: true,
      });
      setEmbeddingProfiles(nextProfiles);
      setEmbeddingDraft(
        embeddingDraftFromProfile(nextProfiles.find((profile) => profile.isDefault) ?? nextProfiles[0] ?? null),
      );
      setStatus(await getKnowledgeIndexStatus());
      setIsEmbeddingDialogOpen(false);
    } catch (caught) {
      setError(String(caught));
    } finally {
      setIsSavingEmbedding(false);
    }
  };

  const confirmKnowledgeAction = async () => {
    if (pendingKnowledgeAction === "rebuild-index") {
      setPendingKnowledgeAction(null);
      await rebuild();
      return;
    }

    if (pendingKnowledgeAction === "save-embedding") {
      setPendingKnowledgeAction(null);
      await saveDefaultEmbeddingProfile();
    }
  };

  const startNewCollection = () => {
    setCollectionDraft(emptyCollectionDraft());
    setIsCollectionDialogOpen(true);
  };

  const saveCollection = async () => {
    const name = collectionDraft.name.trim();
    if (!name) {
      setError("知识集合名称不能为空");
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
      setError("请先保存或选择一个知识集合");
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
      <header className="flex min-h-16 items-center justify-between bg-card/80 px-6 py-4 shadow-[0_10px_30px_-30px_rgb(15_23_42_/_0.35)] backdrop-blur">
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
            <h2 className="flex items-center gap-2 text-xl font-semibold">
              <span className="flex size-8 items-center justify-center rounded-md bg-accent text-primary shadow-xs">
                <Database className="size-4" />
              </span>
              <span>{viewTitle}</span>
            </h2>
            <p className="mt-1 truncate text-xs text-muted-foreground">{viewDescription}</p>
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
          <div className="w-[min(420px,calc(100%-2rem))] rounded-md border bg-card px-5 py-4 shadow-lg">
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent text-primary">
                <Loader2 className="size-5 animate-spin" />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold">正在重建知识库索引</div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">
                  正在重新读取文件、生成向量并写入 sqlite-vec。资料较多时可能需要几分钟。
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden bg-muted/25">
        <ScrollArea className="h-full">
          <div className="mx-auto w-full max-w-6xl p-5">
            {error && (
              <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
            {status.error && (
              <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs leading-5 text-destructive">
                {status.error}
              </div>
            )}

            {isLoading ? (
              <div className="flex min-h-[360px] items-center justify-center gap-2 rounded-md bg-muted/25 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                <span>正在读取知识库</span>
              </div>
            ) : view === "overview" ? (
              <OverviewView
                settings={settings}
                isSavingSettings={isSavingSettings}
                isLoading={isLoading}
                defaultEmbeddingProfile={defaultEmbeddingProfile}
                embeddingSummary={embeddingSummary}
                defaultEmbeddingBaseUrl={defaultEmbeddingBaseUrl}
                status={status}
                isRebuilding={isRebuilding}
                library={library}
                enabledCollectionCount={enabledCollectionCount}
                onChooseStorageDirectory={() => void chooseStorageDirectory()}
                onOpenEmbeddingDialog={openEmbeddingDialog}
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
      <KnowledgeActionConfirmDialog
        pendingAction={pendingKnowledgeAction}
        isRebuilding={isRebuilding}
        isSavingEmbedding={isSavingEmbedding}
        onOpenChange={(open) => {
          if (!open && !isRebuilding && !isSavingEmbedding) {
            setPendingKnowledgeAction(null);
          }
        }}
        onConfirm={() => void confirmKnowledgeAction()}
      />
      <EmbeddingConfigDialog
        open={isEmbeddingDialogOpen}
        embeddingDraft={embeddingDraft}
        defaultEmbeddingProfile={defaultEmbeddingProfile}
        embeddingModelOptions={embeddingModelOptions}
        isLocalOllamaEmbedding={isLocalOllamaEmbedding}
        isEmbeddingConfigChanged={isEmbeddingConfigChanged}
        isSavingEmbedding={isSavingEmbedding}
        setEmbeddingDraft={setEmbeddingDraft}
        onOpenChange={setIsEmbeddingDialogOpen}
        onRequestSave={requestSaveDefaultEmbeddingProfile}
      />
      <CollectionDetailsDialog
        open={isCollectionDetailsDialogOpen}
        activeCollection={activeCollection}
        activeCollectionSources={activeCollectionSources}
        sources={library.sources}
        settings={settings}
        collectionSourceIds={collectionSourceIds}
        isSavingMembership={isSavingMembership}
        onOpenChange={handleCollectionDetailsOpenChange}
        onToggleCollectionSource={toggleCollectionSource}
        onSaveCollectionSources={() => void saveCollectionSources()}
      />
      <CollectionFormDialog
        open={isCollectionDialogOpen}
        collectionDraft={collectionDraft}
        isSavingCollection={isSavingCollection}
        setCollectionDraft={setCollectionDraft}
        onOpenChange={setIsCollectionDialogOpen}
        onSaveCollection={() => void saveCollection()}
      />
    </section>
  );
};
