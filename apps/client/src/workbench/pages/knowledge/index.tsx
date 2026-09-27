import { ChevronRight, Database, Folder, Loader2, Plus, Search, Settings2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { listEmbeddingProfiles, type EmbeddingProfile } from "@/api/embedding";
import { getKnowledgeIndexStatus, listKnowledgeLibrary } from "@/api/knowledge";
import { Alert, AlertDescription } from "design-system/components/ui/alert";
import { Button } from "design-system/components/ui/button";
import { Input } from "design-system/components/ui/input";
import { ScrollArea } from "design-system/components/ui/scroll-area";
import type { KnowledgeIndexStatus, KnowledgeLibrary } from "./types";
import { CreateKnowledgeDialog } from "./create-dialog";
import { formatKnowledgeTime, KnowledgeIndexStatusBadge } from "./components";

const emptyLibrary: KnowledgeLibrary = { collections: [], sources: [] };

export const KnowledgePage = () => {
  const navigate = useNavigate();
  const [library, setLibrary] = useState<KnowledgeLibrary>(emptyLibrary);
  const [embeddingProfiles, setEmbeddingProfiles] = useState<EmbeddingProfile[]>([]);
  const [statuses, setStatuses] = useState<Record<string, KnowledgeIndexStatus>>({});
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const [nextLibrary, nextProfiles] = await Promise.all([listKnowledgeLibrary(), listEmbeddingProfiles()]);
      const statusEntries = await Promise.all(
        nextLibrary.collections.map(
          async (collection) => [collection.id, await getKnowledgeIndexStatus(collection.id)] as const,
        ),
      );
      setLibrary(nextLibrary);
      setEmbeddingProfiles(nextProfiles);
      setStatuses(Object.fromEntries(statusEntries));
    } catch (caught) {
      setError(String(caught));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const profilesById = useMemo(
    () => new Map(embeddingProfiles.map((profile) => [profile.id, profile])),
    [embeddingProfiles],
  );
  const filteredCollections = useMemo(() => {
    const orderedCollections = [...library.collections].sort(
      (left, right) => left.order - right.order || left.createdAt - right.createdAt,
    );
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return orderedCollections;
    return orderedCollections.filter((collection) => {
      const profile = collection.embeddingProfileId ? profilesById.get(collection.embeddingProfileId) : null;
      return [collection.name, collection.description, collection.sourceDirectory, profile?.name, profile?.modelId]
        .filter(Boolean)
        .some((value) => value?.toLocaleLowerCase().includes(normalizedQuery));
    });
  }, [library.collections, profilesById, query]);

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-surface/45">
      <header className="app-page-header flex min-h-24 flex-wrap items-center justify-between gap-4 bg-transparent px-6 py-5">
        <div className="flex min-w-0 items-center gap-3.5">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
            <Database className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">知识库</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">管理多个知识库、资料目录，以及各自使用的向量模型。</p>
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
          <div className="relative min-w-0 flex-1 basis-full sm:w-64 sm:basis-auto">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              value={query}
              placeholder="搜索知识库"
              aria-label="搜索知识库"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              aria-label="管理 Embedding 配置"
              title="管理 Embedding 配置"
              onClick={() => navigate("/knowledge/embedding")}
            >
              <Settings2 className="size-4" />
              管理
            </Button>
            <Button type="button" onClick={() => setIsCreateOpen(true)}>
              <Plus className="size-4" />
              新建知识库
            </Button>
          </div>
        </div>
      </header>

      <ScrollArea className="min-h-0 flex-1 bg-transparent">
        <div className="w-full px-6">
          {error && (
            <Alert variant="destructive" className="my-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {isLoading ? (
            <div className="flex min-h-96 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
              正在读取知识库
            </div>
          ) : filteredCollections.length ? (
            <div className="knowledge-list-container w-full">
              <div className="knowledge-list-grid min-h-14 items-center gap-4 border-b border-border/70 px-5 text-xs font-medium text-muted-foreground">
                <span>知识库名称</span>
                <span className="knowledge-list-directory">目录</span>
                <span className="knowledge-list-model">向量模型</span>
                <span className="knowledge-list-document">文档</span>
                <span>参与检索</span>
                <span>索引状态</span>
                <span>最近更新</span>
                <span aria-hidden="true" />
              </div>
              <div aria-label="知识库列表">
                {filteredCollections.map((collection) => {
                  const profile = collection.embeddingProfileId
                    ? (profilesById.get(collection.embeddingProfileId) ?? null)
                    : null;
                  const invalidModel = Boolean(collection.embeddingProfileId) && !profile;
                  const status = statuses[collection.id] ?? null;

                  return (
                    <button
                      key={collection.id}
                      type="button"
                      className="knowledge-list-grid group min-h-20 w-full items-center gap-4 border-b border-border/70 px-5 text-left transition-colors hover:bg-accent/20 focus-visible:z-10 focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/20 focus-visible:outline-none"
                      aria-label={`打开知识库 ${collection.name}`}
                      onClick={() => navigate(`/knowledge/${collection.id}`)}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent/75 text-primary">
                          <Folder className="size-[18px]" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-foreground">{collection.name}</span>
                          {collection.description && (
                            <span className="mt-1 block truncate text-xs text-muted-foreground">
                              {collection.description}
                            </span>
                          )}
                        </span>
                      </span>
                      <span
                        className="knowledge-list-directory truncate text-sm text-muted-foreground"
                        title={collection.sourceDirectory ?? ""}
                      >
                        {collection.sourceDirectory ?? "未设置目录"}
                      </span>
                      <span className="knowledge-list-model min-w-0">
                        <span
                          className={
                            invalidModel ? "block truncate text-sm text-destructive" : "block truncate text-sm"
                          }
                        >
                          {profile?.modelId ?? (invalidModel ? "原模型配置已删除" : "未选择模型")}
                        </span>
                        {profile && (
                          <span className="mt-1 block truncate text-xs text-muted-foreground">{profile.name}</span>
                        )}
                      </span>
                      <span className="knowledge-list-document text-sm tabular-nums text-foreground">
                        {status?.documentCount ?? 0}
                      </span>
                      <span
                        className={
                          collection.enabled
                            ? "inline-flex items-center gap-2 text-sm text-primary"
                            : "inline-flex items-center gap-2 text-sm text-muted-foreground"
                        }
                      >
                        <span
                          className={
                            collection.enabled
                              ? "size-1.5 shrink-0 rounded-full bg-primary"
                              : "size-1.5 shrink-0 rounded-full bg-muted-foreground/55"
                          }
                          aria-hidden="true"
                        />
                        {collection.enabled ? "已启用" : "未启用"}
                      </span>
                      <KnowledgeIndexStatusBadge
                        status={status}
                        invalidModel={invalidModel || !collection.embeddingProfileId}
                      />
                      <span className="truncate text-sm text-muted-foreground">
                        {formatKnowledgeTime(status?.updatedAt)}
                      </span>
                      <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="app-empty-state flex min-h-96 flex-col items-center justify-center rounded-2xl px-6 text-center">
              <span className="flex size-12 items-center justify-center rounded-xl bg-accent text-primary">
                <Folder className="size-6" />
              </span>
              <h3 className="mt-4 font-semibold">{query.trim() ? "没有匹配的知识库" : "创建第一个知识库"}</h3>
              <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">
                {query.trim()
                  ? "尝试使用其他名称、目录或模型搜索。"
                  : "选择一个本地目录和向量模型，然后建立可检索索引。"}
              </p>
              {!query.trim() && (
                <Button type="button" className="mt-5" onClick={() => setIsCreateOpen(true)}>
                  <Plus className="size-4" />
                  新建知识库
                </Button>
              )}
            </div>
          )}
        </div>
      </ScrollArea>

      <CreateKnowledgeDialog
        open={isCreateOpen}
        embeddingProfiles={embeddingProfiles}
        onOpenChange={setIsCreateOpen}
        onCreated={() => void load()}
      />
    </section>
  );
};
