import { CheckCircle2, Circle, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  const enabledSkills = skills.filter((skill) => enabledNames.has(skill.name));
  const disabledSkillCount = Math.max(skills.length - enabledSkills.length, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogContent
        overlayClassName="top-12 left-0 bg-transparent supports-backdrop-filter:backdrop-blur-0 md:left-[288px]"
        className="top-12 right-0 bottom-0 left-0 h-auto w-auto max-w-none translate-x-0 translate-y-0 overflow-hidden rounded-none bg-background p-0 ring-0 shadow-[-10px_0_32px_-28px_rgb(15_23_42_/_0.45)] sm:w-auto sm:max-w-none md:left-[288px]"
      >
        <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[248px_minmax(0,1fr)]">
          <aside className="hidden min-h-0 bg-background/85 px-5 py-5 shadow-[10px_0_32px_-30px_rgb(15_23_42_/_0.28)] lg:flex lg:flex-col">
            <div className="flex items-center gap-2">
              <Sparkles className="size-5 text-sidebar-primary" />
              <span className="text-xl font-semibold tracking-normal">技能广场</span>
            </div>

            <div className="mt-8 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-muted/55 p-4">
                <div className="text-xs text-muted-foreground">已启用</div>
                <div className="mt-2 text-3xl font-semibold">
                  {enabledSkills.length}
                </div>
              </div>
              <div className="rounded-2xl bg-muted/55 p-4">
                <div className="text-xs text-muted-foreground">可用</div>
                <div className="mt-2 text-3xl font-semibold">
                  {skills.length}
                </div>
              </div>
            </div>

            <div className="mt-8 min-h-0 flex-1">
              <div className="text-xs font-medium text-muted-foreground">当前技能</div>
              <ScrollArea className="mt-3 h-[calc(100%-2rem)]">
                <div className="space-y-1.5 pr-1">
                  {enabledSkills.length ? (
                    enabledSkills.map((skill) => (
                      <div
                        key={skill.name}
                        className="flex min-w-0 items-center gap-2 rounded-xl bg-muted px-3 py-2 text-sm"
                      >
                        <CheckCircle2 className="size-3.5 shrink-0 text-sidebar-primary" />
                        <span className="min-w-0 truncate font-mono">{skill.name}</span>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl bg-muted/35 px-3 py-4 text-sm leading-5 text-muted-foreground">
                      还没有启用技能。
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>

            <div className="mt-5 rounded-2xl bg-muted/30 px-3 py-3 text-xs leading-5 text-muted-foreground">
              聊天和 Agent 执行会共享当前工作区启用的技能。
            </div>
          </aside>

          <main className="flex min-h-0 min-w-0 flex-col overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-5 pr-16 shadow-[0_10px_30px_-30px_rgb(15_23_42_/_0.32)] lg:px-7">
              <DialogHeader className="min-w-0 max-w-2xl">
                <DialogTitle className="flex items-center gap-2 text-2xl font-semibold tracking-normal">
                  <Sparkles className="size-5 text-sidebar-primary" />
                  <span>技能广场</span>
                </DialogTitle>
                <DialogDescription>
                  选择这个工作区启用的能力。已启用技能会参与聊天和 Agent 执行。
                </DialogDescription>
              </DialogHeader>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  取消
                </Button>
                <Button type="button" onClick={onSave} disabled={isSaving || isLoading}>
                  {isSaving ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                  <span>保存</span>
                </Button>
              </div>
            </div>

            {error && (
              <div className="mx-5 mt-5 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive lg:mx-7">
                {error}
              </div>
            )}

            <ScrollArea className="min-h-0 flex-1">
              <div className="p-5 lg:p-7">
                {isLoading ? (
                  <div className="flex min-h-[320px] items-center justify-center gap-2 rounded-[24px] bg-muted/25 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    <span>正在读取 Skills</span>
                  </div>
                ) : skills.length > 0 ? (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {skills.map((skill) => {
                      const isEnabled = enabledNames.has(skill.name);
                      return (
                        <article
                          key={skill.name}
                          className={[
                            "min-w-0 rounded-[24px] border p-4 shadow-xs transition-colors",
                            isEnabled
                              ? "border-sidebar-primary/20 bg-sidebar-primary/5"
                              : "border-transparent bg-card hover:bg-muted/30",
                          ].join(" ")}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                              {isEnabled ? (
                                <CheckCircle2 className="size-5 text-sidebar-primary" />
                              ) : (
                                <Circle className="size-5" />
                              )}
                            </div>
                            <Switch
                              checked={isEnabled}
                              disabled={isSaving}
                              aria-label={`${skill.name} 启用状态`}
                              onCheckedChange={(checked) => onToggleSkill(skill.name, checked)}
                            />
                          </div>

                          <div className="mt-4 flex min-w-0 items-center gap-2">
                            <h3 className="min-w-0 flex-1 truncate font-mono text-sm font-semibold">
                              {skill.name}
                            </h3>
                            <span
                              className={[
                                "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                                isEnabled
                                  ? "bg-sidebar-primary/10 text-sidebar-primary"
                                  : "bg-muted text-muted-foreground",
                              ].join(" ")}
                            >
                              {isEnabled ? "已启用" : "未启用"}
                            </span>
                          </div>
                          <p className="mt-3 max-h-28 overflow-hidden text-sm leading-6 text-muted-foreground">
                            {skill.description || "暂无描述"}
                          </p>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex min-h-[320px] items-center justify-center rounded-[24px] bg-muted/25 text-sm text-muted-foreground">
                    暂无可用 Skills
                  </div>
                )}

                {!isLoading && skills.length > 0 && (
                  <div className="mt-5 text-center text-xs text-muted-foreground">
                    已停用 {disabledSkillCount} 个技能
                  </div>
                )}
              </div>
            </ScrollArea>
          </main>
        </div>
      </DialogContent>
    </Dialog>
  );
};
