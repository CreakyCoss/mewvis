import { APP_DISPLAY_NAME, PRODUCT_NAMESPACE } from "@mewvis/product-config";
import { AlertCircle, ArrowRight, Blocks, Loader2, RefreshCw, Settings2, TriangleAlert } from "lucide-react";
import { useEffect, useId, useMemo, useRef } from "react";
import { NavLink, useParams } from "react-router";
import type { ApplicationUiApplication } from "@/api/applications";
import { Alert, AlertDescription, AlertTitle } from "design-system/components/ui/alert";
import { Button } from "design-system/components/ui/button";
import { cn } from "design-system/lib/utils";
import { PageHeader } from "../page-header";
import { useWorkspaceFullscreen } from "@/workbench/shell/layout/workspace";
import { useApplicationCatalogStore } from "./catalog-store";
import { ApplicationFrame } from "./application-frame";
import { ApplicationIcon } from "./application-icon";
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
      className: "text-warning",
    };
  }
  return null;
};

const LoadingState = () => (
  <div className="flex min-h-72 items-center justify-center gap-2 text-sm text-muted-foreground">
    <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
    正在读取应用
  </div>
);

const ApplicationCard = ({
  application,
  isLastItem,
  isLastRow,
}: {
  application: ApplicationUiApplication;
  isLastItem: boolean;
  isLastRow: boolean;
}) => {
  const titleId = useId();
  const status = applicationStatus(application);
  const StatusIcon = status?.icon;
  return (
    <article
      aria-labelledby={titleId}
      className={cn(
        "grid min-h-28 min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 border-b border-border/70 py-4 lg:odd:border-r lg:odd:pr-6 lg:even:pl-6",
        isLastItem && "border-b-0",
        isLastRow ? "lg:border-b-0" : "lg:border-b",
      )}
    >
      <ApplicationIcon
        application={application}
        className="size-14 rounded-xl"
        iconClassName="size-7"
      />
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <h2
            id={titleId}
            className="truncate text-base font-semibold tracking-[-0.01em]"
            title={application.name}
          >
            {application.name}
          </h2>
          <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] leading-4 text-muted-foreground">
            {application.source === "bundled" ? "内置" : "外部"}
          </span>
        </div>
        <p
          className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground"
          title={application.description || undefined}
        >
          {application.description || "该应用没有提供描述。"}
        </p>
        <ApplicationPermissionSummary
          permissions={application.permissions}
          agentAccess={application.agentAccess}
          status={application.permissionStatus}
          compact
          trigger="link"
          triggerLabel={`查看 ${application.name} 的权限声明`}
          className="mt-0.5 min-h-6 text-xs"
        />
        {status && StatusIcon ? (
          <span className={cn("mt-1 flex items-center gap-1.5 text-xs", status.className)}>
            <StatusIcon className="size-3.5 shrink-0" aria-hidden="true" />
            {status.label}
          </span>
        ) : null}
      </div>
      <Button
        asChild
        variant="ghost"
        size="sm"
        className="min-w-18 gap-1.5 bg-accent px-3 text-primary hover:bg-primary/15"
      >
        <NavLink to={`/apps/${encodeURIComponent(application.id)}`} aria-label={`打开应用 ${application.name}`}>
          打开
          <ArrowRight className="size-3.5" />
        </NavLink>
      </Button>
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
  <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground">
    <PageHeader
      title="应用"
      description="为你的创作，选一件顺手的工具。"
      className="max-sm:flex-wrap"
      action={
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground"
            disabled={isLoading}
            onClick={() => void refresh()}
            aria-label="刷新应用列表"
            title="刷新应用列表"
          >
            <RefreshCw className={cn("size-4", isLoading && "animate-spin motion-reduce:animate-none")} />
          </Button>
          <Button asChild type="button" variant="outline">
            <NavLink to="/apps/manage">
              <Settings2 className="size-4" />
              管理应用
            </NavLink>
          </Button>
        </div>
      }
    />

    <main
      id="application-main"
      className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 focus:outline-none lg:px-8"
      tabIndex={-1}
    >
      <div className="w-full">
        {error ? (
          <Alert variant="destructive" className="mt-6 mb-2" role="alert">
            <AlertCircle />
            <AlertTitle>Application UI Host 不可用</AlertTitle>
            <AlertDescription className="break-words">{error}</AlertDescription>
          </Alert>
        ) : null}

        {isLoading && applications.length === 0 ? (
          <LoadingState />
        ) : applications.length > 0 ? (
          <div className="grid lg:grid-cols-2">
            {applications.map((application, index) => (
              <ApplicationCard
                key={application.id}
                application={application}
                isLastItem={index === applications.length - 1}
                isLastRow={index >= applications.length - (applications.length % 2 || 2)}
              />
            ))}
          </div>
        ) : (
          <div className="flex min-h-80 flex-col items-center justify-center gap-4 p-8 text-center">
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
  const registerFullscreen = useWorkspaceFullscreen();
  const hasSandboxUi = Boolean(
    application && !application.error && !application.uiError && application.ui?.kind === "sandbox",
  );

  useEffect(() => {
    if (hasSandboxUi && application?.ui?.layout !== "workspace") return registerFullscreen?.();
  }, [application?.id, application?.ui?.layout, hasSandboxUi, registerFullscreen]);

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-surface/45">
      <main id="application-main" className="min-h-0 flex-1 overflow-hidden focus:outline-none" tabIndex={-1}>
        <div className={cn("relative h-full w-full", !hasSandboxUi && "space-y-4 overflow-y-auto p-6 max-sm:p-4")}>
          {error ? (
            <Alert
              variant="destructive"
              className={hasSandboxUi ? "absolute inset-x-4 top-4 z-20 shadow-sm" : undefined}
              role="alert"
            >
              <AlertCircle />
              <AlertTitle>Application UI Host 不可用</AlertTitle>
              <AlertDescription className="break-words">
                {error}
                <Button variant="outline" size="sm" disabled={isLoading} onClick={() => void refresh()}>
                  重新加载
                </Button>
              </AlertDescription>
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
                        该界面依赖 DeepSeek 自己的 Client Runtime；{APP_DISPLAY_NAME}{" "}
                        当前使用通用工具页面。应用可以同时声明 {PRODUCT_NAMESPACE}.ui 以提供可移植界面。
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
  const selected = useMemo(
    () => catalog.applications.find((application) => application.id === applicationId),
    [catalog.applications, applicationId],
  );

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
