import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Blocks,
  CheckCircle2,
  Loader2,
  Maximize2,
  RefreshCw,
  Settings2,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { NavLink, useParams } from "react-router";
import type { ApplicationUiApplication } from "@/api/applications";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useApplicationLayout } from "@/features/shell/layout/application-layout";
import { useApplicationCatalogStore } from "./catalog-store";
import { ApplicationFrame } from "./application-frame";
import { ApplicationPermissionSummary } from "./permission-summary";
import { ApplicationToolWorkbench } from "./tool-workbench";

const applicationStatus = (application: ApplicationUiApplication) => {
  if (application.error) {
    return {
      label: "加载失败",
      icon: AlertCircle,
      className: "text-destructive",
    };
  }
  if (application.uiError) {
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

const applicationSurfaceLabel = (application: ApplicationUiApplication) => {
  if (application.ui?.kind === "sandbox") return "独立界面";
  return "工具面板";
};

const ApplicationIcon = ({ className }: { className?: string }) => <Blocks className={className} />;

const LoadingState = () => (
  <div className="flex min-h-72 items-center justify-center gap-2 text-sm text-muted-foreground">
    <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
    正在读取应用
  </div>
);

const ApplicationCard = ({ application }: { application: ApplicationUiApplication }) => {
  const status = applicationStatus(application);
  const StatusIcon = status.icon;
  return (
    <article className="flex min-w-0 flex-col rounded-xl border border-border/80 bg-card p-4 transition-[border-color,box-shadow] duration-150 hover:border-primary/25 hover:shadow-sm motion-reduce:transition-none">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
          <ApplicationIcon className="size-5" />
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold" title={application.name}>
            {application.name}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="tabular-nums">v{application.version || "0.0.0"}</span>
            <span aria-hidden="true">·</span>
            <span>{application.source === "bundled" ? "内置" : "外部"}</span>
            {application.runtimeKind === "dsh" && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] leading-4">DSH 兼容</span>
            )}
          </div>
        </div>
      </div>
      <p
        className="mt-3 min-h-10 line-clamp-2 text-sm leading-5 text-muted-foreground"
        title={application.description || undefined}
      >
        {application.description || "该应用没有提供描述。"}
      </p>
      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Wrench className="size-3.5" aria-hidden="true" />
          {application.tools.length} 个工具
        </span>
        <span aria-hidden="true">·</span>
        <span>{applicationSurfaceLabel(application)}</span>
      </div>
      <div className="mt-auto pt-4">
        <ApplicationPermissionSummary
          permissions={application.permissions}
          agentAccess={application.agentAccess}
          status={application.permissionStatus}
          compact
          className="h-26"
        />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className={cn("inline-flex items-center gap-1.5 text-xs", status.className)}>
          <StatusIcon className="size-3.5 shrink-0" aria-hidden="true" />
          {status.label}
        </span>
        <Button asChild variant="outline" size="sm" className="min-h-9 px-3 text-xs shadow-none">
          <NavLink to={`/apps/${encodeURIComponent(application.id)}`} aria-label={`打开应用 ${application.name}`}>
            打开应用
            <ArrowRight className="size-3.5" />
          </NavLink>
        </Button>
      </div>
    </article>
  );
};

const ApplicationCatalog = ({
  applications,
  isLoading,
  error,
  refresh,
}: {
  applications: ApplicationUiApplication[];
  isLoading: boolean;
  error: string;
  refresh: () => Promise<void>;
}) => (
  <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-surface/45">
    <header className="flex min-h-20 flex-wrap items-center justify-between gap-4 border-b border-border/70 bg-card/50 px-6 py-4 max-sm:px-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Blocks className="size-5 text-primary" />
          <h1 className="truncate text-lg font-semibold tracking-[-0.02em]">应用</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">浏览已启用应用，进入详情后使用完整能力</p>
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
          <NavLink to="/apps/manage">
            <Settings2 className="size-3.5" />
            管理
          </NavLink>
        </Button>
      </div>
    </header>

    <main id="application-main" className="min-h-0 flex-1 overflow-y-auto p-6 focus:outline-none max-sm:p-4" tabIndex={-1}>
      <div className="mx-auto w-full max-w-7xl">
        {error ? (
          <Alert variant="destructive" className="mb-5" role="alert">
            <AlertCircle />
            <AlertTitle>Application UI Host 不可用</AlertTitle>
            <AlertDescription className="break-words">{error}</AlertDescription>
          </Alert>
        ) : null}

        {isLoading && applications.length === 0 ? (
          <LoadingState />
        ) : applications.length > 0 ? (
          <>
            <div className="mb-4 flex items-center gap-2">
              <h2 className="text-sm font-medium">已启用应用</h2>
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
                {applications.length}
              </span>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {applications.map((application) => (
                <ApplicationCard key={application.id} application={application} />
              ))}
            </div>
          </>
        ) : (
          <div className="flex min-h-72 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border/80 bg-card/30 p-8 text-center">
            <span className="flex size-12 items-center justify-center rounded-xl bg-accent text-primary">
              <Blocks className="size-6" />
            </span>
            <div>
              <h2 className="font-semibold">没有已启用的应用</h2>
              <p className="mt-1 text-sm text-muted-foreground">前往应用管理安装或启用应用，之后会在这里统一查看。</p>
            </div>
            <Button asChild className="min-h-11">
              <NavLink to="/apps/manage">打开应用管理</NavLink>
            </Button>
          </div>
        )}
      </div>
    </main>
  </section>
);

