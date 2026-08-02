import { useImperativeHandle, useState, type Ref } from "react";
import { Bot, Loader2, Save, Trash2 } from "lucide-react";
import { deleteAiAgent, saveAiAgent } from "@/api/agents";
import { agentAvatarGroups, defaultAgentAvatar, normalizeAgentAvatarId, resolveAvatar } from "@/assets/avatars";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import type { AiAgent, SaveAiAgentInput } from "./types";

type AgentEditMode = "create" | "edit";

type AgentEditDialogOpenOptions = { mode: "create" } | { mode: "edit"; agent: AiAgent };

export type AgentEditDialogHandle = {
  open: (options?: AgentEditDialogOpenOptions) => void;
};

type AgentEditDialogProps = {
  bind: Ref<AgentEditDialogHandle>;
  onSaved?: () => void | Promise<void>;
};

export const AgentEditDialog = ({ bind, onSaved }: AgentEditDialogProps) => {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AgentEditMode>("create");
  const [draft, setDraft] = useState<SaveAiAgentInput | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [error, setError] = useState("");

  const resetTransientState = () => {
    setError("");
    setIsDeleteConfirmOpen(false);
  };

  const openCreateAgent = () => {
    setMode("create");
    setDraft({
      id: null,
      name: "",
      avatar: defaultAgentAvatar.id,
      description: "",
    });
    resetTransientState();
    setOpen(true);
  };

  const openEditAgent = (agent: AiAgent) => {
    setMode("edit");
    setDraft({
      id: agent.id,
      name: agent.name,
      avatar: normalizeAgentAvatarId(agent.avatar),
      description: agent.description ?? "",
    });
    resetTransientState();
    setOpen(true);
  };

  const closeDialog = () => {
    setOpen(false);
    setDraft(null);
    resetTransientState();
  };

  useImperativeHandle(
    bind,
    () => ({
      open: (options = { mode: "create" }) => {
        if (options.mode === "edit") {
          openEditAgent(options.agent);
          return;
        }

        openCreateAgent();
      },
    }),
    [bind],
  );

  const updateDraft = (updater: (current: SaveAiAgentInput) => SaveAiAgentInput) => {
    setDraft((current) => (current ? updater(current) : current));
  };

  const saveAgent = async () => {
    if (!draft) return;

    if (!draft.name.trim()) {
      setError("角色名称不能为空");
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      await saveAiAgent({
        ...draft,
        name: draft.name.trim(),
        avatar: normalizeAgentAvatarId(draft.avatar),
        description: draft.description?.trim() || null,
      });
      closeDialog();
      await onSaved?.();
    } catch (caught) {
      setError(String(caught));
    } finally {
      setIsSaving(false);
    }
  };

  const deleteAgent = async () => {
    if (mode !== "edit" || !draft?.id) return;

    setIsSaving(true);
    setError("");

    try {
      await deleteAiAgent(draft.id);
      setIsDeleteConfirmOpen(false);
      closeDialog();
      await onSaved?.();
    } catch (caught) {
      setIsDeleteConfirmOpen(false);
      setError(String(caught));
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (isSaving) return;

    if (!nextOpen) {
      closeDialog();
      return;
    }

    setOpen(true);
  };

  const draftAvatar = draft ? resolveAvatar(normalizeAgentAvatarId(draft.avatar)) : null;

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="!flex max-h-[calc(100vh-2rem)] w-[min(720px,calc(100vw-2rem))] flex-col gap-0 overflow-hidden border-border/70 bg-popover p-0 shadow-[var(--shadow-floating)] sm:max-w-[720px]">
          <DialogHeader className="shrink-0">
            <div className="border-b border-border/70 bg-card/35 px-6 pt-6 pb-5">
              <DialogTitle className="flex items-center gap-3 text-lg font-semibold">
                <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-primary">
                  <Bot className="size-5" />
                </span>
                <span>{mode === "create" ? "新增角色" : "编辑角色"}</span>
              </DialogTitle>
              <DialogDescription className="mt-1.5 pl-[52px]">配置角色名称、头像和能力描述。</DialogDescription>
            </div>
          </DialogHeader>

          {draft && draftAvatar ? (
            <form
              className="flex min-h-0 flex-col"
              onSubmit={(event) => {
                event.preventDefault();
                void saveAgent();
              }}
            >
              <div className="min-h-0 max-h-[calc(100vh-12rem)] overflow-y-auto">
                {error ? (
                  <div
                    role="alert"
                    className="mx-6 mt-5 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
                  >
                    {error}
                  </div>
                ) : null}

                <section className="px-6 py-5" aria-labelledby="agent-basic-heading">
                  <h3 id="agent-basic-heading" className="mb-4 text-sm font-semibold">
                    基本信息
                  </h3>

                  <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
                    <div className="space-y-2">
                      <Label htmlFor="agent-name">角色名称</Label>
                      <Input
                        id="agent-name"
                        value={draft.name}
                        placeholder="例如：长篇策划师"
                        autoFocus
                        onChange={(event) => {
                          const name = event.currentTarget.value;
                          updateDraft((current) => ({ ...current, name }));
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

                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="agent-description">角色描述</Label>
                      <Textarea
                        id="agent-description"
                        value={draft.description ?? ""}
                        placeholder="描述这个角色的定位、能力或适用场景"
                        className="min-h-24 resize-none"
                        onChange={(event) => {
                          const description = event.currentTarget.value;
                          updateDraft((current) => ({ ...current, description }));
                        }}
                      />
                    </div>
                  </div>
                </section>

                <section className="border-t border-border/70 px-6 py-5" aria-labelledby="agent-avatar-heading">
                  <div className="mb-4">
                    <h3 id="agent-avatar-heading" className="text-sm font-semibold">
                      选择头像
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">头像用于聊天和协作流程中的角色识别。</p>
                  </div>

                  <div className="space-y-5">
                    {agentAvatarGroups.map((group) => (
                      <div key={group.id} className="space-y-2.5">
                        <div>
                          <div className="text-xs font-medium text-foreground">{group.label}</div>
                          <div className="text-xs leading-4 text-muted-foreground">{group.description}</div>
                        </div>
                        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                          {group.options.map((avatar) => {
                            const isSelected = normalizeAgentAvatarId(draft.avatar) === avatar.id;

                            return (
                              <button
                                key={avatar.id}
                                type="button"
                                className={[
                                  "min-h-20 rounded-lg border bg-card p-1 text-center transition-colors motion-reduce:transition-none hover:bg-accent/35 focus-visible:ring-3 focus-visible:ring-ring/25 focus-visible:outline-none",
                                  isSelected ? "border-primary/50 bg-accent/20" : "border-transparent",
                                ].join(" ")}
                                aria-label={`选择头像：${avatar.label}`}
                                aria-pressed={isSelected}
                                title={avatar.label}
                                onClick={() => updateDraft((current) => ({ ...current, avatar: avatar.id }))}
                              >
                                <img src={avatar.src} alt="" className="aspect-square w-full rounded-md object-cover" />
                                <span className="mt-1 block truncate text-xs text-muted-foreground">
                                  {avatar.label}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <DialogFooter className="shrink-0 border-t border-border/70 bg-card/35 px-6 py-4 sm:justify-between">
                <div>
                  {mode === "edit" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setIsDeleteConfirmOpen(true)}
                      disabled={isSaving}
                    >
                      <Trash2 className="size-4" />
                      <span>删除角色</span>
                    </Button>
                  ) : null}
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isSaving}>
                    取消
                  </Button>
                  <Button type="submit" disabled={isSaving}>
                    {isSaving ? (
                      <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                    ) : (
                      <Save className="size-4" />
                    )}
                    <span>{isSaving ? "正在保存" : "保存角色"}</span>
                  </Button>
                </div>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除“{draft?.name || "这个角色"}”？</AlertDialogTitle>
            <AlertDialogDescription>
              删除后，引用此角色的聊天选项和协作流程可能不再可用。此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={isSaving} onClick={() => void deleteAgent()}>
              {isSaving ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> : null}
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
