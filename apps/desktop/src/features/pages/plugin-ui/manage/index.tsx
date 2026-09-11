import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, PackageOpen, PackagePlus, Plug, RefreshCw, Trash2 } from "lucide-react";
import { NavLink } from "react-router";
import { toast } from "sonner";
import {
  listPlugins,
  removePlugin,
  setPluginEnabled,
  type MarketplacePlugin,
  type PluginDescriptor,
} from "@/api/plugins";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePluginCatalogStore } from "../catalog-store";
import { ImportPluginDialog } from "./import-dialog";
import { MarketplaceInstallDialog } from "./market-install-dialog";
import { MarketplacePanel } from "./marketplace-panel";
import { PluginPermissionSummary } from "../permission-summary";

type PluginRowProps = {
  plugin: PluginDescriptor;
  isUpdating: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onRemove: () => void;
};

const PluginRow = ({ plugin, isUpdating, onEnabledChange, onRemove }: PluginRowProps) => (
  <div className="grid min-h-24 grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-4 border-b border-border/70 px-4 py-4 last:border-b-0 max-sm:grid-cols-[2.5rem_minmax(0,1fr)] max-sm:gap-x-3">
    <span className="flex size-10 items-center justify-center rounded-xl bg-accent/75 text-primary">
      <Plug className="size-5 stroke-[1.8]" />
    </span>

    <div className="min-w-0">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <h3 className="truncate text-sm font-semibold tracking-[-0.01em]">{plugin.name}</h3>
        <Badge variant={plugin.source === "bundled" ? "secondary" : "outline"}>
          {plugin.source === "bundled" ? "内置" : plugin.origin?.kind === "marketplace" ? "社区" : "本地"}
        </Badge>
        <Badge variant="outline">{plugin.runtimeKind === "isle" ? "Isle 原生" : "DSH 兼容"}</Badge>
        {plugin.runtimeKind === "isle" && plugin.compatibility.some((item) => item.adapter === "dsh") ? (
          <Badge variant="outline">兼容 DSH</Badge>
        ) : null}
        <span className="text-xs text-muted-foreground">v{plugin.version || "0.0.0"}</span>
      </div>
      <p className="mt-1 line-clamp-1 text-sm leading-5 text-muted-foreground">
        {plugin.description || "暂无插件描述"}
      </p>
      <p className="mt-1 truncate font-mono text-[11px] leading-4 text-muted-foreground/80" title={plugin.id}>
        {plugin.id}
      </p>
      <PluginPermissionSummary
        permissions={plugin.permissions}
        agentAccess={plugin.agentAccess}
        status={plugin.permissionStatus}
        compact
        className="mt-1.5"
      />
    </div>

    <div className="flex min-w-36 items-center justify-end gap-3 max-sm:col-span-2 max-sm:ml-[3.25rem] max-sm:min-w-0 max-sm:justify-between">
      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
        {isUpdating ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" /> : null}
        <span>
          {plugin.permissionStatus === "isle-upgrade-required" ? "需要升级" : plugin.enabled ? "已启用" : "未启用"}
        </span>
        <Switch
          checked={plugin.enabled}
          onCheckedChange={onEnabledChange}
          disabled={isUpdating || plugin.permissionStatus === "isle-upgrade-required"}
          aria-label={`${plugin.enabled ? "禁用" : "启用"}插件 ${plugin.name}`}
        />
      </label>

      {plugin.source === "installed" ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          title={`卸载 ${plugin.name}`}
          aria-label={`卸载插件 ${plugin.name}`}
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

const PluginSection = ({
  title,
  plugins,
  emptyText,
  onToggle,
  onRemove,
  pendingIds,
}: {
  title: string;
  plugins: PluginDescriptor[];
  emptyText: string;
  onToggle: (plugin: PluginDescriptor, enabled: boolean) => void;
  onRemove: (plugin: PluginDescriptor) => void;
  pendingIds: Set<string>;
}) => (
  <section aria-labelledby={`plugin-section-${title}`}>
    <div className="flex min-h-11 items-center justify-between border-b border-border/70 px-4">
      <h2 id={`plugin-section-${title}`} className="text-xs font-semibold tracking-wide text-muted-foreground">
        {title}
      </h2>
      <span className="text-xs tabular-nums text-muted-foreground">{plugins.length}</span>
    </div>
    {plugins.length > 0 ? (
      plugins.map((plugin) => (
        <PluginRow
          key={plugin.id}
          plugin={plugin}
          isUpdating={pendingIds.has(plugin.id)}
          onEnabledChange={(enabled) => onToggle(plugin, enabled)}
          onRemove={() => onRemove(plugin)}
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

export const PluginManagePage = () => {
  const refreshPluginUi = usePluginCatalogStore((state) => state.refresh);
  const [plugins, setPlugins] = useState<PluginDescriptor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("installed");
  const [marketplaceInstall, setMarketplaceInstall] = useState<MarketplacePlugin | null>(null);
  const [pendingEnable, setPendingEnable] = useState<PluginDescriptor | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<PluginDescriptor | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const loadPlugins = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      setPlugins(await listPlugins());
    } catch (caught) {
      setError(String(caught));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPlugins();
  }, [loadPlugins]);

  const groupedPlugins = useMemo(
    () => ({
      bundled: plugins.filter((plugin) => plugin.source === "bundled"),
      installed: plugins.filter((plugin) => plugin.source === "installed"),
    }),
    [plugins],
  );
  const installedIds = useMemo(() => new Set(plugins.map((plugin) => plugin.id)), [plugins]);

  const setPending = (id: string, pending: boolean) => {
    setPendingIds((current) => {
      const next = new Set(current);
      if (pending) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleToggle = async (plugin: PluginDescriptor, enabled: boolean) => {
    setPending(plugin.id, true);
    setError("");
    try {
      const updated = await setPluginEnabled(plugin.id, enabled);
      setPlugins((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      void refreshPluginUi();
      toast.success(enabled ? "插件已启用" : "插件已停用", { description: plugin.name });
    } catch (caught) {
      setError(String(caught));
    } finally {
      setPending(plugin.id, false);
    }
  };

  const handleRemove = async () => {
    if (!pendingRemoval) return;
    setIsRemoving(true);
    setError("");
    try {
      await removePlugin(pendingRemoval.id);
      setPlugins((current) => current.filter((plugin) => plugin.id !== pendingRemoval.id));
      void refreshPluginUi();
      toast.success("插件已卸载", { description: pendingRemoval.name });
      setPendingRemoval(null);
    } catch (caught) {
      setError(String(caught));
      setPendingRemoval(null);
    } finally {
      setIsRemoving(false);
    }
  };

  const requestToggle = (plugin: PluginDescriptor, enabled: boolean) => {
    if (enabled && plugin.source === "installed") {
      setPendingEnable(plugin);
      return;
    }
    void handleToggle(plugin, enabled);
  };

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-surface/45">
      <header className="flex min-h-20 shrink-0 items-center justify-between gap-4 border-b border-border/70 bg-card/50 px-6 py-4 max-sm:px-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button asChild type="button" variant="ghost" size="icon" className="size-11 shrink-0 rounded-full">
            <NavLink to="/plugins" aria-label="返回插件列表">
              <ArrowLeft className="size-4" />
            </NavLink>
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold tracking-[-0.02em]">插件管理</h1>
            <p className="mt-1 truncate text-sm text-muted-foreground">安装、启停和维护 Isle 插件与兼容插件</p>
          </div>
        </div>
        <Button type="button" className="min-h-11 shrink-0" onClick={() => setIsImportOpen(true)} title="导入本地插件">
          <PackagePlus className="size-4" />
          <span className="max-sm:hidden">导入插件</span>
        </Button>
      </header>

      <ScrollArea className="min-h-0 flex-1 bg-transparent">
        <div className="mx-auto w-full max-w-5xl px-6 pt-5 pb-10 max-sm:px-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList variant="line" className="mb-4">
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
                  <Button type="button" variant="ghost" size="sm" onClick={() => void loadPlugins()}>
                    <RefreshCw className="size-3.5" />
                    <span>重试</span>
                  </Button>
                </div>
              ) : null}

              {isLoading ? (
                <div className="flex min-h-72 items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                  <span>正在读取插件注册表</span>
                </div>
              ) : plugins.length > 0 ? (
                <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/45">
                  <PluginSection
                    title="内置插件"
                    plugins={groupedPlugins.bundled}
                    emptyText="当前版本没有内置 DSH 插件。"
                    onToggle={requestToggle}
                    onRemove={setPendingRemoval}
                    pendingIds={pendingIds}
                  />
                  <PluginSection
                    title="本地与市场安装"
                    plugins={groupedPlugins.installed}
                    emptyText="还没有安装外部插件。"
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
                    <h2 className="font-semibold">还没有可用插件</h2>
                    <p className="text-sm text-muted-foreground">从社区市场安装，或从本地目录导入 DSH 插件。</p>
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

      <ImportPluginDialog
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        onInstalled={async () => {
          await loadPlugins();
          await refreshPluginUi();
        }}
      />
      <MarketplaceInstallDialog
        plugin={marketplaceInstall}
        onOpenChange={(open) => {
          if (!open) setMarketplaceInstall(null);
        }}
        onInstalled={async () => {
          await loadPlugins();
          await refreshPluginUi();
        }}
      />

      <AlertDialog open={Boolean(pendingEnable)} onOpenChange={(open) => !open && setPendingEnable(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>启用“{pendingEnable?.name ?? ""}”？</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingEnable?.permissionStatus === "dsh-unsupported"
                ? "该 DSH 兼容插件没有 Isle 权限声明。启用后会以受信任模式执行 Node.js 代码，请确认插件来源可靠。"
                : "启用前请确认宿主能力和 Agent 访问范围。Agent 操作会受到范围限制；插件自身的 Node.js 代码仍按受信任代码运行。"}
            </AlertDialogDescription>
            {pendingEnable ? (
              <PluginPermissionSummary
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
                const plugin = pendingEnable;
                setPendingEnable(null);
                if (plugin) void handleToggle(plugin, true);
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
              插件包会从应用数据目录中移除。该操作不会删除插件原始来源目录。
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
              <span>{isRemoving ? "正在卸载" : "卸载插件"}</span>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
};
