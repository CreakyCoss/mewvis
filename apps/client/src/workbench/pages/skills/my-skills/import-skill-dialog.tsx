import { useEffect, useState } from "react";
import { openSystemDialog as openDialog } from "@/api/native";
import { Download, FileArchive, Globe2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getSkills, installSkillFromMarketplace } from "@/api/skills";
import { Alert, AlertDescription } from "design-system/components/ui/alert";
import { Button } from "design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "design-system/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "design-system/components/ui/tabs";
import { Textarea } from "design-system/components/ui/textarea";
import { useSkillsStore } from "../store";

type ImportMode = "remote" | "zip";

type ImportSkillDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export const ImportSkillDialog = ({ open, onOpenChange }: ImportSkillDialogProps) => {
  const skillsStore = useSkillsStore();
  const [importMode, setImportMode] = useState<ImportMode>("remote");
  const [source, setSource] = useState("");
  const [zipPath, setZipPath] = useState("");
  const [error, setError] = useState("");
  const [isInstalling, setIsInstalling] = useState(false);
  const selectedZipFileName = zipPath.split(/[\\/]/).pop() ?? zipPath;
  const hasZipFile = Boolean(zipPath);

  useEffect(() => {
    if (!open) {
      setImportMode("remote");
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
    if (importMode === "remote" && !nextSource) {
      setError("请粘贴 SkillsMP、GitHub 或 skills add 安装来源");
      return;
    }
    if (importMode === "zip" && !nextZipPath) {
      setError("请选择一个 Skill zip 文件");
      return;
    }

    setIsInstalling(true);
    setError("");
    try {
      const installedSkill = await installSkillFromMarketplace(
        importMode === "zip"
          ? { source: nextZipPath, sourceKind: "zip" }
          : { source: nextSource, sourceKind: "remote" },
      );
      const settings = await getSkills();
      skillsStore.setSkillSettings(settings);
      toast.success("技能导入成功", {
        description: `${installedSkill.name} 已添加到 Skill库`,
      });
      setSource("");
      setZipPath("");
      onOpenChange(false);
    } catch (caught) {
      setError(String(caught));
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!flex max-h-[calc(100vh-2rem)] w-[500px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[500px]">
        <DialogHeader className="border-b border-border/60 bg-surface-raised/85 px-6 py-5 pr-14 text-left">
          <DialogTitle>导入 Skill</DialogTitle>
          <DialogDescription>选择在线来源或本地 zip 文件，将 Skill 添加到 Skill库。</DialogDescription>
        </DialogHeader>

        <div className="app-canvas min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <Tabs
            value={importMode}
            onValueChange={(value) => {
              setImportMode(value as ImportMode);
              setError("");
            }}
          >
            <TabsList className="grid h-10 w-full grid-cols-2 rounded-xl bg-muted/60 p-1">
              <TabsTrigger value="remote" className="rounded-lg text-sm">
                <Globe2 className="size-4" />
                <span>在线导入</span>
              </TabsTrigger>
              <TabsTrigger value="zip" className="rounded-lg text-sm">
                <FileArchive className="size-4" />
                <span>本地上传</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="remote" className="mt-4">
              <Textarea
                id="skill-import-source"
                value={source}
                onChange={(event) => setSource(event.target.value)}
                placeholder="粘贴安装来源&#10;支持 SkillsMP、GitHub 或 skills add 命令&#10;例如：https://skillsmp.com/zh/skill/...&#10;或 skills add https://github.com/... --skill ..."
                className="h-[140px] min-h-[140px] resize-none"
                disabled={isInstalling}
              />
            </TabsContent>

            <TabsContent value="zip" className="mt-4">
              <button
                id="skill-import-zip"
                type="button"
                className={[
                  "flex h-[140px] w-full flex-col items-center justify-center rounded-xl border border-dashed px-5 py-6 text-center transition-colors",
                  "focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none",
                  hasZipFile
                    ? "border-primary/45 bg-primary/5"
                    : "border-muted-foreground/45 bg-transparent hover:border-muted-foreground/70 hover:bg-muted/15",
                ].join(" ")}
                onClick={() => void chooseZipFile()}
                disabled={isInstalling}
              >
                <span className="text-base font-medium text-foreground">
                  {hasZipFile ? selectedZipFileName : "点击导入"}
                </span>
                <span className="mt-2 text-sm text-muted-foreground">
                  {hasZipFile ? "再次点击可重新选择文件" : "压缩包需包含 SKILL.md 文件"}
                </span>
                <span className="mt-1 max-w-full truncate text-sm text-muted-foreground">
                  {hasZipFile ? zipPath : ".md 文件需包含 YAML 格式的技能名称和描述"}
                </span>
              </button>
            </TabsContent>
          </Tabs>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="border-t border-border/60 bg-surface-raised/85 px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isInstalling}>
            取消
          </Button>
          <Button type="button" onClick={() => void handleImport()} disabled={isInstalling}>
            {isInstalling ? (
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
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
