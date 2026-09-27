import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, Layers3, Loader2, Plus } from "lucide-react";
import { useNavigate } from "react-router";
import { listEmbeddingProfiles, type EmbeddingProfile } from "@/api/embedding";
import { Button } from "design-system/components/ui/button";
import { ScrollArea } from "design-system/components/ui/scroll-area";
import { EmbeddingEditDialog, type EmbeddingEditDialogHandle } from "./edit";
import { embeddingProviderLabel, localOllamaBaseUrl } from "./ui-state";

const CredentialStatus = ({ profile }: { profile: EmbeddingProfile }) => {
  if (profile.providerKind === "ollama") {
    return <span className="text-sm text-muted-foreground">无需凭据</span>;
  }

  return profile.apiKey?.trim() ? (
    <span className="inline-flex items-center gap-2 text-sm text-success">
      <span className="size-1.5 shrink-0 rounded-full bg-success" aria-hidden="true" />
      已配置
    </span>
  ) : (
    <span className="text-sm text-warning">缺少凭据</span>
  );
};

const EmbeddingRow = ({ profile, onOpen }: { profile: EmbeddingProfile; onOpen: () => void }) => {
  const endpoint = profile.baseUrl?.trim() || (profile.providerKind === "ollama" ? localOllamaBaseUrl : "默认服务地址");

  return (
    <button
      type="button"
      className="group grid min-h-15 w-full min-w-0 grid-cols-[minmax(170px,1.05fr)_minmax(140px,0.8fr)_minmax(200px,1.2fr)_100px_112px_130px] items-center gap-4 border-b border-border/70 px-4 text-left transition-colors hover:bg-accent/20 focus-visible:z-10 focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/20 focus-visible:outline-none max-lg:grid-cols-[minmax(160px,1fr)_minmax(180px,1.1fr)_90px_120px]"
      onClick={onOpen}
      aria-label={`编辑 Embedding 配置 ${profile.name}`}
    >
      <span className="truncate text-sm font-medium">{profile.name}</span>
      <span className="truncate text-sm text-muted-foreground max-lg:hidden">
        {embeddingProviderLabel(profile.providerKind)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm text-foreground">{profile.modelId}</span>
        <span className="block truncate text-xs text-muted-foreground max-lg:hidden">{endpoint}</span>
      </span>
      <span className="text-sm text-foreground">{profile.dimensions} 维</span>
      <span className="max-lg:hidden">
        <CredentialStatus profile={profile} />
      </span>
      <span className={profile.knowledgeBaseCount > 0 ? "text-sm text-foreground" : "text-sm text-muted-foreground"}>
        {profile.knowledgeBaseCount > 0 ? `${profile.knowledgeBaseCount} 个知识库使用` : "暂无知识库使用"}
      </span>
    </button>
  );
};

const EmbeddingTableHeader = () => (
  <div className="grid min-h-15 grid-cols-[minmax(170px,1.05fr)_minmax(140px,0.8fr)_minmax(200px,1.2fr)_100px_112px_130px] items-center gap-4 border-b border-border/70 px-4 text-xs font-medium text-muted-foreground max-lg:grid-cols-[minmax(160px,1fr)_minmax(180px,1.1fr)_90px_120px]">
    <span>配置名称</span>
    <span className="max-lg:hidden">Provider</span>
    <span>模型与地址</span>
    <span>向量维度</span>
    <span className="max-lg:hidden">凭据状态</span>
    <span>使用状态</span>
  </div>
);

export const EmbeddingManagementPage = () => {
  const navigate = useNavigate();
  const editDialogRef = useRef<EmbeddingEditDialogHandle>(null);
  const [profiles, setProfiles] = useState<EmbeddingProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadProfiles = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      setProfiles(await listEmbeddingProfiles());
    } catch (caught) {
      setError(String(caught));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-surface/45">
      <header className="app-page-header flex min-h-28 shrink-0 flex-wrap items-center justify-between gap-4 bg-transparent px-6 py-5">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            className="-ml-2 shrink-0 rounded-full bg-muted/55 text-muted-foreground hover:bg-accent/75 hover:text-foreground"
            title="返回知识库"
            aria-label="返回知识库"
            onClick={() => navigate("/knowledge")}
          >
            <ChevronLeft className="size-5" />
          </Button>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Embedding 设置</h2>
            <p className="mt-1 text-sm text-muted-foreground">管理可供知识库选择的向量化服务与模型</p>
          </div>
        </div>
        <div className="shrink-0">
          <Button type="button" onClick={() => editDialogRef.current?.open({ mode: "create" })}>
            <Plus className="size-4" />
            <span>添加配置</span>
          </Button>
        </div>
      </header>

      <ScrollArea className="min-h-0 flex-1 bg-transparent">
        <div className="w-full px-6">
          {error && (
            <div
              role="alert"
              className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
            >
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="flex min-h-72 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
              <span>正在读取 Embedding 设置</span>
            </div>
          ) : profiles.length > 0 ? (
            <div className="w-full">
              <EmbeddingTableHeader />
              <div aria-label="已配置的 Embedding 模型">
                {profiles.map((profile) => (
                  <EmbeddingRow
                    key={profile.id}
                    profile={profile}
                    onOpen={() => editDialogRef.current?.open({ mode: "edit", profile })}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="app-empty-state mt-8 flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-2xl px-6 text-center">
              <span className="flex size-12 items-center justify-center rounded-xl bg-accent text-primary">
                <Layers3 className="size-6" />
              </span>
              <div className="space-y-1">
                <h3 className="font-semibold">还没有 Embedding 配置</h3>
                <p className="text-sm text-muted-foreground">添加向量化服务后，就可以在知识库中选择并重建索引。</p>
              </div>
              <Button type="button" onClick={() => editDialogRef.current?.open({ mode: "create" })}>
                <Plus className="size-4" />
                <span>添加配置</span>
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>

      <EmbeddingEditDialog bind={editDialogRef} profiles={profiles} onSaved={loadProfiles} />
    </section>
  );
};