const ApplicationDetail = ({
  application,
  isLoading,
  error,
  refresh,
}: {
  application: ApplicationUiApplication | undefined;
  isLoading: boolean;
  error: string;
  refresh: () => Promise<void>;
}) => {
  const { fullscreen, canFullscreen, setFullscreen } = useApplicationLayout();
  const status = application ? applicationStatus(application) : null;
  const StatusIcon = status?.icon;
  const isImmersiveWorkbench = Boolean(
    application &&
    !application.error &&
    !application.uiError &&
    application.ui?.kind === "sandbox" &&
    (application.ui.layout === "full" || application.ui.layout === "fullscreen"),
  );

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-surface/45">
      <header
        className={cn(
          "min-h-16 items-center justify-between gap-3 border-b border-border/70 bg-card/70 px-4 py-2.5 max-sm:px-2",
          fullscreen ? "hidden" : "flex",
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Button asChild type="button" variant="ghost" size="icon" className="size-10 shrink-0 rounded-full">
            <NavLink to="/apps" aria-label="返回应用列表">
              <ArrowLeft className="size-4" />
            </NavLink>
          </Button>
          {application ? (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
              <ApplicationIcon className="size-[18px]" />
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-base font-semibold tracking-[-0.015em]">{application?.name || "应用详情"}</h1>
              {application ? (
                <Badge variant="secondary" className="h-5 shrink-0 px-2 text-[11px] font-normal">
                  v{application.version || "0.0.0"}
                </Badge>
              ) : null}
            </div>
            {application ? (
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
          {canFullscreen ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-10 rounded-full"
              onClick={() => setFullscreen(true)}
              aria-label="进入应用全屏"
              title="进入应用全屏"
            >
              <Maximize2 className="size-4" />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-10 rounded-full"
            disabled={isLoading}
            onClick={() => void refresh()}
            aria-label="刷新应用"
          >
            <RefreshCw className={cn("size-3.5", isLoading && "animate-spin motion-reduce:animate-none")} />
          </Button>
          <Button asChild type="button" variant="ghost" size="icon" className="size-10 rounded-full">
            <NavLink to="/apps/manage" aria-label="管理应用">
              <Settings2 className="size-3.5" />
            </NavLink>
          </Button>
        </div>
      </header>

      <main
        id="application-main"
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
              <AlertTitle>Application UI Host 不可用</AlertTitle>
              <AlertDescription className="break-words">{error}</AlertDescription>
            </Alert>
          ) : null}

          {isLoading && !application ? (
            <LoadingState />
          ) : application ? (
            <>
              {application.error ? (
                <Alert variant="destructive" role="alert">
                  <AlertCircle />
                  <AlertTitle>应用加载失败</AlertTitle>
                  <AlertDescription className="break-words">{application.error}</AlertDescription>
                </Alert>
              ) : (
                <>
                  {application.uiError ? (
                    <Alert variant="destructive" role="alert">
                      <AlertCircle />
                      <AlertTitle>应用 UI 声明无效，已回退到通用页面</AlertTitle>
                      <AlertDescription className="break-words">{application.uiError}</AlertDescription>
                    </Alert>
                  ) : null}
                  {application.compatibility.some((item) => item.adapter === "dsh" && "clientPlatform" in item) &&
                  !application.ui ? (
                    <Alert role="status">
                      <AlertCircle />
                      <AlertTitle>检测到 DeepSeek Web Client</AlertTitle>
                      <AlertDescription>
                        该界面依赖 DeepSeek 自己的 Client Runtime；Isle 当前使用通用工具页面。应用可以同时声明 isle.ui
                        以提供可移植界面。
                      </AlertDescription>
                    </Alert>
                  ) : null}
                  {!application.uiError && application.ui?.kind === "sandbox" ? (
                    <ApplicationFrame key={application.id} application={application} />
                  ) : (
                    <ApplicationToolWorkbench application={application} />
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
                <h2 className="font-semibold">没有找到这个应用</h2>
                <p className="mt-1 text-sm text-muted-foreground">它可能已被停用、移除，或者链接已经失效。</p>
              </div>
              <Button asChild variant="outline" className="min-h-11">
                <NavLink to="/apps">返回应用列表</NavLink>
              </Button>
            </div>
          )}
        </div>
      </main>
    </section>
  );
};

export const ApplicationUiPage = () => {
  const { applicationId } = useParams();
  const catalog = useApplicationCatalogStore((state) => state.catalog);
  const isLoading = useApplicationCatalogStore((state) => state.isLoading);
  const error = useApplicationCatalogStore((state) => state.error);
  const refresh = useApplicationCatalogStore((state) => state.refresh);
  const hasRequestedCatalog = useRef(false);
  const selected = useMemo(() => catalog.applications.find((application) => application.id === applicationId), [catalog.applications, applicationId]);

  useEffect(() => {
    if (!hasRequestedCatalog.current && catalog.applications.length === 0 && !isLoading) {
      hasRequestedCatalog.current = true;
      void refresh();
    }
  }, [catalog.applications.length, isLoading, refresh]);

  useEffect(() => {
    document.querySelector<HTMLElement>("#application-main")?.focus({ preventScroll: true });
  }, [applicationId]);

  return applicationId ? (
    <ApplicationDetail application={selected} isLoading={isLoading} error={error} refresh={refresh} />
  ) : (
    <ApplicationCatalog applications={catalog.applications} isLoading={isLoading} error={error} refresh={refresh} />
  );
};
