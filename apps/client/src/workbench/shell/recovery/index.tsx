import { useCallback, useEffect, useState } from "react";
import { Database, FolderOpen, Loader2, Trash2 } from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { getConfigDatabaseStatus, rebuildConfigDatabase } from "@/api/recovery";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "design-system/components/ui/alert-dialog";
import { Button } from "design-system/components/ui/button";
import type { ConfigDatabaseStatus } from "./types";

type ConfigDatabaseDialogProps = {
  onRecovered: () => void | Promise<void>;
};

export const ConfigDatabaseDialog = ({ onRecovered }: ConfigDatabaseDialogProps) => {
  const [status, setStatus] = useState<ConfigDatabaseStatus | null>(null);
  const [statusLoadError, setStatusLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [isRebuilding, setIsRebuilding] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      setStatusLoadError("");
      setStatus(await getConfigDatabaseStatus());
    } catch (caught) {
      setStatusLoadError(String(caught));
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const handleReveal = async () => {
    if (!status?.configDbPath) {
      return;
    }

    try {
      setActionError("");
      if (isTauri()) await revealItemInDir(status.configDbPath);
      else await navigator.clipboard.writeText(status.configDbPath);
    } catch (caught) {
      setActionError(String(caught));
    }
  };

  const handleRebuild = async () => {
    setIsRebuilding(true);
    setActionError("");

    try {
      const nextStatus = await rebuildConfigDatabase();
      setStatus(nextStatus);
      if (!nextStatus.setupError) {
        await onRecovered();
      }
    } catch (caught) {
      setActionError(String(caught));
    } finally {
      setIsRebuilding(false);
    }
  };

  const setupError = statusLoadError || status?.setupError || "";
  const rebuildWarnings = status?.lastRebuild?.warnings ?? [];
  const shouldShowRecoveredWarnings = !setupError && rebuildWarnings.length > 0;
  const isOpen = Boolean(setupError) || shouldShowRecoveredWarnings;
  const handleDismissWarnings = () => {
    setStatus((current) =>
      current
        ? {
            ...current,
            lastRebuild: null,
          }
        : current,
    );
  };

  return (
    <AlertDialog open={isOpen}>
      <AlertDialogContent className="sm:max-w-xl">
        <AlertDialogHeader>
          <AlertDialogMedia
            className={setupError ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"}
          >
            <Database className="size-8" />
          </AlertDialogMedia>
          <AlertDialogTitle>
            {statusLoadError ? "无法连接后端服务" : setupError ? "配置数据库需要重建" : "配置数据库已重建"}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-left">
              {statusLoadError ? (
                <p>请检查服务是否已启动，再重试连接。</p>
              ) : setupError ? (
                <p>
                  当前配置数据库结构无法继续使用。重建时会先读取旧库数据，字段名称与新结构一致的表会自动写回新数据库。
                </p>
              ) : (
                <p>配置数据库已完成重建，过程中有需要注意的信息。</p>
              )}
              {status?.configDbPath && (
                <div className="rounded-xl border border-border/60 bg-muted/35 px-3 py-2.5 font-mono text-xs break-all text-foreground">
                  {status.configDbPath}
                </div>
              )}
              {setupError && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
                  {setupError}
                </div>
              )}
              {actionError && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
                  {actionError}
                </div>
              )}
              {rebuildWarnings.length > 0 && (
                <div className="rounded-xl border border-warning/25 bg-warning/10 px-3 py-2.5 text-xs text-foreground">
                  <div className="mb-1 font-medium">重建提示</div>
                  <ul className="list-disc space-y-1 pl-4">
                    {rebuildWarnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button type="button" variant="outline" disabled={!status?.configDbPath} onClick={handleReveal}>
            <FolderOpen className="size-4" />
            <span>{isTauri() ? "打开位置" : "复制路径"}</span>
          </Button>
          {statusLoadError ? (
            <Button onClick={() => window.location.reload()}>重试连接</Button>
          ) : setupError ? (
            <Button
              type="button"
              variant="destructive"
              disabled={!status?.canRebuild || isRebuilding}
              onClick={handleRebuild}
            >
              {isRebuilding ? (
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
              ) : (
                <Trash2 className="size-4" />
              )}
              <span>{isRebuilding ? "正在重建" : "删除并重建"}</span>
            </Button>
          ) : (
            <Button type="button" onClick={handleDismissWarnings}>
              <span>完成</span>
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
