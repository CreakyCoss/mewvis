import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, PackageOpen, PackagePlus, Plug, RefreshCw, Trash2 } from "lucide-react";
import { NavLink } from "react-router";
import { toast } from "sonner";
import {
  listApplications,
  removeApplication,
  setApplicationEnabled,
  type MarketplaceApplication,
  type ApplicationDescriptor,
} from "@/api/applications";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "design-system/components/ui/alert-dialog";
import { Badge } from "design-system/components/ui/badge";
import { Button } from "design-system/components/ui/button";
import { ScrollArea } from "design-system/components/ui/scroll-area";
import { Switch } from "design-system/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "design-system/components/ui/tabs";
import { useApplicationCatalogStore } from "../catalog-store";
import { ImportApplicationDialog } from "./import-dialog";
import { MarketplaceInstallDialog } from "./market-install-dialog";
import { MarketplacePanel } from "./marketplace-panel";
import { ApplicationPermissionSummary } from "../permission-summary";
import { ApplicationToolPermissions } from "./tool-permissions";

type ApplicationRowProps = {
  application: ApplicationDescriptor;
  isUpdating: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onRemove: () => void;
};

const ApplicationRow = ({ application, isUpdating, onEnabledChange, onRemove }: ApplicationRowProps) => (
  <div className="grid min-h-24 grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-4 border-b border-border/70 px-4 py-4 last:border-b-0 max-sm:grid-cols-[2.5rem_minmax(0,1fr)] max-sm:gap-x-3">
    <span className="flex size-10 items-center justify-center rounded-xl bg-accent/75 text-primary">
      <Plug className="size-5 stroke-[1.8]" />
    </span>

    <div className="min-w-0">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <h3 className="truncate text-sm font-semibold tracking-[-0.01em]">{application.name}</h3>
        <Badge variant={application.source === "bundled" ? "primary" : "outline"}>
          {application.source === "bundled" ? "内置" : application.origin?.kind === "marketplace" ? "社区" : "本地"}
        </Badge>
        <Badge variant="outline">{application.runtimeKind === "isle" ? "Isle 原生" : "DSH 兼容"}</Badge>
        {application.runtimeKind === "isle" && application.compatibility.some((item) => item.adapter === "dsh") ? (
          <Badge variant="outline">兼容 DSH</Badge>
        ) : null}
        <span className="text-xs text-muted-foreground">v{application.version || "0.0.0"}</span>
      </div>
      <p className="mt-1 line-clamp-1 text-sm leading-5 text-muted-foreground">
        {application.description || "暂无应用描述"}
      </p>
      <p className="mt-1 flex min-w-0 items-center gap-2 font-mono text-[11px] leading-4 text-muted-foreground">
        <span className="max-w-[50%] shrink-0 truncate select-text" title={application.id}>
          {application.id}
        </span>
        {application.dataDirectory ? (
          <>
            <span className="h-3 w-px shrink-0 bg-border" aria-hidden="true" />
            <span
              className="min-w-0 truncate text-muted-foreground/80 select-text"
              title={`数据目录：${application.dataDirectory}`}
            >
              {application.dataDirectory}
            </span>
          </>
        ) : null}
      </p>
      <ApplicationPermissionSummary
        permissions={application.permissions}
        agentAccess={application.agentAccess}
        status={application.permissionStatus}
        compact
        className="mt-2 max-w-xl"
      />
    </div>

    <div className="flex min-w-36 items-center justify-end gap-3 max-sm:col-span-2 max-sm:ml-[3.25rem] max-sm:min-w-0 max-sm:flex-wrap max-sm:justify-between">
      <ApplicationToolPermissions application={application} disabled={isUpdating} />
      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
        {isUpdating ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" /> : null}
        <span>
          {application.permissionStatus === "isle-upgrade-required"
            ? "需要升级"
            : application.enabled
              ? "已启用"
              : "未启用"}
        </span>
        <Switch
          checked={application.enabled}
          onCheckedChange={onEnabledChange}
          disabled={isUpdating || application.permissionStatus === "isle-upgrade-required"}
          aria-label={`${application.enabled ? "禁用" : "启用"}应用 ${application.name}`}
        />
      </label>

      {application.source === "installed" ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          title={`卸载 ${application.name}`}
          aria-label={`卸载应用 ${application.name}`}
          onClick={onRemove}
          disabled={isUpdating}
        >
          <Trash2 className="size-4" />
        </Button>
      ) : (
        <span className="size-9" aria-hidden="true" />
      )}
    </div>
  </div>
);

