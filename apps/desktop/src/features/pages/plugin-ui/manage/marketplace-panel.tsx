import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Download, Loader2, PackageSearch, RefreshCw, Search, ShieldCheck, Star, TriangleAlert } from "lucide-react";
import { searchPluginMarketplace, type MarketplacePlugin } from "@/api/plugins";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type MarketplacePanelProps = {
  installedIds: Set<string>;
  onInstall: (plugin: MarketplacePlugin) => void;
};

const DSH_COMMUNITY_PROVIDER = "dsh-community";

const installCheckLabel = (check: MarketplacePlugin["installCheck"]) => {
  switch (check) {
    case "passed":
      return "检查通过";
    case "needs-approval":
      return "需审查";
    case "not-a-layer":
      return "非 DSH bundle";
    case "failed":
      return "检查失败";
    case "timeout":
      return "检查超时";
    default:
      return "未检查";
  }
};

const canInstall = (plugin: MarketplacePlugin) =>
  Boolean(plugin.npmPackage) &&
  plugin.installable &&
  plugin.installCheck !== "not-a-layer" &&
  plugin.installCheck !== "failed";

export const MarketplacePanel = ({ installedIds, onInstall }: MarketplacePanelProps) => {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [plugins, setPlugins] = useState<MarketplacePlugin[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const requestId = useRef(0);

  const load = useCallback(async (nextQuery: string, nextPage: number) => {
    const currentRequest = ++requestId.current;
    setIsLoading(true);
    setError("");
    try {
      const result = await searchPluginMarketplace(DSH_COMMUNITY_PROVIDER, nextQuery, nextPage, 20);
      if (currentRequest !== requestId.current) return;
      setPlugins(result.results);
      setTotal(result.total);
    } catch (caught) {
      if (currentRequest === requestId.current) setError(String(caught));
    } finally {
      if (currentRequest === requestId.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(query, page);
  }, [load, page, query]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const nextQuery = input.trim();
    if (page === 1 && query === nextQuery) void load(nextQuery, 1);
    else {
      setPage(1);
      setQuery(nextQuery);
    }
  };

  return (
    <div className="space-y-4">
      <Alert className="bg-card/45">
        <ShieldCheck />
        <AlertTitle>独立社区目录</AlertTitle>
        <AlertDescription>
          数据来自 dshmarketplace.dev，不代表 DeepSeek 官方背书。Isle 当前只安装已发布到 npm 的 DSH
          bundle，且禁用安装脚本；目前运行兼容面以 Cordis 工具与技能为主。
        </AlertDescription>
      </Alert>

      <form className="flex gap-2" onSubmit={submit} role="search">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            className="h-10 pl-9"
            placeholder="搜索插件名、作者或功能"
            aria-label="搜索 DSH 社区插件"
          />
        </div>
        <Button type="submit" className="h-10" disabled={isLoading}>
          {isLoading ? (
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
          ) : (
            <Search className="size-4" />
          )}
          <span className="max-sm:hidden">搜索</span>
        </Button>
      </form>

      {error ? (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>社区目录暂时不可用</AlertTitle>
          <AlertDescription className="break-words">{error}</AlertDescription>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="col-span-2 mt-2 w-fit"
            onClick={() => void load(query, page)}
          >
            <RefreshCw className="size-3.5" />
            重试
          </Button>
        </Alert>
      ) : null}

      {isLoading && plugins.length === 0 ? (
        <div className="flex min-h-72 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
          <span>正在读取社区插件目录</span>
        </div>
      ) : plugins.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/45">
          <div className="flex min-h-11 items-center justify-between border-b border-border/70 px-4">
            <span className="text-xs font-semibold tracking-wide text-muted-foreground">
              {query ? `“${query}”的搜索结果` : "社区热门插件"}
            </span>
            <span className="text-xs tabular-nums text-muted-foreground">共 {total.toLocaleString()} 项</span>
          </div>
          {plugins.map((plugin) => {
            const installed = Boolean(plugin.npmPackage && installedIds.has(plugin.npmPackage));
            const installable = canInstall(plugin);
            return (
              <article
                key={plugin.fullName}
                className="grid min-h-32 grid-cols-[minmax(0,1fr)_auto] gap-4 border-b border-border/70 px-4 py-4 last:border-b-0 max-sm:grid-cols-1"
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h3 className="truncate text-sm font-semibold tracking-[-0.01em]">{plugin.name}</h3>
                    <Badge variant={plugin.installCheck === "passed" ? "secondary" : "outline"}>
                      {installCheckLabel(plugin.installCheck)}
                    </Badge>
                    {plugin.category ? <Badge variant="outline">{plugin.category}</Badge> : null}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">
                    {plugin.summaryZh || plugin.summary || "暂无插件描述"}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{plugin.owner}</span>
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <Star className="size-3.5" /> {plugin.stars.toLocaleString()}
                    </span>
                    {plugin.language ? <span>{plugin.language}</span> : null}
                    {plugin.license ? <span>{plugin.license}</span> : null}
                    {plugin.riskFlags.slice(0, 2).map((risk) => (
                      <span key={risk} className="text-amber-700 dark:text-amber-400">
                        {risk}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-end max-sm:justify-start">
                  <Button
                    type="button"
                    variant={installed ? "outline" : "default"}
                    size="sm"
                    disabled={installed || !installable}
                    title={!plugin.npmPackage ? "当前仅支持 npm 发布包" : undefined}
                    onClick={() => onInstall(plugin)}
                  >
                    <Download className="size-3.5" />
                    <span>{installed ? "已安装" : installable ? "安装" : "暂不支持"}</span>
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      ) : !error ? (
        <div className="app-empty-state flex min-h-72 flex-col items-center justify-center gap-3 rounded-2xl px-6 text-center">
          <PackageSearch className="size-7 text-muted-foreground" />
          <div>
            <h2 className="font-semibold">没有找到匹配插件</h2>
            <p className="mt-1 text-sm text-muted-foreground">换一个关键词，或清空搜索查看社区目录。</p>
          </div>
        </div>
      ) : null}

      {plugins.length > 0 ? (
        <div className="flex items-center justify-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1 || isLoading}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            上一页
          </Button>
          <span className="text-xs tabular-nums text-muted-foreground">第 {page} 页</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page * 20 >= total || isLoading}
            onClick={() => setPage((value) => value + 1)}
          >
            下一页
          </Button>
        </div>
      ) : null}
    </div>
  );
};
