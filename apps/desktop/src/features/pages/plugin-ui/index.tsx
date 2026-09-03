import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Blocks,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Settings2,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { NavLink, useParams } from "react-router";
import type { DshPluginUiPlugin } from "@/api/plugins";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePluginCatalogStore } from "./catalog-store";
import { PluginFrame } from "./plugin-frame";
import { PluginToolWorkbench } from "./tool-workbench";

const pluginStatus = (plugin: DshPluginUiPlugin) => {
  if (plugin.error) {
    return {
      label: "加载失败",
      icon: AlertCircle,
      className: "text-destructive",
    };
  }
  if (plugin.uiError) {
    return {
      label: "界面已降级",
      icon: TriangleAlert,
      className: "text-amber-700 dark:text-amber-300",
    };
  }
  return {
    label: "运行正常",
    icon: CheckCircle2,
    className: "text-emerald-700 dark:text-emerald-300",
  };
};

const pluginSurfaceLabel = (plugin: DshPluginUiPlugin) => {
  if (plugin.ui?.kind === "sandbox") return "独立界面";
  return "工具面板";
};

const PluginIcon = ({ className }: { className?: string }) => <Blocks className={className} />;

const LoadingState = () => (
  <div className="flex min-h-72 items-center justify-center gap-2 text-sm text-muted-foreground">
    <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
    正在读取插件
  </div>
);

