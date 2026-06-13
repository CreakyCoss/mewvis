import { useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { Download, FileArchive, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { InstallSkillInput } from "../../types";

type ImportSkillDialogProps = {
  open: boolean;
  isInstalling: boolean;
  onOpenChange: (open: boolean) => void;
  onInstallSkill: (input: InstallSkillInput) => Promise<void>;
};

export const ImportSkillDialog = ({
  open,
  isInstalling,
  onOpenChange,
  onInstallSkill,
}: ImportSkillDialogProps) => {
  const [source, setSource] = useState("");
  const [zipPath, setZipPath] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setZipPath("");
      setError("");
    }
  }, [open]);

  const chooseZipFile = async () => {
    const selected = await openDialog({
      multiple: false,
      directory: false,
      title: "选择 Skill zip 文件",
      filters: [
        {
          name: "Skill zip",
          extensions: ["zip"],
        },
      ],
    });

    if (typeof selected === "string") {
      setZipPath(selected);
      setError("");
    }
  };

  const handleImport = async () => {
    const nextSource = source.trim();
    const nextZipPath = zipPath.trim();
    if (!nextSource && !nextZipPath) {
      setError("请粘贴安装来源，或选择一个 Skill zip 文件");
      return;
    }

    setError("");
    await onInstallSkill(
      nextZipPath
        ? { source: nextZipPath, sourceKind: "zip" }
        : { source: nextSource, sourceKind: "remote" },
    );
    setSource("");
    setZipPath("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>导入 Skill</DialogTitle>
          <DialogDescription>
            在线导入支持 SkillsMP、GitHub 或 skills add 命令；本地上传支持 Skill zip 文件。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Textarea
            value={source}
            onChange={(event) => setSource(event.target.value)}
            placeholder="https://skillsmp.com/zh/skill/...&#10;或 skills add https://github.com/... --skill ..."
            className="min-h-28 resize-none"
            disabled={isInstalling || Boolean(zipPath)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => void chooseZipFile()}
              disabled={isInstalling || Boolean(source.trim())}
            >
              <FileArchive className="size-4" />
              <span>本地上传 zip</span>
            </Button>
            {zipPath && (
              <div className="min-w-0 flex-1 truncate rounded-full bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
                {zipPath}
              </div>
            )}
            {zipPath && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 rounded-full px-2"
                onClick={() => setZipPath("")}
                disabled={isInstalling}
              >
                清除
              </Button>
            )}
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isInstalling}
          >
            取消
          </Button>
          <Button
            type="button"
            onClick={() => void handleImport()}
            disabled={isInstalling}
          >
            {isInstalling ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            <span>导入</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
