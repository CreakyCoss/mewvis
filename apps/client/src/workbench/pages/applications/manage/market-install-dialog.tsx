import { useEffect, useState } from "react";
import { Download, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { installApplicationFromMarketplace, type MarketplaceApplication, type ApplicationDescriptor } from "@/api/applications";
import { Alert, AlertDescription, AlertTitle } from "design-system/components/ui/alert";
import { Badge } from "design-system/components/ui/badge";
import { Button } from "design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "design-system/components/ui/dialog";

type MarketplaceInstallDialogProps = {
  application: MarketplaceApplication | null;
  onOpenChange: (open: boolean) => void;
  onInstalled: (application: ApplicationDescriptor) => void | Promise<void>;
};

const checkLabel = (check: MarketplaceApplication["installCheck"]) => {
  switch (check) {
    case "passed":
      return "社区安装检查通过";
    case "needs-approval":
      return "需要额外审查";
    case "not-a-layer":
      return "不是 DSH bundle";
    case "failed":
      return "社区安装检查失败";
    case "timeout":
      return "社区安装检查超时";
    default:
      return "尚无社区检查结果";
  }
};

export const MarketplaceInstallDialog = ({ application, onOpenChange, onInstalled }: MarketplaceInstallDialogProps) => {
  const [isInstalling, setIsInstalling] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!application) {
      setError("");
    }
  }, [application]);

  const handleInstall = async () => {
    if (!application) return;
    setIsInstalling(true);
    setError("");
    try {
      const installed = await installApplicationFromMarketplace("dsh-community", application);
      await onInstalled(installed);
      toast.success("应用安装成功", {
        description: `${installed.name} 已安全安装，暂未启用`,
      });
      onOpenChange(false);
    } catch (caught) {
      setError(String(caught));
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <Dialog open={Boolean(application)} onOpenChange={onOpenChange}>
      <DialogContent className="!flex max-h-[calc(100dvh-2rem)] w-[540px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[540px]">
        <DialogHeader className="border-b border-border/60 bg-surface-raised/85 px-6 py-5 pr-14 text-left">
          <DialogTitle>安装“{application?.name ?? "应用"}”</DialogTitle>
          <DialogDescription>来源于独立社区目录 dshmarketplace.dev，并非 DeepSeek 官方市场。</DialogDescription>
        </DialogHeader>

        <div className="app-canvas min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <div className="space-y-2 rounded-xl border border-border/70 bg-card/55 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{application?.fullName}</span>
              <Badge variant={application?.installCheck === "passed" ? "secondary" : "outline"}>
                {checkLabel(application?.installCheck ?? null)}
              </Badge>
            </div>
            <p className="text-sm leading-5 text-muted-foreground">
              {application?.summaryZh || application?.summary || "暂无应用描述"}
            </p>
            <p className="truncate font-mono text-xs text-muted-foreground" title={application?.npmPackage ?? undefined}>
              npm: {application?.npmPackage ?? "没有 npm 发布包"}
            </p>
          </div>

          <Alert>
            <ShieldCheck />
            <AlertTitle>安全安装模式</AlertTitle>
            <AlertDescription>
              使用固定 npm registry 下载，并保留精确版本锁文件；安装期间不会执行 preinstall、install、postinstall
              等脚本。安装成功只代表包格式有效；依赖完整 DSH Profile、客户端或 Isle
              尚未提供服务的应用，会在启用时明确报错。
            </AlertDescription>
          </Alert>

          {application && (application.riskFlags.length > 0 || application.blockedBuilds.length > 0) ? (
            <Alert>
              <TriangleAlert />
              <AlertTitle>社区风险提示</AlertTitle>
              <AlertDescription>
                {[...application.riskFlags, ...application.blockedBuilds.map((item) => `被阻止构建：${item}`)].join("；")}
              </AlertDescription>
            </Alert>
          ) : null}

          <Alert>
            <TriangleAlert />
            <AlertTitle>安装后保持停用</AlertTitle>
            <AlertDescription>
              社区目录本身不提供权限信息。安装后 Isle 会读取包内声明；若 DSH
              格式不支持，会明确标记为受信任模式，再由你确认启用。
            </AlertDescription>
          </Alert>

          {error ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription className="whitespace-pre-wrap break-words font-mono text-xs">{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>

        <DialogFooter className="border-t border-border/60 bg-surface-raised/85 px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isInstalling}>
            取消
          </Button>
          <Button type="button" onClick={() => void handleInstall()} disabled={isInstalling || !application?.npmPackage}>
            {isInstalling ? (
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <Download className="size-4" />
            )}
            <span>{isInstalling ? "正在安全安装" : "安装应用"}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