const PluginCatalog = ({
  plugins,
  isLoading,
  error,
  refresh,
}: {
  plugins: DshPluginUiPlugin[];
  isLoading: boolean;
  error: string;
  refresh: () => Promise<void>;
}) => (
  <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-surface/45">
    <header className="flex min-h-20 flex-wrap items-center justify-between gap-4 border-b border-border/70 bg-card/50 px-6 py-4 max-sm:px-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Blocks className="size-5 text-primary" />
          <h1 className="truncate text-lg font-semibold tracking-[-0.02em]">插件</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">浏览已启用插件，进入详情后使用完整能力</p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11"
          disabled={isLoading}
          onClick={() => void refresh()}
        >
          <RefreshCw className={cn("size-3.5", isLoading && "animate-spin motion-reduce:animate-none")} />
          刷新
        </Button>
        <Button asChild type="button" variant="ghost" size="sm" className="min-h-11">
          <NavLink to="/plugins/manage">
            <Settings2 className="size-3.5" />
            管理
          </NavLink>
        </Button>
      </div>
    </header>

    <main id="plugin-main" className="min-h-0 flex-1 overflow-y-auto p-6 focus:outline-none max-sm:p-4" tabIndex={-1}>
      <div className="mx-auto w-full max-w-7xl">
        {error ? (
          <Alert variant="destructive" className="mb-5" role="alert">
            <AlertCircle />
            <AlertTitle>Plugin UI Host 不可用</AlertTitle>
            <AlertDescription className="break-words">{error}</AlertDescription>
          </Alert>
        ) : null}

        {isLoading && plugins.length === 0 ? (
          <LoadingState />
        ) : plugins.length > 0 ? (
          <>
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold">已启用插件</h2>
                <p className="mt-1 text-sm text-muted-foreground">选择一个插件查看介绍并进入操作页面。</p>
              </div>
              <Badge variant="secondary" className="shrink-0">
                {plugins.length} 个
              </Badge>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {plugins.map((plugin) => {
                const status = pluginStatus(plugin);
                const StatusIcon = status.icon;
                return (
                  <NavLink
                    key={plugin.id}
                    to={`/plugins/${encodeURIComponent(plugin.id)}`}
                    className="group flex min-h-64 cursor-pointer flex-col rounded-2xl border border-border/70 bg-card/55 p-5 transition-[border-color,background-color,box-shadow] duration-200 hover:border-primary/30 hover:bg-card hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none motion-reduce:transition-none"
                    aria-label={`打开插件 ${plugin.name}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
                        <PluginIcon className="size-5" />
                      </span>
                      <span className={cn("flex items-center gap-1.5 text-xs font-medium", status.className)}>
                        <StatusIcon className="size-3.5" />
                        {status.label}
                      </span>
                    </div>

                    <div className="mt-5 min-w-0 flex-1">
                      <h3 className="truncate text-base font-semibold tracking-[-0.01em]">{plugin.name}</h3>
                      <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">
                        {plugin.description || "该插件没有提供描述。"}
                      </p>
                    </div>

                    <div className="mt-5 flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">v{plugin.version || "0.0.0"}</Badge>
                      <Badge variant="outline">{plugin.source === "bundled" ? "内置" : "外部"}</Badge>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Wrench className="size-3.5" />
                        {plugin.tools.length} 个工具
                      </span>
                    </div>

                    <div className="mt-4 flex min-h-11 items-center justify-between border-t border-border/70 pt-4 text-sm">
                      <span className="text-muted-foreground">{pluginSurfaceLabel(plugin)}</span>
                      <span className="flex items-center gap-1 font-medium text-primary">
                        查看插件
                        <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" />
                      </span>
                    </div>
                  </NavLink>
                );
              })}
            </div>
          </>
        ) : (
          <div className="flex min-h-72 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border/80 bg-card/30 p-8 text-center">
            <span className="flex size-12 items-center justify-center rounded-xl bg-accent text-primary">
              <Blocks className="size-6" />
            </span>
            <div>
              <h2 className="font-semibold">没有已启用的插件</h2>
              <p className="mt-1 text-sm text-muted-foreground">前往插件管理安装或启用插件，之后会在这里统一查看。</p>
            </div>
            <Button asChild className="min-h-11">
              <NavLink to="/plugins/manage">打开插件管理</NavLink>
            </Button>
          </div>
        )}
      </div>
    </main>
  </section>
);

const PluginDetail = ({
  plugin,
  isLoading,
  error,
  refresh,
}: {
  plugin: DshPluginUiPlugin | undefined;
  isLoading: boolean;
  error: string;
  refresh: () => Promise<void>;
}) => {
  const status = plugin ? pluginStatus(plugin) : null;
  const StatusIcon = status?.icon;
  const isImmersiveWorkbench = Boolean(
    plugin && !plugin.error && !plugin.uiError && plugin.ui?.kind === "sandbox" && plugin.ui.layout === "full",
  );

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-surface/45">
      <header className="flex min-h-16 items-center justify-between gap-3 border-b border-border/70 bg-card/70 px-4 py-2.5 max-sm:px-2">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Button asChild type="button" variant="ghost" size="icon" className="size-10 shrink-0 rounded-full">
            <NavLink to="/plugins" aria-label="返回插件列表">
              <ArrowLeft className="size-4" />
            </NavLink>
          </Button>
          {plugin ? (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
              <PluginIcon className="size-[18px]" />
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-base font-semibold tracking-[-0.015em]">{plugin?.name || "插件详情"}</h1>
              {plugin ? (
                <Badge variant="secondary" className="h-5 shrink-0 px-2 text-[11px] font-normal">
                  v{plugin.version || "0.0.0"}
                </Badge>
              ) : null}
            </div>
            {plugin ? (
              <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                {status && StatusIcon ? (
                  <span className={cn("flex shrink-0 items-center gap-1", status.className)}>
                    <StatusIcon className="size-3" />
                    {status.label}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-10 rounded-full"
            disabled={isLoading}
            onClick={() => void refresh()}
            aria-label="刷新插件"
          >
            <RefreshCw className={cn("size-3.5", isLoading && "animate-spin motion-reduce:animate-none")} />
          </Button>
          <Button asChild type="button" variant="ghost" size="icon" className="size-10 rounded-full">
            <NavLink to="/plugins/manage" aria-label="管理插件">
              <Settings2 className="size-3.5" />
            </NavLink>
          </Button>
        </div>
      </header>

      <main
        id="plugin-main"
        className={cn(
          "min-h-0 flex-1 focus:outline-none",
          isImmersiveWorkbench ? "overflow-hidden p-0" : "overflow-y-auto p-4 sm:p-5",
        )}
        tabIndex={-1}
      >
        <div className={cn(isImmersiveWorkbench ? "h-full w-full" : "mx-auto w-full max-w-[1440px] space-y-4")}>
          {error ? (
            <Alert variant="destructive" role="alert">
              <AlertCircle />
              <AlertTitle>Plugin UI Host 不可用</AlertTitle>
              <AlertDescription className="break-words">{error}</AlertDescription>
            </Alert>
          ) : null}

          {isLoading && !plugin ? (
            <LoadingState />
          ) : plugin ? (
            <>
              {plugin.error ? (
                <Alert variant="destructive" role="alert">
                  <AlertCircle />
                  <AlertTitle>插件加载失败</AlertTitle>
                  <AlertDescription className="break-words">{plugin.error}</AlertDescription>
                </Alert>
              ) : (
                <>
                  {plugin.uiError ? (
                    <Alert variant="destructive" role="alert">
                      <AlertCircle />
                      <AlertTitle>插件 UI 声明无效，已回退到通用页面</AlertTitle>
                      <AlertDescription className="break-words">{plugin.uiError}</AlertDescription>
                    </Alert>
                  ) : null}
                  {plugin.dshClient && !plugin.ui ? (
                    <Alert role="status">
                      <AlertCircle />
                      <AlertTitle>检测到 DeepSeek Web Client</AlertTitle>
                      <AlertDescription>
                        该界面依赖 DeepSeek 自己的 Client Runtime；Isle 当前使用通用工具页面。插件可以同时声明 isle.ui
                        以提供可移植界面。
                      </AlertDescription>
                    </Alert>
                  ) : null}
                  {!plugin.uiError && plugin.ui?.kind === "sandbox" ? (
                    <PluginFrame plugin={plugin} />
                  ) : (
                    <PluginToolWorkbench plugin={plugin} />
                  )}
                </>
              )}
            </>
          ) : (
            <div className="flex min-h-72 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border/80 bg-card/30 p-8 text-center">
              <span className="flex size-12 items-center justify-center rounded-xl bg-accent text-primary">
                <AlertCircle className="size-6" />
              </span>
              <div>
                <h2 className="font-semibold">没有找到这个插件</h2>
                <p className="mt-1 text-sm text-muted-foreground">它可能已被停用、移除，或者链接已经失效。</p>
              </div>
              <Button asChild variant="outline" className="min-h-11">
                <NavLink to="/plugins">返回插件列表</NavLink>
              </Button>
            </div>
          )}
        </div>
      </main>
    </section>
  );
};

export const PluginUiPage = () => {
  const { pluginId } = useParams();
  const catalog = usePluginCatalogStore((state) => state.catalog);
  const isLoading = usePluginCatalogStore((state) => state.isLoading);
  const error = usePluginCatalogStore((state) => state.error);
  const refresh = usePluginCatalogStore((state) => state.refresh);
  const hasRequestedCatalog = useRef(false);
  const selected = useMemo(() => catalog.plugins.find((plugin) => plugin.id === pluginId), [catalog.plugins, pluginId]);

  useEffect(() => {
    if (!hasRequestedCatalog.current && catalog.plugins.length === 0 && !isLoading) {
      hasRequestedCatalog.current = true;
      void refresh();
    }
  }, [catalog.plugins.length, isLoading, refresh]);

  useEffect(() => {
    document.querySelector<HTMLElement>("#plugin-main")?.focus({ preventScroll: true });
  }, [pluginId]);

  return pluginId ? (
    <PluginDetail plugin={selected} isLoading={isLoading} error={error} refresh={refresh} />
  ) : (
    <PluginCatalog plugins={catalog.plugins} isLoading={isLoading} error={error} refresh={refresh} />
  );
};
