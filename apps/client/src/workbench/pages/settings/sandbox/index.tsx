import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  CircleAlert,
  Clock3,
  FolderLock,
  Globe2,
  Loader2,
  RefreshCw,
  Shield,
  ShieldCheck,
  ShieldOff,
  SlidersHorizontal,
} from "lucide-react";
import {
  getAgentRuntimeSandboxStatus,
  initializeAgentRuntimeSandbox,
  setAgentRuntimeSandboxEnabled,
} from "@/api/agent-runtime";
import { Badge } from "design-system/components/ui/badge";
import { Button } from "design-system/components/ui/button";
import { ScrollArea } from "design-system/components/ui/scroll-area";
import { Switch } from "design-system/components/ui/switch";
import { SettingsPageHeader } from "../page-header";

type SandboxStatus = Awaited<ReturnType<typeof getAgentRuntimeSandboxStatus>>;
type Action = "status" | "install" | "toggle";

function sandboxPresentation(status: SandboxStatus | undefined, busy: Action | null) {
  if (busy === "install")
    return {
      label: "正在初始化",
      title: "正在准备隔离环境",
      description: "请在系统弹窗中完成管理员确认，初始化可能需要一些时间。",
      variant: "secondary" as const,
    };
  if (busy === "toggle")
    return {
      label: "正在保存",
      title: "正在更新执行方式",
      description: "设置保存后，将用于下一次 Agent 运行。",
      variant: "secondary" as const,
    };
  if (!status)
    return {
      label: busy ? "检测中" : "检测失败",
      title: "工具执行环境",
      description: busy ? "正在读取沙箱设置和环境状态…" : "未能读取沙箱状态，请重新检测。",
      variant: "secondary" as const,
    };
  if (!status.enabled)
    return {
      label: "已关闭",
      title: "使用普通执行环境",
      description: "工具以当前用户权限运行，无需准备沙箱环境。",
      variant: "secondary" as const,
    };
  if (status.state === "ready")
    return {
      label: "已就绪",
      title: "沙箱隔离已开启",
      description: "工具将在隔离环境中运行，遵守当前权限档位的文件与网络范围。",
      variant: "primary" as const,
    };
  if (status.canInstall)
    return {
      label: "待初始化",
      title: "还差一步，准备沙箱环境",
      description: "沙箱已开启，完成下方初始化后即可执行工具。",
      variant: "warning" as const,
    };
  return {
    label: "不可用",
    title: "沙箱环境需要处理",
    description: "请检查环境详情并重新检测，也可以关闭沙箱使用普通执行环境。",
    variant: "destructive" as const,
  };
}

