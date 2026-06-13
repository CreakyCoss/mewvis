import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
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
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setError("");
    }
  }, [open]);

  const handleImport = async () => {
    const nextSource = source.trim();
    if (!nextSource) {
      setError("请粘贴 SkillsMP 链接、GitHub 链接或 skills add 命令");
      return;
    }

    setError("");
    await onInstallSkill({ source: nextSource });
    setSource("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>导入 Skill</DialogTitle>
          <DialogDescription>
            粘贴 SkillsMP 详情页、GitHub 链接或 skills add 命令，Skill 会安装到应用技能目录。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Textarea
            value={source}
            onChange={(event) => setSource(event.target.value)}
            placeholder="https://skillsmp.com/zh/skill/...&#10;或 skills add https://github.com/... --skill ..."
            className="min-h-28 resize-none"
            disabled={isInstalling}
          />
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
