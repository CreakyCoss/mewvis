import {
  Blocks,
  BookOpen,
  Bot,
  ChevronRight,
  CircleMinus,
  ExternalLink,
  FilePenLine,
  Files,
  Folder,
  Globe,
  MessageSquare,
  Shield,
  ShieldAlert,
  Terminal,
} from "lucide-react";
import type { AgentAccess, AgentAccessBase, AgentAccessPaths } from "@isle/chat-contracts";
import type { PluginPermission, PluginPermissionStatus } from "@/api/plugins";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

type PermissionSummaryProps = {
  permissions: PluginPermission[];
  status: PluginPermissionStatus;
  agentAccess?: AgentAccess | null;
  compact?: boolean;
  className?: string;
};

const permissionMeta = {
  network: { label: "访问网络", shortLabel: "网络", icon: Globe },
  "plugin-data": { label: "读写插件数据", shortLabel: "插件数据", icon: Folder },
  "plugin-workspaces": { label: "创建和查询插件工作区", shortLabel: "插件工作区", icon: Folder },
  "workspace-files": { label: "读写工作区文件", shortLabel: "工作区文件", icon: Files },
  "open-external": { label: "打开外部内容", shortLabel: "外部内容", icon: ExternalLink },
  process: { label: "启动子进程", shortLabel: "子进程", icon: Terminal },
  chat: { label: "使用宿主聊天与模型", shortLabel: "聊天与模型", icon: MessageSquare },
  "chat-knowledge": { label: "在聊天中检索知识库", shortLabel: "知识库", icon: BookOpen },
} satisfies Record<PluginPermission, { label: string; shortLabel: string; icon: typeof Shield }>;

export const pluginPermissionLabel = (permission: PluginPermission) => permissionMeta[permission].label;

const baseLabels: Record<AgentAccessBase, string> = {
  workspace: "当前工作区",
  home: "用户目录",
  temp: "临时目录",
};
const pathLabels = (scope: AgentAccessPaths | undefined) =>
  scope === "all"
    ? ["全部路径"]
    : (scope ?? []).map(({ base, path }) => `${baseLabels[base]}${path ? `/${path}` : ""}`);
const chipClass =
  "inline-flex max-w-full items-center gap-1.5 rounded-md bg-muted/70 px-2 py-1 text-xs leading-4 text-foreground";

function DeclarationNotice({ status }: { status: PluginPermissionStatus }) {
  if (status === "declared") return null;
  return (
    <p
      className={cn(
        "flex items-start gap-2 text-xs leading-5",
        status === "isle-upgrade-required" ? "text-destructive" : "text-warning",
      )}
    >
      <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      {status === "isle-upgrade-required"
        ? "旧版清单缺少权限声明，升级后才能启用。"
        : "DSH 未提供 Isle 权限声明，将按受信任模式运行。"}
    </p>
  );
}

