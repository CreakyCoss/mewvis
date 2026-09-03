import { useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { FolderOpen, Loader2, PackagePlus, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { installDshPlugin, type DshPluginDescriptor } from "@/api/plugins";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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

type ImportPluginDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInstalled: (plugin: DshPluginDescriptor) => void | Promise<void>;
};

export const ImportPluginDialog = ({ open, onOpenChange, onInstalled }: ImportPluginDialogProps) => {
  const [sourcePath, setSourcePath] = useState("");
  const [enableAfterInstall, setEnableAfterInstall] = useState(true);
  const [error, setError] = useState("");
  const [isInstalling, setIsInstalling] = useState(false);
  const directoryName = sourcePath.split(/[\\/]/).filter(Boolean).pop() ?? sourcePath;

  useEffect(() => {
    if (!open) {
      setSourcePath("");
      setEnableAfterInstall(true);
      setError("");
    }
  }, [open]);

  const chooseDirectory = async () => {
    const selected = await openDialog({
      multiple: false,
      directory: true,
      title: "选择 DSH 插件目录",
    });
    if (typeof selected === "string") {
      setSourcePath(selected);
      setError("");
    }
  };

  const handleInstall = async () => {
    if (!sourcePath.trim()) {
      setError("请选择一个插件目录");
      return;
    }

    setIsInstalling(true);
    setError("");
    try {
      const plugin = await installDshPlugin(sourcePath, enableAfterInstall);
      await onInstalled(plugin);
      toast.success("插件安装成功", {
        description: `${plugin.name} 已添加到插件注册表`,
      });
      onOpenChange(false);
    } catch (caught) {
      setError(String(caught));
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!flex max-h-[calc(100dvh-2rem)] w-[520px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[520px]">
        <DialogHeader className="border-b border-border/60 bg-surface-raised/85 px-6 py-5 pr-14 text-left">
          <DialogTitle>导入本地插件</DialogTitle>
          <DialogDescription>从本地目录安装一个 Cordis / DeepSeek Harness 兼容插件。</DialogDescription>
        </DialogHeader>

        <div className="app-canvas min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="space-y-2">
            <Label htmlFor="plugin-source-directory">插件目录</Label>
            <button
              id="plugin-source-directory"
              type="button"
              className="flex min-h-28 w-full cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-muted-foreground/40 px-5 py-5 text-center transition-colors duration-150 hover:border-primary/45 hover:bg-primary/[0.025] focus-visible:ring-3 focus-visible:ring-ring/25 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45"
              onClick={() => void chooseDirectory()}
              disabled={isInstalling}
            >
              <FolderOpen className="mb-2 size-6 text-primary" />
              <span className="max-w-full truncate text-sm font-medium">
                {sourcePath ? directoryName : "选择包含 package.json 的插件目录"}
              </span>
              <span className="mt-1 max-w-full truncate text-xs text-muted-foreground">
                {sourcePath || "目录需要声明 main 或 exports，以及 dsh.bundle.patch"}
              </span>
            </button>
          </div>

          <div className="flex min-h-12 items-center justify-between gap-4 rounded-xl border border-border/70 bg-card/55 px-4 py-2.5">
            <div className="min-w-0">
              <Label htmlFor="enable-plugin-after-install" className="cursor-pointer">
                安装后启用
              </Label>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">启用后会从下一个 Agent 任务开始生效。</p>
            </div>
            <Switch
              id="enable-plugin-after-install"
              checked={enableAfterInstall}
              onCheckedChange={setEnableAfterInstall}
              disabled={isInstalling}
              aria-label="安装后启用插件"
            />
          </div>

          <Alert>
            <ShieldAlert />
            <AlertTitle>只导入可信来源</AlertTitle>
            <AlertDescription>
              启用插件会在 Agent Runtime 中执行插件的 Node.js 代码。当前安装器不会自动审查代码或下载依赖。
            </AlertDescription>
          </Alert>

          {error ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>

        <DialogFooter className="border-t border-border/60 bg-surface-raised/85 px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isInstalling}>
            取消
          </Button>
          <Button type="button" onClick={() => void handleInstall()} disabled={isInstalling || !sourcePath}>
            {isInstalling ? (
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <PackagePlus className="size-4" />
            )}
            <span>{isInstalling ? "正在安装" : "安装插件"}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
