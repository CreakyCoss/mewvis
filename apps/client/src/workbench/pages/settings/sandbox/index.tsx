import { useEffect, useState } from "react";
import { getAgentRuntimeSandboxStatus, initializeAgentRuntimeSandbox } from "@/api/agent-runtime";
import { Button } from "design-system/components/ui/button";
import { SettingsPageHeader } from "../page-header";

export function SandboxSettingsPage() {
  const [status, setStatus] = useState<Awaited<ReturnType<typeof getAgentRuntimeSandboxStatus>>>();
  const [busy, setBusy] = useState<"status" | "install" | null>("status");
  const [error, setError] = useState("");
  const run = async (action: "status" | "install") => {
    setBusy(action);
    setError("");
    try {
      setStatus(await (action === "install" ? initializeAgentRuntimeSandbox() : getAgentRuntimeSandboxStatus()));
    } catch (failure) {
      setError(String(failure));
    } finally {
      setBusy(null);
    }
  };
  useEffect(() => {
    void run("status");
  }, []);
  return (
    <section className="flex h-full min-h-0 flex-1 flex-col bg-background">
      <SettingsPageHeader
        title="Agent 沙箱"
        description="检查工具执行环境，管理首次初始化。"
        action={
          <Button variant="outline" disabled={busy !== null} onClick={() => void run("status")}>
            重新检测
          </Button>
        }
      />
      <div className="max-w-3xl space-y-5 px-6 py-6 lg:px-8">
        <div className="rounded-xl border border-border p-5">
          <p className="font-medium" role="status">
            {busy === "install"
              ? "正在初始化，请处理系统管理员确认…"
              : busy === "status"
                ? "正在检测沙箱…"
                : status?.state === "ready"
                  ? "沙箱已就绪"
                  : status?.state === "disabled"
                    ? "沙箱已关闭"
                    : "沙箱尚未就绪"}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{status?.message}</p>
          {status?.canInstall && (
            <Button className="mt-4" disabled={busy !== null} onClick={() => void run("install")}>
              初始化或修复 Windows 沙箱
            </Button>
          )}
        </div>
        <p className="text-sm leading-6 text-muted-foreground">
          调用前审批与沙箱可独立启用。启用沙箱时，工具执行遵守当前档位的文件和网络范围。
        </p>
        {status?.platform === "win32" && status.state !== "disabled" && (
          <div className="space-y-2 text-sm leading-6 text-muted-foreground">
            <p>
              首次初始化会创建沙箱专用账户和网络规则，需要一次 Windows 管理员确认。日常工具审批仍按聊天所选权限进行。
            </p>
            <p>命令工具需要 Git for Windows 或其他原生 Bash；文件工具不依赖 Bash。</p>
            <p>
              Windows 后端处于 alpha 阶段。同一策略的主、子 Agent 可并行；使用不同文件或网络范围的会话需要分别运行。
            </p>
          </div>
        )}
        {error && (
          <p role="alert" className="whitespace-pre-wrap text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