function PermissionDetails({ permissions, status, agentAccess: access, className }: PermissionSummaryProps) {
  const rows = [
    { label: "读取文件", icon: Files, values: pathLabels(access?.filesystem?.read) },
    { label: "写入及删除", icon: FilePenLine, values: pathLabels(access?.filesystem?.write) },
    {
      label: "访问网络",
      icon: Globe,
      values: access?.network?.hosts === "all" ? ["全部域名"] : (access?.network?.hosts ?? []),
    },
    { label: "执行命令", icon: Terminal, values: access?.process?.execute ? ["允许"] : [] },
  ];
  return (
    <div className={cn("space-y-4 text-left", className)}>
      <section className="space-y-2.5" aria-label="宿主能力">
        <div className="flex items-center gap-2 text-xs font-medium">
          <Blocks className="size-3.5 text-muted-foreground" aria-hidden="true" />
          宿主能力
          {status === "declared" && (
            <span className="ml-auto font-normal tabular-nums text-muted-foreground">{permissions.length} 项</span>
          )}
        </div>
        <DeclarationNotice status={status} />
        {permissions.length ? (
          <div className="flex flex-wrap gap-1.5">
            {permissions.map((permission) => {
              const { icon: Icon, label } = permissionMeta[permission];
              return (
                <span key={permission} className={chipClass}>
                  <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  {label}
                </span>
              );
            })}
          </div>
        ) : status === "declared" ? (
          <p className="text-xs text-muted-foreground">无需额外宿主能力</p>
        ) : null}
      </section>

      {(permissions.includes("chat") || access) && (
        <section className="border-t border-border/70 pt-4" aria-label="Agent 访问范围">
          <div className="mb-1 flex items-center gap-2 text-xs font-medium">
            <Bot className="size-3.5 text-muted-foreground" aria-hidden="true" />
            Agent 访问范围
          </div>
          <dl className="divide-y divide-border/50">
            {rows.map(({ label, icon: Icon, values }) => (
              <div key={label} className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-start gap-3 py-3">
                <dt className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
                  <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                  {label}
                </dt>
                <dd className="flex min-w-0 flex-wrap gap-1.5">
                  {values.length ? (
                    values.map((value, index) => (
                      <span key={`${index}:${value}`} className={cn(chipClass, "break-all")}>
                        {value}
                      </span>
                    ))
                  ) : (
                    <span className="py-1 text-xs leading-4 text-muted-foreground">未申请</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
          <p className="rounded-lg bg-muted/45 px-3 py-2.5 text-xs leading-5 text-muted-foreground">
            所有范围仍受宿主限制；三档权限和单次审批都不会扩大声明范围。
          </p>
        </section>
      )}
    </div>
  );
}

export function PluginPermissionSummary(props: PermissionSummaryProps) {
  const isMobile = useIsMobile();
  if (!props.compact) return <PermissionDetails {...props} />;
  const { permissions, status, agentAccess: access } = props;
  const pathSummary = (label: string, scope: AgentAccessPaths | undefined) =>
    scope === "all" ? [`${label}全部文件`] : scope?.length ? [`${label} ${scope.length} 处`] : [];
  const accessLabels = [
    ...(access?.filesystem?.read === "all" && access.filesystem.write === "all"
      ? ["读写全部"]
      : [...pathSummary("读取", access?.filesystem?.read), ...pathSummary("写入", access?.filesystem?.write)]),
    ...(access?.network?.hosts === "all"
      ? ["联网全部"]
      : access?.network?.hosts?.length
        ? [`联网 ${access.network.hosts.length} 个域名`]
        : []),
    ...(access?.process?.execute ? ["执行命令"] : []),
  ];
  const hostSummary = permissions.map((permission) => permissionMeta[permission].shortLabel).join("、");
  const agentSummary = accessLabels.length
    ? accessLabels.join(" · ")
    : access || permissions.includes("chat")
      ? "未申请操作权限"
      : "未申请 Agent 调用";
  const hasRequests = permissions.length > 0 || accessLabels.length > 0;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="查看权限声明"
          className={cn(
            "group/permissions flex w-full cursor-pointer flex-col rounded-lg border border-border/60 bg-muted/25 p-3 text-left transition-colors duration-150 hover:border-primary/25 hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none motion-reduce:transition-none",
            props.className,
          )}
        >
          <span className="mb-2 flex items-center gap-1.5 text-xs font-medium text-foreground/80">
            <Shield className="size-3.5" aria-hidden="true" />
            权限声明
            <ChevronRight className="ml-auto size-3.5 group-hover/permissions:text-primary" aria-hidden="true" />
          </span>
          {status !== "declared" ? (
            <span className="flex flex-1 items-center gap-2.5">
              <ShieldAlert
                className={cn(
                  "size-5 shrink-0",
                  status === "isle-upgrade-required" ? "text-destructive" : "text-warning",
                )}
                aria-hidden="true"
              />
              <span className="space-y-1 text-xs leading-4">
                <span className="block">
                  {status === "isle-upgrade-required" ? "缺少权限声明" : "DSH 未提供权限声明"}
                </span>
                <span className="block text-muted-foreground">
                  {status === "isle-upgrade-required" ? "升级清单后才能启用" : "以受信任模式运行"}
                </span>
              </span>
            </span>
          ) : !hasRequests ? (
            <span className="flex flex-1 items-center gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/70 text-muted-foreground">
                <CircleMinus className="size-4" aria-hidden="true" />
              </span>
              <span className="space-y-1 text-xs leading-4">
                <span className="block text-foreground/85">未申请额外权限</span>
                <span className="block text-muted-foreground">点击查看完整声明</span>
              </span>
            </span>
          ) : (
            <span className="grid min-w-0 grid-cols-[2rem_minmax(0,1fr)] items-center gap-x-2 gap-y-2 text-xs leading-5">
              <span className="text-muted-foreground">宿主</span>
              <span
                className={cn("truncate", !hostSummary && "text-muted-foreground")}
                title={hostSummary || undefined}
              >
                {hostSummary || "无需额外能力"}
              </span>
              <span className="text-muted-foreground">Agent</span>
              <span className={cn("truncate", !accessLabels.length && "text-muted-foreground")} title={agentSummary}>
                {agentSummary}
              </span>
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={isMobile ? "bottom" : "right"}
        align={isMobile ? "start" : "center"}
        sideOffset={8}
        collisionPadding={16}
        aria-label="权限声明详情"
        className="max-h-[min(36rem,var(--radix-popover-content-available-height))] w-[26rem] max-w-[calc(100vw-2rem)] gap-4 overflow-y-auto p-4"
      >
        <div className="flex items-center gap-2 border-b border-border/70 pb-3">
          <Shield className="size-4 text-primary" aria-hidden="true" />
          <h3 className="text-sm font-semibold">权限声明</h3>
        </div>
        <PermissionDetails permissions={permissions} status={status} agentAccess={access} />
      </PopoverContent>
    </Popover>
  );
}
