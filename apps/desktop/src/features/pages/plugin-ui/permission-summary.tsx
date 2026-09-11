import { Shield, ShieldAlert } from "lucide-react";
import type { PluginPermission, PluginPermissionStatus } from "@/api/plugins";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AgentAccess, AgentAccessBase, AgentAccessPaths } from "@isle/chat-contracts";

const baseLabels: Record<AgentAccessBase, string> = {
  workspace: "当前工作区",
  pluginData: "插件数据",
  home: "用户目录",
  temp: "临时目录",
};
const pathLabel = (scope: AgentAccessPaths | undefined) =>
  scope === "all"
    ? "全部路径（仍受宿主限制）"
    : scope?.length
      ? scope.map(({ base, path }) => `${baseLabels[base]}${path ? `/${path}` : ""}`).join("、")
      : "未申请";

export function PluginPermissionSummary(props: {
  permissions: PluginPermission[];
  status: PluginPermissionStatus;
  agentAccess?: AgentAccess | null;
  compact?: boolean;
  className?: string;
}) {
  const access = props.agentAccess;
  const countPaths = (scope: AgentAccessPaths | undefined) =>
    scope === "all" ? "全部路径" : scope?.length ? `${scope.length} 个范围` : "未申请";
  const compactSummary = [
    `读取 ${countPaths(access?.filesystem?.read)}`,
    `写入 ${countPaths(access?.filesystem?.write)}`,
    `联网 ${access?.network?.hosts === "all" ? "全部域名" : access?.network?.hosts?.length ? `${access.network.hosts.length} 个域名` : "未申请"}`,
    access?.process?.execute ? "允许命令" : "不执行命令",
  ].join(" · ");
  const rows = [
    ["读取文件", pathLabel(access?.filesystem?.read)],
    ["写入及删除", pathLabel(access?.filesystem?.write)],
    [
      "访问网络",
      access?.network?.hosts === "all" ? "全部域名（仍受宿主限制）" : access?.network?.hosts?.join("、") || "未申请",
    ],
    ["执行命令", access?.process?.execute ? "允许（仍受文件和网络范围限制）" : "未申请"],
  ];
  return (
    <div className={cn("space-y-2", props.className)}>
      <HostPermissionSummary {...props} className={undefined} />
      {(props.permissions.includes("chat") || access) &&
        (props.compact ? (
          <p
            className="text-xs text-muted-foreground"
            title={rows.map(([name, value]) => `${name}：${value}`).join("；")}
          >
            Agent：{compactSummary}
          </p>
        ) : (
          <div className="rounded-md border bg-muted/30 p-3 text-xs">
            <p className="mb-2 font-medium">Agent 访问范围</p>
            <dl className="grid grid-cols-[5rem_1fr] gap-x-3 gap-y-2">
              {rows.map(([name, value]) => (
                <div key={name} className="contents">
                  <dt className="text-muted-foreground">{name}</dt>
                  <dd className="min-w-0 break-words">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-muted-foreground">三档权限都受此范围限制，单次审批不会扩大范围。</p>
          </div>
        ))}
    </div>
  );
}

const permissionLabels: Record<PluginPermission, string> = {
  network: "访问网络",
  "plugin-data": "读写插件数据",
  "workspace-files": "读写工作区文件",
  "open-external": "打开外部内容",
  process: "启动子进程",
  chat: "使用宿主聊天与模型",
  "chat-knowledge": "在聊天中检索知识库",
};

export const pluginPermissionLabel = (permission: PluginPermission) => permissionLabels[permission];

const HostPermissionSummary = ({
  permissions,
  status,
  compact = false,
  className,
}: {
  permissions: PluginPermission[];
  status: PluginPermissionStatus;
  compact?: boolean;
  className?: string;
}) => {
  if (status === "isle-upgrade-required") {
    return (
      <div className={cn("flex items-center gap-1.5 text-xs text-destructive", className)}>
        <ShieldAlert className="size-3.5 shrink-0" />
        <span>{compact ? "旧版 Isle 清单，需要升级" : "旧版 Isle 清单缺少权限声明，升级后才能启用"}</span>
      </div>
    );
  }

  if (status === "dsh-unsupported") {
    return (
      <div className={cn("flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300", className)}>
        <ShieldAlert className="size-3.5 shrink-0" />
        <span>{compact ? "DSH 未提供 Isle 权限声明" : "DSH 格式未提供 Isle 权限声明，将按受信任模式运行"}</span>
      </div>
    );
  }

  if (permissions.length === 0) {
    return (
      <div className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
        <Shield className="size-3.5 shrink-0" />
        <span>声明无需额外能力</span>
      </div>
    );
  }

  if (compact) {
    return (
      <div className={cn("flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground", className)}>
        <Shield className="size-3.5 shrink-0" />
        <span className="truncate">{permissions.map(pluginPermissionLabel).join("、")}</span>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {permissions.map((permission) => (
        <Badge key={permission} variant="outline" className="font-normal">
          {pluginPermissionLabel(permission)}
        </Badge>
      ))}
    </div>
  );
};
