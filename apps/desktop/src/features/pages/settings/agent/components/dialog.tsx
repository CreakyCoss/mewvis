import { Bot, Plus, Save, Trash2 } from "lucide-react";
import { agentAvatarGroups, normalizeAgentAvatarId, resolveAvatar } from "@/assets/avatars";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAgentSettings } from "../hooks/use-agent";

type AgentSettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export const AgentSettingsDialog = ({ open, onOpenChange }: AgentSettingsDialogProps) => {
  const {
    agents,
    draft,
    selectedAgentId,
    isLoading,
    isSaving,
    error,
    createNew,
    selectAgent,
    updateDraft,
    save,
    remove,
  } = useAgentSettings(open);
  const draftAvatar = resolveAvatar(normalizeAgentAvatarId(draft.avatar));

  const handleSave = async () => {
    const didSave = await save();
    if (didSave) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100vh-2rem)] flex-col gap-0 overflow-hidden border-border/70 bg-popover p-0 shadow-[var(--shadow-floating)] sm:max-w-5xl">
        <DialogHeader>
          <div className="border-b border-border/70 bg-card/35 px-6 pt-6 pb-4">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-primary">
                <Bot className="size-4" />
              </span>
              <span>角色设置</span>
            </DialogTitle>
            <DialogDescription className="mt-2">创建可复用的角色画像，聊天时可与任意模型独立组合。</DialogDescription>
          </div>
        </DialogHeader>

        {error && (
          <div className="mx-6 mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="grid min-h-0 flex-1 gap-0 md:grid-cols-[260px_1fr]">
          <aside className="flex min-h-0 flex-col gap-3 border-r border-border/70 bg-surface/60 px-4 py-4">
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start"
              onClick={createNew}
              disabled={isLoading}
            >
              <Plus className="size-4" />
              <span>新增角色</span>
            </Button>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {agents.map((agent) => {
                const avatar = resolveAvatar(normalizeAgentAvatarId(agent.avatar));
                return (
                  <button
                    key={agent.id}
                    type="button"
                    className={[
                      "flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-[color,background-color,border-color,box-shadow] motion-reduce:transition-none",
                      agent.id === selectedAgentId
                        ? "border-primary/20 bg-card text-foreground ring-1 ring-primary/10"
                        : "border-transparent bg-card/65 hover:bg-card",
                    ].join(" ")}
                    onClick={() => selectAgent(agent.id)}
                  >
                    <img src={avatar.src} alt="" className="size-8 shrink-0 rounded-md" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{agent.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {agent.description || "暂无描述"}
                      </span>
                    </span>
                  </button>
                );
              })}
              {!agents.length && !isLoading && (
                <div className="app-empty-state rounded-xl px-3 py-8 text-center text-sm text-muted-foreground">
                  暂无角色，请手动创建
                </div>
              )}
            </div>
          </aside>

          <section className="min-h-0 overflow-y-auto px-5 py-4">
            {isLoading ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                正在读取角色设置
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-[1fr_220px]">
                  <div className="space-y-2">
                    <Label htmlFor="agent-name">角色名称</Label>
                    <Input
                      id="agent-name"
                      value={draft.name}
                      placeholder="例如：长篇策划师"
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        updateDraft((current) => ({ ...current, name: value }));
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="agent-avatar-preview">头像预览</Label>
                    <div
                      id="agent-avatar-preview"
                      className="flex h-9 items-center gap-2 rounded-lg border border-border/70 bg-card px-2 shadow-xs"
                    >
                      <img src={draftAvatar.src} alt="" className="size-7 rounded-md" />
                      <span className="truncate text-sm">{draftAvatar.label}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>选择头像</Label>
                  <div className="max-h-[360px] space-y-4 overflow-y-auto pr-1">
                    {agentAvatarGroups.map((group) => (
                      <section key={group.id} className="space-y-2">
                        <div>
                          <div className="text-xs font-medium text-foreground">{group.label}</div>
                          <div className="text-xs leading-4 text-muted-foreground">{group.description}</div>
                        </div>
                        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                          {group.options.map((avatar) => (
                            <button
                              key={avatar.id}
                              type="button"
                              className={[
                                "rounded-lg border bg-card p-1 text-center transition-[background-color,border-color,box-shadow] motion-reduce:transition-none hover:bg-accent/35 focus-visible:ring-3 focus-visible:ring-ring/25 focus-visible:outline-none",
                                normalizeAgentAvatarId(draft.avatar) === avatar.id
                                  ? "border-primary/50 ring-1 ring-primary/20"
                                  : "border-transparent",
                              ].join(" ")}
                              title={avatar.label}
                              onClick={() => updateDraft((current) => ({ ...current, avatar: avatar.id }))}
                            >
                              <img
                                src={avatar.src}
                                alt={avatar.label}
                                className="aspect-square w-full rounded-md object-cover"
                              />
                              <span className="mt-1 block truncate text-xs text-muted-foreground">{avatar.label}</span>
                            </button>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="agent-description">角色描述</Label>
                  <Textarea
                    id="agent-description"
                    value={draft.description ?? ""}
                    placeholder="描述这个角色的定位、能力或适用场景"
                    className="min-h-24 resize-none"
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      updateDraft((current) => ({ ...current, description: value }));
                    }}
                  />
                </div>

                {selectedAgentId && (
                  <div className="flex justify-end rounded-xl border border-border/60 bg-muted/25 px-3 py-2.5">
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => void remove(selectedAgentId)}
                      disabled={isSaving}
                    >
                      <Trash2 className="size-4" />
                      <span>删除角色</span>
                    </Button>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        <DialogFooter className="border-t border-border/70 bg-card/35 px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={isSaving || isLoading}>
            <Save className="size-4" />
            <span>{isSaving ? "保存中" : "保存角色"}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
