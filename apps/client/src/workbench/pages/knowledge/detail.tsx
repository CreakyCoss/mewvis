import { openSystemDialog as open } from "@/api/native";
import {
  ArrowLeft,
  CircleAlert,
  Database,
  FileText,
  FolderOpen,
  Loader2,
  RefreshCw,
  Save,
  Settings2,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { listEmbeddingProfiles, type EmbeddingProfile } from "@/api/embedding";
import {
  deleteKnowledgeCollection,
  getKnowledgeIndexStatus,
  listKnowledgeCollectionFiles,
  listKnowledgeLibrary,
  rebuildKnowledgeIndex,
  saveKnowledgeCollection,
} from "@/api/knowledge";
import { Alert, AlertDescription } from "design-system/components/ui/alert";
import { Button } from "design-system/components/ui/button";
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
import { NativeSelect, NativeSelectOption } from "design-system/components/ui/native-select";
import { ScrollArea } from "design-system/components/ui/scroll-area";
import { Switch } from "design-system/components/ui/switch";
import { Textarea } from "design-system/components/ui/textarea";
import type { KnowledgeCollection, KnowledgeCollectionFile, KnowledgeIndexStatus } from "./types";
import { formatFileSize, formatKnowledgeTime, KnowledgeIndexStatusBadge } from "./components";

type DetailTab = "overview" | "files" | "settings";

type SettingsDraft = {
  name: string;
  description: string;
  sourceDirectory: string;
  embeddingProfileId: string;
  enabled: boolean;
};

const emptySettingsDraft: SettingsDraft = {
  name: "",
  description: "",
  sourceDirectory: "",
  embeddingProfileId: "",
  enabled: true,
};

export const KnowledgeDetailPage = () => {
  const { collectionId = "" } = useParams<{ collectionId: string }>();
  const navigate = useNavigate();
  const [collection, setCollection] = useState<KnowledgeCollection | null>(null);
  const [embeddingProfiles, setEmbeddingProfiles] = useState<EmbeddingProfile[]>([]);
  const [status, setStatus] = useState<KnowledgeIndexStatus | null>(null);
  const [files, setFiles] = useState<KnowledgeCollectionFile[]>([]);
  const [settingsDraft, setSettingsDraft] = useState<SettingsDraft>(emptySettingsDraft);
  const [tab, setTab] = useState<DetailTab>("overview");
  const [isLoading, setIsLoading] = useState(true);
  const [isIndexing, setIsIndexing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isChoosingDirectory, setIsChoosingDirectory] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRebuildOpen, setIsRebuildOpen] = useState(false);
  const [error, setError] = useState("");

  const applyCollection = useCallback((nextCollection: KnowledgeCollection) => {
    setCollection(nextCollection);
    setSettingsDraft({
      name: nextCollection.name,
      description: nextCollection.description ?? "",
      sourceDirectory: nextCollection.sourceDirectory ?? "",
      embeddingProfileId: nextCollection.embeddingProfileId ?? "",
      enabled: nextCollection.enabled,
    });
  }, []);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const [library, profiles, nextStatus] = await Promise.all([
        listKnowledgeLibrary(),
        listEmbeddingProfiles(),
        getKnowledgeIndexStatus(collectionId),
      ]);
      const nextCollection = library.collections.find((item) => item.id === collectionId) ?? null;
      setEmbeddingProfiles(profiles);
      setStatus(nextStatus);
      if (nextCollection) {
        applyCollection(nextCollection);
        if (nextCollection.sourceDirectory) {
          try {
            setFiles(await listKnowledgeCollectionFiles(collectionId));
          } catch (caught) {
            setFiles([]);
            setError(String(caught));
          }
        } else {
          setFiles([]);
        }
      } else {
        setCollection(null);
      }
    } catch (caught) {
      setError(String(caught));
    } finally {
      setIsLoading(false);
    }
  }, [applyCollection, collectionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeProfile = useMemo(
    () => embeddingProfiles.find((profile) => profile.id === collection?.embeddingProfileId) ?? null,
    [collection?.embeddingProfileId, embeddingProfiles],
  );
  const invalidModel = Boolean(collection?.embeddingProfileId) && !activeProfile;
  const canBuildIndex = Boolean(collection?.sourceDirectory && activeProfile && files.length > 0);

  const startIndex = async () => {
    setIsRebuildOpen(false);
    setIsIndexing(true);
    setError("");
    setStatus((current) => (current ? { ...current, status: "building" } : current));
    try {
      const result = await rebuildKnowledgeIndex(collectionId);
      setStatus(result.status);
    } catch (caught) {
      setError(String(caught));
      setStatus(await getKnowledgeIndexStatus(collectionId).catch(() => null));
    } finally {
      setIsIndexing(false);
    }
  };

  const requestIndex = () => {
    if (status?.status === "ready" || status?.status === "stale") {
      setIsRebuildOpen(true);
      return;
    }
    void startIndex();
  };

  const chooseDirectory = async () => {
    setIsChoosingDirectory(true);
    setError("");
    try {
      const selected = await open({ multiple: false, directory: true, title: "选择知识库目录" });
      if (typeof selected === "string") {
        setSettingsDraft((current) => ({ ...current, sourceDirectory: selected }));
      }
    } catch (caught) {
      setError(String(caught));
    } finally {
      setIsChoosingDirectory(false);
    }
  };

  const saveSettings = async () => {
    if (!collection) return;
    if (!settingsDraft.name.trim()) {
      setError("知识库名称不能为空");
      return;
    }
    if (!settingsDraft.sourceDirectory) {
      setError("请选择知识库目录");
      return;
    }
    if (!settingsDraft.embeddingProfileId) {
      setError("请选择向量模型");
      return;
    }

    setIsSaving(true);
    setError("");
    try {
      const library = await saveKnowledgeCollection({
        id: collection.id,
        name: settingsDraft.name.trim(),
        description: settingsDraft.description.trim() || null,
        sourceDirectory: settingsDraft.sourceDirectory,
        color: collection.color,
        order: collection.order,
        enabled: settingsDraft.enabled,
        embeddingProfileId: settingsDraft.embeddingProfileId,
      });
      const nextCollection = library.collections.find((item) => item.id === collection.id);
      if (nextCollection) applyCollection(nextCollection);
      const [nextStatus, nextFiles] = await Promise.all([
        getKnowledgeIndexStatus(collection.id),
        listKnowledgeCollectionFiles(collection.id),
      ]);
      setStatus(nextStatus);
      setFiles(nextFiles);
    } catch (caught) {
      setError(String(caught));
    } finally {
      setIsSaving(false);
    }
  };

  const deleteCollection = async () => {
    if (!collection) return;
    setIsDeleting(true);
    setError("");
    try {
      await deleteKnowledgeCollection(collection.id);
      navigate("/knowledge");
    } catch (caught) {
      setError(String(caught));
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <section className="flex h-full flex-1 items-center justify-center gap-2 bg-surface/45 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
        正在读取知识库
      </section>
    );
  }

  if (!collection) {
    return (
      <section className="flex h-full flex-1 items-center justify-center bg-surface/45 p-6">
        <div className="app-empty-state flex min-h-72 w-full max-w-xl flex-col items-center justify-center rounded-2xl px-6 text-center">
          <CircleAlert className="size-8 text-muted-foreground" />
          <h2 className="mt-4 font-semibold">知识库不存在</h2>
          <p className="mt-1 text-sm text-muted-foreground">它可能已经被删除，或者链接已经失效。</p>
          <Button type="button" variant="outline" className="mt-5" onClick={() => navigate("/knowledge")}>
            <ArrowLeft className="size-4" />
            返回知识库
          </Button>
        </div>
      </section>
    );
  }

  const indexButtonLabel = status?.status === "ready" || status?.status === "stale" ? "重建索引" : "建立索引";

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-surface/45">
      <header className="app-page-header bg-transparent px-6 pt-4">
        <div className="flex min-h-16 flex-wrap items-center justify-between gap-4 pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 rounded-xl"
              title="返回知识库"
              aria-label="返回知识库"
              onClick={() => navigate("/knowledge")}
            >
              <ArrowLeft className="size-5" />
            </Button>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
              <Database className="size-5" />
            </span>
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                <h2 className="truncate text-xl font-semibold tracking-[-0.02em]">{collection.name}</h2>
                <KnowledgeIndexStatusBadge
                  status={status}
                  invalidModel={invalidModel || !collection.embeddingProfileId}
                />
              </div>
              <p
                className="mt-0.5 max-w-3xl truncate text-sm text-muted-foreground"
                title={collection.sourceDirectory ?? ""}
              >
                {collection.sourceDirectory ?? "未设置目录"}
              </p>
            </div>
          </div>
          <Button type="button" onClick={requestIndex} disabled={isIndexing || !canBuildIndex}>
            {isIndexing ? (
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            {isIndexing ? "正在建立" : indexButtonLabel}
          </Button>
        </div>

        <nav className="flex items-center gap-6" aria-label="知识库详情">
          {(
            [
              ["overview", "概览"],
              ["files", `文件 ${files.length}`],
              ["settings", "设置"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={[
                "relative min-h-11 border-b-2 px-1 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/20 focus-visible:outline-none",
                tab === value
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              ].join(" ")}
              aria-current={tab === value ? "page" : undefined}
              onClick={() => setTab(value)}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      <ScrollArea className="min-h-0 flex-1 bg-transparent">
        <div className="mx-auto w-full max-w-7xl p-6">
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {status?.error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{status.error}</AlertDescription>
            </Alert>
          )}

          {tab === "overview" ? (
            <OverviewTab
              collection={collection}
              profile={activeProfile}
              status={status}
              files={files}
              invalidModel={invalidModel}
              onBuildIndex={requestIndex}
              onOpenFiles={() => setTab("files")}
              onOpenSettings={() => setTab("settings")}
            />
          ) : tab === "files" ? (
            <FilesTab files={files} onRefresh={() => void load()} />
          ) : (
            <SettingsTab
              collection={collection}
              draft={settingsDraft}
              embeddingProfiles={embeddingProfiles}
              isChoosingDirectory={isChoosingDirectory}
              isSaving={isSaving}
              onDraftChange={setSettingsDraft}
              onChooseDirectory={() => void chooseDirectory()}
              onSave={() => void saveSettings()}
              onDelete={() => setIsDeleteOpen(true)}
            />
          )}
        </div>
      </ScrollArea>

      <Dialog open={isRebuildOpen} onOpenChange={(open) => !isIndexing && setIsRebuildOpen(open)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>重建知识库索引？</DialogTitle>
            <DialogDescription>系统会重新扫描目录并生成向量。现有索引会在过程中更新。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsRebuildOpen(false)}>
              取消
            </Button>
            <Button type="button" onClick={() => void startIndex()}>
              <RefreshCw className="size-4" />
              重建索引
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteOpen} onOpenChange={(open) => !isDeleting && setIsDeleteOpen(open)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>删除“{collection.name}”？</DialogTitle>
            <DialogDescription>这会删除知识库配置与索引，不会删除本地目录中的原始文件。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsDeleteOpen(false)} disabled={isDeleting}>
              取消
            </Button>
            <Button type="button" variant="destructive" onClick={() => void deleteCollection()} disabled={isDeleting}>
              {isDeleting ? (
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
              ) : (
                <Trash2 className="size-4" />
              )}
              删除知识库
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
};

type OverviewTabProps = {
  collection: KnowledgeCollection;
  profile: EmbeddingProfile | null;
  status: KnowledgeIndexStatus | null;
  files: KnowledgeCollectionFile[];
  invalidModel: boolean;
  onBuildIndex: () => void;
  onOpenFiles: () => void;
  onOpenSettings: () => void;
};

const OverviewTab = ({
  collection,
  profile,
  status,
  files,
  invalidModel,
  onBuildIndex,
  onOpenFiles,
  onOpenSettings,
}: OverviewTabProps) => (
  <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
    <div className="space-y-8">
      <section className="border-b border-border/70">
        <div className="border-b border-border/70 px-5 py-4">
          <div>
            <h3 className="font-semibold">索引概览</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {invalidModel || !collection.embeddingProfileId
                ? "向量模型不可用，请先更新知识库配置。"
                : status?.status === "ready"
                  ? `最近更新于 ${formatKnowledgeTime(status.updatedAt)}。`
                  : status?.status === "building"
                    ? "正在扫描目录并生成索引。"
                    : status?.status === "error"
                      ? "索引建立失败，请检查错误信息后重试。"
                      : status?.status === "stale"
                        ? "目录或模型配置已经变化，需要重建索引。"
                        : "确认目录和模型后，建立首个可检索索引。"}
            </p>
          </div>
        </div>
        <div className="grid sm:grid-cols-2">
          <div className="border-b border-border/70 px-5 py-5 sm:border-r sm:border-b-0">
            <div className="text-xs text-muted-foreground">文档数量</div>
            <div className="mt-2 text-2xl font-semibold tabular-nums">{status?.documentCount ?? 0}</div>
          </div>
          <div className="px-5 py-5">
            <div className="text-xs text-muted-foreground">索引片段</div>
            <div className="mt-2 text-2xl font-semibold tabular-nums">{status?.chunkCount ?? 0}</div>
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
          <div>
            <h3 className="font-semibold">最近文件</h3>
            <p className="mt-1 text-sm text-muted-foreground">目录中最近修改的可索引文件。</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onOpenFiles}>
            查看全部
          </Button>
        </div>
        <FileRows files={files.slice(0, 6)} />
      </section>
    </div>

    <aside className="h-fit border-t border-border/70 pt-6 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-6">
      <div className="border-b border-border/70 px-5 py-4">
        <h3 className="font-semibold">知识库配置</h3>
        <p className="mt-1 text-sm text-muted-foreground">索引只使用当前知识库的目录和模型。</p>
      </div>
      <div className="divide-y divide-border/70">
        <div className="px-5 py-4">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <FolderOpen className="size-4" />
            目录
          </div>
          <div className="mt-2 break-words text-sm leading-6">{collection.sourceDirectory}</div>
        </div>
        <div className="px-5 py-4">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Database className="size-4" />
            向量模型
          </div>
          <div className={invalidModel ? "mt-2 text-sm text-destructive" : "mt-2 text-sm"}>
            {profile ? `${profile.name} · ${profile.modelId}` : invalidModel ? "原模型配置已删除" : "未选择模型"}
          </div>
        </div>
      </div>
      <div className="space-y-2 border-t border-border/70 px-1 pt-4">
        <Button type="button" className="w-full" onClick={onBuildIndex} disabled={invalidModel || files.length === 0}>
          <RefreshCw className="size-4" />
          {status?.status === "ready" || status?.status === "stale" ? "重建索引" : "建立索引"}
        </Button>
        <Button type="button" variant="outline" className="w-full" onClick={onOpenSettings}>
          <Settings2 className="size-4" />
          编辑配置
        </Button>
      </div>
    </aside>
  </div>
);

const FilesTab = ({ files, onRefresh }: { files: KnowledgeCollectionFile[]; onRefresh: () => void }) => (
  <section>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
      <div>
        <h3 className="font-semibold">目录文件</h3>
        <p className="mt-1 text-sm text-muted-foreground">显示目录中支持索引的文本和代码文件，共 {files.length} 个。</p>
      </div>
      <Button type="button" variant="outline" onClick={onRefresh}>
        <RefreshCw className="size-4" />
        重新扫描
      </Button>
    </div>
    <FileRows files={files} />
  </section>
);

const FileRows = ({ files }: { files: KnowledgeCollectionFile[] }) =>
  files.length ? (
    <div>
      <div className="grid min-h-12 grid-cols-[minmax(180px,1fr)_minmax(220px,1.4fr)_100px_130px] items-center gap-4 border-b border-border/70 px-5 text-xs font-medium text-muted-foreground max-lg:grid-cols-[minmax(180px,1fr)_100px]">
        <span>文件名</span>
        <span className="max-lg:hidden">相对路径</span>
        <span>大小</span>
        <span className="max-lg:hidden">修改时间</span>
      </div>
      {files.map((file) => (
        <div
          key={file.relativePath}
          className="grid min-h-14 grid-cols-[minmax(180px,1fr)_minmax(220px,1.4fr)_100px_130px] items-center gap-4 border-b border-border/70 px-5 max-lg:grid-cols-[minmax(180px,1fr)_100px]"
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <FileText className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate text-sm font-medium">{file.name}</span>
          </span>
          <span className="truncate text-sm text-muted-foreground max-lg:hidden" title={file.relativePath}>
            {file.relativePath}
          </span>
          <span className="text-sm tabular-nums text-muted-foreground">{formatFileSize(file.sizeBytes)}</span>
          <span className="text-sm text-muted-foreground max-lg:hidden">{formatKnowledgeTime(file.modifiedAt)}</span>
        </div>
      ))}
    </div>
  ) : (
    <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
      <FileText className="size-7 text-muted-foreground" />
      <div className="mt-3 text-sm font-medium">目录中没有支持的文件</div>
      <div className="mt-1 text-xs text-muted-foreground">加入 Markdown、文本、JSON 或代码文件后重新扫描。</div>
    </div>
  );

type SettingsTabProps = {
  collection: KnowledgeCollection;
  draft: SettingsDraft;
  embeddingProfiles: EmbeddingProfile[];
  isChoosingDirectory: boolean;
  isSaving: boolean;
  onDraftChange: (draft: SettingsDraft) => void;
  onChooseDirectory: () => void;
  onSave: () => void;
  onDelete: () => void;
};

const SettingsTab = ({
  collection,
  draft,
  embeddingProfiles,
  isChoosingDirectory,
  isSaving,
  onDraftChange,
  onChooseDirectory,
  onSave,
  onDelete,
}: SettingsTabProps) => (
  <div className="mx-auto max-w-6xl space-y-6">
    <div className="flex items-start gap-3 px-1">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/70 text-primary">
        <Settings2 className="size-5" />
      </span>
      <div>
        <h3 className="text-lg font-semibold tracking-[-0.01em]">知识库设置</h3>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          管理当前知识库的基础信息、资料目录和向量模型。目录或模型变化后，需要重新建立索引。
        </p>
      </div>
    </div>

    <section className="border-y border-border/70">
      <div className="divide-y divide-border/60">
        <div className="grid gap-4 bg-primary/[0.035] px-6 py-5 md:grid-cols-[240px_minmax(0,1fr)] md:items-center md:gap-8">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Database className="size-4 text-primary" aria-hidden="true" />
              参与聊天检索
            </div>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              启用后，这个知识库会出现在聊天输入框的知识库选择器中。
            </p>
          </div>
          <div className="flex min-h-12 items-center justify-between gap-4 rounded-xl border border-primary/15 bg-background/55 px-4">
            <span>
              <span className="block text-sm font-medium">{draft.enabled ? "已启用" : "未启用"}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {draft.enabled ? "聊天可以选择并检索此知识库" : "索引保留，但不会提供给聊天选择"}
              </span>
            </span>
            <Switch
              checked={draft.enabled}
              aria-label={`${collection.name}${draft.enabled ? "停用知识检索" : "启用知识检索"}`}
              onCheckedChange={(enabled) => onDraftChange({ ...draft, enabled })}
            />
          </div>
        </div>
        <div className="grid gap-4 px-6 py-5 md:grid-cols-[240px_minmax(0,1fr)] md:gap-8">
          <div>
            <Label htmlFor="knowledge-settings-name" className="text-sm font-semibold">
              知识库名称
            </Label>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">用于列表展示和识别当前知识库。</p>
          </div>
          <Input
            id="knowledge-settings-name"
            className="h-10 bg-background/55"
            value={draft.name}
            onChange={(event) => onDraftChange({ ...draft, name: event.target.value })}
          />
        </div>
        <div className="grid gap-4 px-6 py-5 md:grid-cols-[240px_minmax(0,1fr)] md:gap-8">
          <div>
            <Label htmlFor="knowledge-settings-description" className="text-sm font-semibold">
              描述
            </Label>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">说明内容范围，方便判断检索用途。</p>
          </div>
          <Textarea
            id="knowledge-settings-description"
            className="min-h-28 resize-none bg-background/55"
            value={draft.description}
            onChange={(event) => onDraftChange({ ...draft, description: event.target.value })}
          />
        </div>
        <div className="grid gap-4 px-6 py-5 md:grid-cols-[240px_minmax(0,1fr)] md:gap-8">
          <div>
            <Label className="text-sm font-semibold">知识库目录</Label>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">索引只扫描这个目录中的受支持文件。</p>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <div
              className="flex h-10 min-w-0 flex-1 items-center truncate rounded-lg border border-input bg-background/45 px-3 text-sm"
              title={draft.sourceDirectory}
            >
              {draft.sourceDirectory || "未选择目录"}
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={onChooseDirectory}
              disabled={isChoosingDirectory || isSaving}
            >
              {isChoosingDirectory ? (
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
              ) : (
                <FolderOpen className="size-4" />
              )}
              更换目录
            </Button>
          </div>
        </div>
        <div className="grid gap-4 px-6 py-5 md:grid-cols-[240px_minmax(0,1fr)] md:gap-8">
          <div>
            <Label htmlFor="knowledge-settings-embedding" className="text-sm font-semibold">
              向量模型
            </Label>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">切换模型后，现有索引会标记为等待更新。</p>
          </div>
          <NativeSelect
            id="knowledge-settings-embedding"
            className="h-10 w-full bg-background/55"
            value={
              embeddingProfiles.some((profile) => profile.id === draft.embeddingProfileId)
                ? draft.embeddingProfileId
                : ""
            }
            onChange={(event) => onDraftChange({ ...draft, embeddingProfileId: event.currentTarget.value })}
          >
            <NativeSelectOption value="" disabled>
              {draft.embeddingProfileId ? "原模型已失效，请重新选择" : "请选择向量模型"}
            </NativeSelectOption>
            {embeddingProfiles.map((profile) => (
              <NativeSelectOption key={profile.id} value={profile.id}>
                {profile.name} · {profile.modelId}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      </div>
      <div className="flex justify-end border-t border-border/60 bg-surface/30 px-6 py-4">
        <Button
          type="button"
          className="h-10 min-w-28"
          onClick={onSave}
          disabled={isSaving || !draft.name.trim() || !draft.sourceDirectory || !draft.embeddingProfileId}
        >
          {isSaving ? (
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
          ) : (
            <Save className="size-4" />
          )}
          保存设置
        </Button>
      </div>
    </section>

    <section className="border-b border-destructive/25 bg-destructive/[0.025] px-6 py-5">
      <div className="flex flex-wrap items-center justify-between gap-6">
        <div>
          <h3 className="text-base font-semibold">删除知识库</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">删除配置和索引，但保留目录中的原始文件。</p>
        </div>
        <Button type="button" variant="destructive" onClick={onDelete}>
          <Trash2 className="size-4" />
          删除知识库
        </Button>
      </div>
    </section>
  </div>
);
