import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import type { WorkspaceSkill } from "../types";

type SkillsDialogProps = {
  open: boolean;
  skills: WorkspaceSkill[];
  enabledSkillNames: string[];
  isLoading: boolean;
  isSaving: boolean;
  error: string;
  onOpenChange: (open: boolean) => void;
  onToggleSkill: (name: string, enabled: boolean) => void;
  onSave: () => void;
};

export const SkillsDialog = ({
  open,
  skills,
  enabledSkillNames,
  isLoading,
  isSaving,
  error,
  onOpenChange,
  onToggleSkill,
  onSave,
}: SkillsDialogProps) => {
  const enabledNames = new Set(enabledSkillNames);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4" />
            <span>工作区 Skills</span>
          </DialogTitle>
          <DialogDescription>
            选择这个工作区启用的能力。聊天和 Agent 执行会使用同一组 Skills。
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <ScrollArea className="max-h-[420px] rounded-md border border-border bg-background">
          <div className="divide-y divide-border/70">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                <span>正在读取 Skills</span>
              </div>
            ) : skills.length > 0 ? (
              skills.map((skill) => (
                <label
                  key={skill.name}
                  className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-muted/45"
                >
                  <Switch
                    className="mt-0.5"
                    checked={enabledNames.has(skill.name)}
                    onCheckedChange={(checked) => onToggleSkill(skill.name, checked)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-sm font-medium">
                      {skill.name}
                    </span>
                    <span className="mt-1 block text-sm leading-5 text-muted-foreground">
                      {skill.description}
                    </span>
                  </span>
                </label>
              ))
            ) : (
              <div className="px-4 py-12 text-center text-sm text-muted-foreground">
                暂无可用 Skills
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" onClick={onSave} disabled={isSaving || isLoading}>
            {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            <span>保存</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