const ApplicationSection = ({
  title,
  applications,
  emptyText,
  onToggle,
  onRemove,
  pendingIds,
}: {
  title: string;
  applications: ApplicationDescriptor[];
  emptyText: string;
  onToggle: (application: ApplicationDescriptor, enabled: boolean) => void;
  onRemove: (application: ApplicationDescriptor) => void;
  pendingIds: Set<string>;
}) => (
  <section aria-labelledby={`application-section-${title}`}>
    <div className="flex min-h-11 items-center justify-between border-b border-border/70 px-4">
      <h2 id={`application-section-${title}`} className="text-xs font-semibold tracking-wide text-muted-foreground">
        {title}
      </h2>
      <span className="text-xs tabular-nums text-muted-foreground">{applications.length}</span>
    </div>
    {applications.length > 0 ? (
      applications.map((application) => (
        <ApplicationRow
          key={application.id}
          application={application}
          isUpdating={pendingIds.has(application.id)}
          onEnabledChange={(enabled) => onToggle(application, enabled)}
          onRemove={() => onRemove(application)}
        />
      ))
    ) : (
      <div className="flex min-h-28 items-center gap-3 px-4 text-sm text-muted-foreground">
        <PackageOpen className="size-5" />
        <span>{emptyText}</span>
      </div>
    )}
  </section>
);

