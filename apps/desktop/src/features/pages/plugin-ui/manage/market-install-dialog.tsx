import { useEffect, useState } from "react";
import { Download, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { installDshPluginFromMarketplace, type DshMarketplacePlugin, type DshPluginDescriptor } from "@/api/plugins";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type MarketplaceInstallDialogProps = {
  plugin: DshMarketplacePlugin | null;
  onOpenChange: (open: boolean) => void;
  onInstalled: (plugin: DshPluginDescriptor) => void | Promise<void>;
};

const checkLabel = (check: DshMarketplacePlugin["installCheck"]) => {
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

export const MarketplaceInstallDialog = ({ plugin, onOpenChange, onInstalled }: MarketplaceInstallDialogProps) => {
  const [enableAfterInstall, setEnableAfterInstall] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!plugin) {
      setEnableAfterInstall(false);
      setError("");
    }
  }, [plugin]);

  const handleInstall = async () => {
    if (!plugin) return;
    setIsInstalling(true);
    setError("");
    try {
      const installed = await installDshPluginFromMarketplace(plugin, enableAfterInstall);
      await onInstalled(installed);
      toast.success("插件安装成功", {
        description: enableAfterInstall ? `${installed.name} 已安装并启用` : `${installed.name} 已安全安装，暂未启用`,
      });
      onOpenChange(false);
    } catch (caught) {
      setError(String(caught));
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <Dialog open={Boolean(plugin)} onOpenChange={onOpenChange}>
      <DialogContent className="!flex max-h-[calc(100dvh-2rem)] w-[540px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[540px]">
        <DialogHeader className="border-b border-border/60 bg-surface-raised/85 px-6 py-5 pr-14 text-left">
          <DialogTitle>安装“{plugin?.name ?? "插件"}”</DialogTitle>
          <DialogDescription>来源于独立社区目录 dshmarketplace.dev，并非 DeepSeek 官方市场。</DialogDescription>
        </DialogHeader>

        <div className="app-canvas min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <div className="space-y-2 rounded-xl border border-border/70 bg-card/55 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{plugin?.fullName}</span>
              <Badge variant={plugin?.installCheck === "passed" ? "secondary" : "outline"}>
                {checkLabel(plugin?.installCheck ?? null)}
              </Badge>
            </div>
            <p className="text-sm leading-5 text-muted-foreground">
              {plugin?.summaryZh || plugin?.summary || "暂无插件描述"}
            </p>
            <p className="truncate font-mono text-xs text-muted-foreground" title={plugin?.npmPackage ?? undefined}>
              npm: {plugin?.npmPackage ?? "没有 npm 发布包"}
            </p>
          </div>

          <Alert>
            <ShieldCheck />
            <AlertTitle>安全安装模式</AlertTitle>
            <AlertDescription>
              使用固定 npm registry 下载，并保留精确版本锁文件；安装期间不会执行 preinstall、install、postinstall
              等脚本。安装成功只代表包格式有效；依赖完整 DSH Profile、客户端或 Isle
              尚未提供服务的插件，会在启用时明确报错。
            </AlertDescription>
          </Alert>

          {plugin && (plugin.riskFlags.length > 0 || plugin.blockedBuilds.length > 0) ? (
            <Alert>
              <TriangleAlert />
              <AlertTitle>社区风险提示</AlertTitle>
              <AlertDescription>
                {[...plugin.riskFlags, ...plugin.blockedBuilds.map((item) => `被阻止构建：${item}`)].join("；")}
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="flex min-h-12 items-center justify-between gap-4 rounded-xl border border-border/70 bg-card/55 px-4 py-2.5">
            <div className="min-w-0">
              <Label htmlFor="enable-market-plugin-after-install" className="cursor-pointer">
                安装后立即启用
              </Label>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                启用会在下一次 Agent 任务中执行插件代码，建议先查看来源仓库。
              </p>
            </div>
            <Switch
              id="enable-market-plugin-after-install"
              checked={enableAfterInstall}
              onCheckedChange={setEnableAfterInstall}
              disabled={isInstalling}
              aria-label="安装后立即启用市场插件"
            />
          </div>

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
          <Button type="button" onClick={() => void handleInstall()} disabled={isInstalling || !plugin?.npmPackage}>
            {isInstalling ? (
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <Download className="size-4" />
            )}
            <span>{isInstalling ? "正在安全安装" : "安装插件"}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
