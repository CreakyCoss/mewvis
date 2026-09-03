import { Shield, ShieldAlert } from "lucide-react";
import type { PluginPermission, PluginPermissionStatus } from "@/api/plugins";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const permissionLabels: Record<PluginPermission, string> = {
  network: "访问网络",
  "plugin-data": "读写插件数据",
  "workspace-files": "读写工作区文件",
  "open-external": "打开外部内容",
  process: "启动子进程",
};

export const pluginPermissionLabel = (permission: PluginPermission) => permissionLabels[permission];

export const PluginPermissionSummary = ({
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
