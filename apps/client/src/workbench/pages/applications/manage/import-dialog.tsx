import { APP_DISPLAY_NAME, PRODUCT_KEYS, PRODUCT_NAMESPACE } from "@mewvis/product-config";
import { useEffect, useRef, useState } from "react";
import { openSystemDialog as openDialog } from "@/api/native";
import { FolderOpen, Loader2, PackagePlus, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { inspectApplication, installApplication, type ApplicationDescriptor } from "@/api/applications";
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
import { Label } from "design-system/components/ui/label";
import { Switch } from "design-system/components/ui/switch";
import { ApplicationPermissionSummary } from "../permission-summary";

type ImportApplicationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInstalled: (application: ApplicationDescriptor) => void | Promise<void>;
};

export const ImportApplicationDialog = ({ open, onOpenChange, onInstalled }: ImportApplicationDialogProps) => {
  const [sourcePath, setSourcePath] = useState("");
  const [inspection, setInspection] = useState<ApplicationDescriptor | null>(null);
  const [enableAfterInstall, setEnableAfterInstall] = useState(false);
  const [error, setError] = useState("");
  const [isInspecting, setIsInspecting] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const inspectionRequest = useRef(0);
  const directoryName = sourcePath.split(/[\\/]/).filter(Boolean).pop() ?? sourcePath;

  useEffect(() => {
    if (!open) {
      inspectionRequest.current += 1;
      setSourcePath("");
      setInspection(null);
      setEnableAfterInstall(false);
      setError("");
    }
  }, [open]);

  const chooseDirectory = async () => {
    const selected = await openDialog({
      multiple: false,
      directory: true,
      title: "选择应用目录",
    });
    if (typeof selected === "string") {
      const request = ++inspectionRequest.current;
      setSourcePath(selected);
      setInspection(null);
      setEnableAfterInstall(false);
      setError("");
      setIsInspecting(true);
      try {
        const inspected = await inspectApplication(selected);
        if (request === inspectionRequest.current) setInspection(inspected);
      } catch (caught) {
        if (request === inspectionRequest.current) setError(String(caught));
      } finally {
        if (request === inspectionRequest.current) setIsInspecting(false);
      }
    }
  };

  const handleInstall = async () => {
    if (!sourcePath.trim() || !inspection) {
      setError("请先选择并通过检查的应用目录");
      return;
    }

    setIsInstalling(true);
    setError("");
    try {
      const application = await installApplication(sourcePath, enableAfterInstall);
      await onInstalled(application);
      toast.success("应用安装成功", {
        description: `${application.name} 已添加到应用注册表`,
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
          <DialogTitle>导入本地应用</DialogTitle>
          <DialogDescription>从本地目录安装 {APP_DISPLAY_NAME} 原生应用或受支持的兼容应用。</DialogDescription>
        </DialogHeader>

        <div className="app-canvas min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="space-y-2">
            <Label htmlFor="application-source-directory">应用目录</Label>
            <button
              id="application-source-directory"
              type="button"
              className="flex min-h-28 w-full cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-muted-foreground/40 px-5 py-5 text-center transition-colors duration-150 hover:border-primary/45 hover:bg-primary/[0.025] focus-visible:ring-3 focus-visible:ring-ring/25 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45"
              onClick={() => void chooseDirectory()}
              disabled={isInstalling || isInspecting}
            >
              {isInspecting ? (
                <Loader2 className="mb-2 size-6 animate-spin text-primary motion-reduce:animate-none" />
              ) : (
                <FolderOpen className="mb-2 size-6 text-primary" />
              )}
              <span className="max-w-full truncate text-sm font-medium">
                {isInspecting ? "正在检查应用" : sourcePath ? directoryName : "选择包含 package.json 的应用目录"}
              </span>
              <span className="mt-1 max-w-full truncate text-xs text-muted-foreground">
                {sourcePath || `目录需要声明 ${PRODUCT_NAMESPACE}.app，或受支持的兼容应用格式`}
              </span>
            </button>
          </div>

          {inspection ? (
            <div className="space-y-3 rounded-xl border border-border/70 bg-card/55 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{inspection.name}</span>
                <Badge variant="secondary">v{inspection.version || "0.0.0"}</Badge>
                <Badge variant="outline">
                  {inspection.runtimeKind === PRODUCT_KEYS.applicationManifest
                    ? `${APP_DISPLAY_NAME} 原生`
                    : "DSH 兼容"}
                </Badge>
              </div>
              <p className="text-sm leading-5 text-muted-foreground">
                {inspection.description || "该应用没有提供描述。"}
              </p>
              <div className="space-y-2 border-t border-border/60 pt-3">
                <ApplicationPermissionSummary
                  permissions={inspection.permissions}
                  agentAccess={inspection.agentAccess}
                  status={inspection.permissionStatus}
                />
              </div>
            </div>
          ) : null}

          <div className="flex min-h-12 items-center justify-between gap-4 rounded-xl border border-border/70 bg-card/55 px-4 py-2.5">
            <div className="min-w-0">
              <Label htmlFor="enable-application-after-install" className="cursor-pointer">
                安装后启用
              </Label>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                {inspection?.permissionStatus === "dsh-unsupported"
                  ? "DSH 应用需要安装后在管理页确认启用。"
                  : "启用后会从下一个 Agent 任务开始生效。"}
              </p>
            </div>
            <Switch
              id="enable-application-after-install"
              checked={enableAfterInstall}
              onCheckedChange={setEnableAfterInstall}
              disabled={
                isInstalling || isInspecting || !inspection || inspection.permissionStatus === "dsh-unsupported"
              }
              aria-label="安装后启用应用"
            />
          </div>

          <Alert>
            <ShieldAlert />
            <AlertTitle>只导入可信来源</AlertTitle>
            <AlertDescription>
              权限声明由应用作者提供，用来帮助判断用途，并不是 Node.js 沙箱。启用应用仍会执行其代码，请只导入可信来源。
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
          <Button
            type="button"
            onClick={() => void handleInstall()}
            disabled={isInstalling || isInspecting || !sourcePath || !inspection}
          >
            {isInstalling ? (
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <PackagePlus className="size-4" />
            )}
            <span>{isInstalling ? "正在安装" : "安装应用"}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