export function SandboxSettingsPage() {
  const [status, setStatus] = useState<SandboxStatus>();
  const [busy, setBusy] = useState<Action | null>("status");
  const [error, setError] = useState("");
  const run = async (action: Action, enabled = false) => {
    setBusy(action);
    setError("");
    try {
      setStatus(
        await (action === "toggle"
          ? setAgentRuntimeSandboxEnabled(enabled)
          : action === "install"
            ? initializeAgentRuntimeSandbox()
            : getAgentRuntimeSandboxStatus()),
      );
    } catch (failure) {
      setError(String(failure));
    } finally {
      setBusy(null);
    }
  };
  useEffect(() => {
    void run("status");
  }, []);

  const presentation = sandboxPresentation(status, busy);
  const isWindows = status?.platform === "win32";
  const needsSetup = status?.enabled && status.canInstall;
  const StatusIcon = !status ? Shield : !status.enabled ? ShieldOff : status.state === "ready" ? ShieldCheck : Shield;
  const platform = status
    ? ({ win32: "Windows", darwin: "macOS", linux: "Linux" }[status.platform] ?? status.platform)
    : "—";

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <SettingsPageHeader
        title="Agent 沙箱"
        description="管理工具的执行方式与隔离环境"
        action={
          <Button
            variant="ghost"
            className="gap-2 rounded-full px-3 font-normal text-muted-foreground hover:bg-primary/8 hover:text-primary"
            disabled={busy !== null}
            onClick={() => void run("status")}
          >
            <RefreshCw
              aria-hidden="true"
              className={busy === "status" ? "size-4 animate-spin motion-reduce:animate-none" : "size-4"}
            />
            <span className="max-sm:sr-only">重新检测</span>
          </Button>
        }
      />
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto w-full max-w-4xl space-y-8 px-6 py-6 pb-10 lg:px-8">
          {error && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive"
            >
              <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <div className="min-w-0 space-y-1">
                <p className="font-medium">{status ? "操作未完成，请重试" : "暂时无法读取沙箱设置"}</p>
                <p className="whitespace-pre-wrap break-words leading-6">{error}</p>
              </div>
            </div>
          )}

          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="flex items-start gap-4 p-5 sm:p-6">
              <div
                className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${status?.enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
              >
                {busy ? (
                  <Loader2 aria-hidden="true" className="size-6 animate-spin motion-reduce:animate-none" />
                ) : (
                  <StatusIcon aria-hidden="true" className="size-6 stroke-[1.7]" />
                )}
              </div>
              <div className="min-w-0 flex-1" role="status" aria-live="polite">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <h3 className="text-base font-semibold tracking-tight">{presentation.title}</h3>
                  <Badge
                    variant={presentation.variant}
                    className={
                      presentation.variant === "primary"
                        ? "gap-1.5 border-transparent bg-primary/10 text-primary"
                        : "gap-1.5"
                    }
                  >
                    {presentation.variant === "primary" && <Check aria-hidden="true" />}
                    {presentation.label}
                  </Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{presentation.description}</p>
              </div>
            </div>
            <div className="mx-5 flex items-center justify-between gap-6 border-t border-border/70 py-5 sm:mx-6">
              <div className="space-y-1">
                <label htmlFor="agent-sandbox-enabled" className="cursor-pointer text-sm font-medium">
                  启用沙箱隔离
                </label>
                <p id="agent-sandbox-description" className="text-xs leading-5 text-muted-foreground">
                  关闭后不提供系统隔离，调用前审批仍保留。
                </p>
              </div>
              <Switch
                id="agent-sandbox-enabled"
                aria-describedby="agent-sandbox-description sandbox-effective-time"
                checked={status?.enabled ?? false}
                disabled={busy !== null || !status}
                onCheckedChange={(enabled) => void run("toggle", enabled)}
              />
            </div>
            <div
              id="sandbox-effective-time"
              className="flex items-start gap-2 border-t border-border/60 bg-muted/35 px-5 py-3 text-xs leading-5 text-muted-foreground sm:px-6"
            >
              <Clock3 aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              自动保存 · 下一次 Agent 运行生效，当前任务继续使用原配置。
            </div>
          </div>

          {isWindows && (
            <section
              aria-labelledby="windows-sandbox-title"
              className={
                needsSetup ? "rounded-2xl border border-warning-border bg-warning-subtle/40 p-5 sm:p-6" : "space-y-3"
              }
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 id="windows-sandbox-title" className="text-sm font-semibold">
                  Windows 沙箱环境
                </h3>
                <Badge variant="outline">可选配置</Badge>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {needsSetup
                  ? "首次初始化会创建隔离账户和网络规则，需要一次管理员确认。"
                  : !status.enabled
                    ? "默认关闭，无需分配隔离账户或安装沙箱。需要隔离时再开启并初始化即可。"
                    : status.state === "ready"
                      ? "隔离账户与环境可继续使用，日常运行无需重复初始化。"
                      : "当前环境尚未就绪，请查看下方环境详情了解原因。"}
              </p>
              {needsSetup && (
                <Button className="mt-4" disabled={busy !== null} onClick={() => void run("install")}>
                  {busy === "install" ? (
                    <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
                  ) : (
                    <ShieldCheck aria-hidden="true" className="size-4" />
                  )}
                  {busy === "install" ? "正在初始化…" : "初始化或修复沙箱"}
                  {busy !== "install" && <ArrowRight aria-hidden="true" className="size-4" />}
                </Button>
              )}
            </section>
          )}

          <section aria-labelledby="sandbox-scope-title">
            <h3 id="sandbox-scope-title" className="text-sm font-semibold">
              沙箱会改变什么
            </h3>
            <div className="mt-2 divide-y divide-border/60">
              {[
                { icon: FolderLock, title: "文件访问", description: "开启时，读写操作受当前权限档位的文件范围限制。" },
                { icon: Globe2, title: "网络访问", description: "开启时，工具连接受当前权限档位的网络规则限制。" },
                {
                  icon: SlidersHorizontal,
                  title: "调用前审批",
                  description: "独立于沙箱开关，始终按聊天中选择的权限设置执行。",
                },
              ].map(({ icon: Icon, title, description }) => (
                <div key={title} className="flex items-start gap-3 py-4 sm:gap-4">
                  <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="grid min-w-0 flex-1 gap-1 sm:grid-cols-[7rem_1fr] sm:gap-4">
                    <p className="text-sm font-medium">{title}</p>
                    <p className="text-sm leading-6 text-muted-foreground">{description}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="sandbox-details-title" className="border-t border-border/70 pt-5">
            <h3 id="sandbox-details-title" className="text-sm font-semibold">
              环境详情与使用说明
            </h3>
            <div className="mt-5 space-y-4 text-sm leading-6 text-muted-foreground">
              <dl className="grid grid-cols-2 gap-4 rounded-xl bg-muted/40 p-4 sm:grid-cols-3">
                {[
                  ["运行平台", platform],
                  ["沙箱后端", status?.backend.toUpperCase() ?? "—"],
                  ["后端版本", status?.version ?? "—"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs">{label}</dt>
                    <dd className="mt-1 font-medium text-foreground">{value}</dd>
                  </div>
                ))}
              </dl>
              {status?.message && <p className="whitespace-pre-wrap break-words">{status.message}</p>}
              <p>带有应用访问范围限制的 Agent 任务需要开启沙箱。沙箱启动失败时，工具执行会停止。</p>
              {isWindows && (
                <>
                  <p>关闭开关会保留已创建的账户和网络规则，便于下次启用。</p>
                  <p>命令工具可使用 PowerShell 或 Git for Windows 提供的 Bash，文件工具不依赖 Bash。</p>
                  <p>Windows 后端处于 alpha 阶段。相同文件和网络范围的任务可并行，不同范围的任务需分别运行。</p>
                </>
              )}
            </div>
          </section>
        </div>
      </ScrollArea>
    </section>
  );
}
