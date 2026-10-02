import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Download, Loader2, PackageSearch, RefreshCw, Search, ShieldCheck, Star, TriangleAlert } from "lucide-react";
import { searchApplicationMarketplace, type MarketplaceApplication } from "@/api/applications";
import { Alert, AlertDescription, AlertTitle } from "design-system/components/ui/alert";
import { Badge } from "design-system/components/ui/badge";
import { Button } from "design-system/components/ui/button";
import { Input } from "design-system/components/ui/input";

type MarketplacePanelProps = {
  installedIds: Set<string>;
  onInstall: (application: MarketplaceApplication) => void;
};

const DSH_COMMUNITY_PROVIDER = "dsh-community";

const installCheckLabel = (check: MarketplaceApplication["installCheck"]) => {
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

const canInstall = (application: MarketplaceApplication) =>
  Boolean(application.npmPackage) &&
  application.installable &&
  application.installCheck !== "not-a-layer" &&
  application.installCheck !== "failed";

export const MarketplacePanel = ({ installedIds, onInstall }: MarketplacePanelProps) => {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [applications, setApplications] = useState<MarketplaceApplication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const requestId = useRef(0);

  const load = useCallback(async (nextQuery: string, nextPage: number) => {
    const currentRequest = ++requestId.current;
    setIsLoading(true);
    setError("");
    try {
      const result = await searchApplicationMarketplace(DSH_COMMUNITY_PROVIDER, nextQuery, nextPage, 20);
      if (currentRequest !== requestId.current) return;
      setApplications(result.results);
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
          数据来自 dshmarketplace.dev，不代表 DeepSeek 官方背书。Mewvis 当前只安装已发布到 npm 的 DSH
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
            placeholder="搜索应用名、作者或功能"
            aria-label="搜索 DSH 社区应用"
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

      {isLoading && applications.length === 0 ? (
        <div className="flex min-h-72 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
          <span>正在读取社区应用目录</span>
        </div>
      ) : applications.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/45">
          <div className="flex min-h-11 items-center justify-between border-b border-border/70 px-4">
            <span className="text-xs font-semibold tracking-wide text-muted-foreground">
              {query ? `“${query}”的搜索结果` : "社区热门应用"}
            </span>
            <span className="text-xs tabular-nums text-muted-foreground">共 {total.toLocaleString()} 项</span>
          </div>
          {applications.map((application) => {
            const installed = Boolean(application.npmPackage && installedIds.has(application.npmPackage));
            const installable = canInstall(application);
            return (
              <article
                key={application.fullName}
                className="grid min-h-32 grid-cols-[minmax(0,1fr)_auto] gap-4 border-b border-border/70 px-4 py-4 last:border-b-0 max-sm:grid-cols-1"
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h3 className="truncate text-sm font-semibold tracking-[-0.01em]">{application.name}</h3>
                    <Badge variant={application.installCheck === "passed" ? "success" : "outline"}>
                      {installCheckLabel(application.installCheck)}
                    </Badge>
                    {application.category ? <Badge variant="outline">{application.category}</Badge> : null}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">
                    {application.summaryZh || application.summary || "暂无应用描述"}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{application.owner}</span>
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <Star className="size-3.5" /> {application.stars.toLocaleString()}
                    </span>
                    {application.language ? <span>{application.language}</span> : null}
                    {application.license ? <span>{application.license}</span> : null}
                    {application.riskFlags.slice(0, 2).map((risk) => (
                      <span key={risk} className="text-warning">
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
                    title={!application.npmPackage ? "当前仅支持 npm 发布包" : undefined}
                    onClick={() => onInstall(application)}
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
            <h2 className="font-semibold">没有找到匹配应用</h2>
            <p className="mt-1 text-sm text-muted-foreground">换一个关键词，或清空搜索查看社区目录。</p>
          </div>
        </div>
      ) : null}

      {applications.length > 0 ? (
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