export const ApplicationManagePage = () => {
  const refreshApplicationUi = useApplicationCatalogStore((state) => state.refresh);
  const [applications, setApplications] = useState<ApplicationDescriptor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("installed");
  const [marketplaceInstall, setMarketplaceInstall] = useState<MarketplaceApplication | null>(null);
  const [pendingEnable, setPendingEnable] = useState<ApplicationDescriptor | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<ApplicationDescriptor | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const loadApplications = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      setApplications(await listApplications());
    } catch (caught) {
      setError(String(caught));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadApplications();
  }, [loadApplications]);

  const groupedApplications = useMemo(
    () => ({
      bundled: applications.filter((application) => application.source === "bundled"),
      installed: applications.filter((application) => application.source === "installed"),
    }),
    [applications],
  );
  const installedIds = useMemo(() => new Set(applications.map((application) => application.id)), [applications]);

  const setPending = (id: string, pending: boolean) => {
    setPendingIds((current) => {
      const next = new Set(current);
      if (pending) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleToggle = async (application: ApplicationDescriptor, enabled: boolean) => {
    setPending(application.id, true);
    setError("");
    try {
      const updated = await setApplicationEnabled(application.id, enabled);
      setApplications((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      void refreshApplicationUi();
      toast.success(enabled ? "应用已启用" : "应用已停用", { description: application.name });
    } catch (caught) {
      setError(String(caught));
    } finally {
      setPending(application.id, false);
    }
  };

  const handleRemove = async () => {
    if (!pendingRemoval) return;
    setIsRemoving(true);
    setError("");
    try {
      await removeApplication(pendingRemoval.id);
      setApplications((current) => current.filter((application) => application.id !== pendingRemoval.id));
      void refreshApplicationUi();
      toast.success("应用已卸载", { description: pendingRemoval.name });
      setPendingRemoval(null);
    } catch (caught) {
      setError(String(caught));
      setPendingRemoval(null);
    } finally {
      setIsRemoving(false);
    }
  };

  const requestToggle = (application: ApplicationDescriptor, enabled: boolean) => {
    if (enabled && application.source === "installed") {
      setPendingEnable(application);
      return;
    }
    void handleToggle(application, enabled);
  };

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-surface/45">
      <header className="flex min-h-20 shrink-0 items-center justify-between gap-4 border-b border-border/70 bg-card/50 px-6 py-4 max-sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Button asChild type="button" variant="ghost" size="icon" className="size-11 shrink-0 rounded-full">
            <NavLink to="/apps" aria-label="返回应用列表">
              <ArrowLeft className="size-4" />
            </NavLink>
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold tracking-[-0.02em]">应用管理</h1>
            <p className="mt-1 truncate text-sm text-muted-foreground">安装、启停和维护 Isle 应用与兼容应用</p>
          </div>
        </div>
        <Button type="button" className="min-h-11 shrink-0" onClick={() => setIsImportOpen(true)} title="导入本地应用">
          <PackagePlus className="size-4" />
          <span className="max-sm:hidden">导入应用</span>
        </Button>
      </header>

      <ScrollArea className="min-h-0 flex-1 bg-transparent">
        <div className="w-full px-6 pt-4 pb-6 max-sm:px-4">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-3">
            <TabsList variant="line">
              <TabsTrigger value="installed">已安装</TabsTrigger>
              <TabsTrigger value="marketplace">社区市场</TabsTrigger>
            </TabsList>

            <TabsContent value="installed">
              {error ? (
                <div
                  role="alert"
                  className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
                >
                  <span className="min-w-0 break-words">{error}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => void loadApplications()}>
                    <RefreshCw className="size-3.5" />
                    <span>重试</span>
                  </Button>
                </div>
              ) : null}

              {isLoading ? (
                <div className="flex min-h-72 items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                  <span>正在读取应用注册表</span>
                </div>
              ) : applications.length > 0 ? (
                <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/45">
                  <ApplicationSection
                    title="内置应用"
                    applications={groupedApplications.bundled}
                    emptyText="当前版本没有内置 DSH 应用。"
                    onToggle={requestToggle}
                    onRemove={setPendingRemoval}
                    pendingIds={pendingIds}
                  />
                  <ApplicationSection
                    title="本地与市场安装"
                    applications={groupedApplications.installed}
                    emptyText="还没有安装外部应用。"
                    onToggle={requestToggle}
                    onRemove={setPendingRemoval}
                    pendingIds={pendingIds}
                  />
                </div>
              ) : (
                <div className="app-empty-state mt-4 flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-2xl px-6 text-center">
                  <span className="flex size-12 items-center justify-center rounded-xl bg-accent text-primary">
                    <Plug className="size-6" />
                  </span>
                  <div className="space-y-1">
                    <h2 className="font-semibold">还没有可用应用</h2>
                    <p className="text-sm text-muted-foreground">从社区市场安装，或从本地目录导入 DSH 应用。</p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button type="button" onClick={() => setActiveTab("marketplace")}>
                      浏览社区市场
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setIsImportOpen(true)}>
                      <PackagePlus className="size-4" />
                      <span>本地导入</span>
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="marketplace">
              <MarketplacePanel installedIds={installedIds} onInstall={setMarketplaceInstall} />
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>

      <ImportApplicationDialog
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        onInstalled={async () => {
          await loadApplications();
          await refreshApplicationUi();
        }}
      />
      <MarketplaceInstallDialog
        application={marketplaceInstall}
        onOpenChange={(open) => {
          if (!open) setMarketplaceInstall(null);
        }}
        onInstalled={async () => {
          await loadApplications();
          await refreshApplicationUi();
        }}
      />

      <AlertDialog open={Boolean(pendingEnable)} onOpenChange={(open) => !open && setPendingEnable(null)}>
        <AlertDialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>启用“{pendingEnable?.name ?? ""}”？</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingEnable?.permissionStatus === "dsh-unsupported"
                ? "该 DSH 兼容应用没有 Isle 权限声明。启用后会以受信任模式执行 Node.js 代码，请确认应用来源可靠。"
                : "启用前请确认宿主能力和 Agent 访问范围。Agent 操作会受到范围限制；应用自身的 Node.js 代码仍按受信任代码运行。"}
            </AlertDialogDescription>
            {pendingEnable ? (
              <ApplicationPermissionSummary
                permissions={pendingEnable.permissions}
                agentAccess={pendingEnable.agentAccess}
                status={pendingEnable.permissionStatus}
                className="pt-1"
              />
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                const application = pendingEnable;
                setPendingEnable(null);
                if (application) void handleToggle(application, true);
              }}
            >
              确认启用
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(pendingRemoval)}
        onOpenChange={(open) => {
          if (!open && !isRemoving) setPendingRemoval(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>卸载“{pendingRemoval?.name ?? ""}”？</AlertDialogTitle>
            <AlertDialogDescription>
              应用包会从应用数据目录中移除。该操作不会删除应用原始来源目录。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemoving}>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isRemoving}
              onClick={(event) => {
                event.preventDefault();
                void handleRemove();
              }}
            >
              {isRemoving ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> : null}
              <span>{isRemoving ? "正在卸载" : "卸载应用"}</span>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
};
