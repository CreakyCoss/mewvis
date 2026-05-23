import { Bot, Plus, Save, Trash2 } from "lucide-react";
import { agentAvatarOptions, resolveAgentAvatar } from "@/assets/agent-avatars";
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
import { useAgentSettings } from "../hooks/use-agent-settings";

type AgentSettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export const AgentSettingsDialog = ({
  open,
  onOpenChange,
}: AgentSettingsDialogProps) => {
  const {
    agents,
    providers,
    draft,
    selectedAgentId,
    selectedProvider,
    selectedModels,
    isLoading,
    isSaving,
    error,
    createNew,
    selectAgent,
    updateDraft,
    save,
    remove,
  } = useAgentSettings(open);

  const handleSave = async () => {
    const didSave = await save();
    if (didSave) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 border border-border/70 p-0 shadow-lg sm:max-w-5xl">
        <DialogHeader>
          <div className="border-b border-border/80 px-6 pt-6 pb-4">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <span className="flex size-8 items-center justify-center rounded-md border border-primary/15 bg-accent text-primary">
                <Bot className="size-4" />
              </span>
              <span>Agent 设置</span>
            </DialogTitle>
            <DialogDescription className="mt-2">
              创建可复用的 Agent，绑定一个已配置 LLM 和具体模型。
            </DialogDescription>
          </div>
        </DialogHeader>

        {error && (
          <div className="mx-6 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="grid min-h-[520px] gap-0 md:grid-cols-[260px_1fr]">
          <aside className="flex min-h-0 flex-col gap-3 border-b border-border/80 bg-muted/35 px-4 py-4 md:border-r md:border-b-0">
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start"
              onClick={createNew}
              disabled={isLoading}
            >
              <Plus className="size-4" />
              <span>新增 Agent</span>
            </Button>

            <div className="min-h-0 space-y-2 overflow-y-auto pr-1">
              {agents.map((agent) => {
                const avatar = resolveAgentAvatar(agent.avatar);
                return (
                  <button
                    key={agent.id}
                    type="button"
                    className={[
                      "flex w-full items-center gap-2 rounded-md border px-3 py-2.5 text-left text-sm shadow-xs transition-all",
                      agent.id === selectedAgentId
                        ? "border-primary/30 bg-card text-foreground ring-1 ring-primary/15"
                        : "border-border/70 bg-card/65 hover:bg-card",
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
                <div className="rounded-md border border-dashed border-border bg-card/65 px-3 py-8 text-center text-sm text-muted-foreground">
                  暂无自定义 Agent
                </div>
              )}
            </div>
          </aside>

          <section className="min-h-0 overflow-y-auto px-5 py-4">
            {isLoading ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                正在读取 Agent 设置
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-[1fr_220px]">
                  <div className="space-y-2">
                    <Label htmlFor="agent-name">Agent 名称</Label>
                    <Input
                      id="agent-name"
                      value={draft.name}
                      placeholder="例如：长篇策划猫"
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
                      className="flex h-9 items-center gap-2 rounded-md border border-input bg-background px-2 shadow-xs"
                    >
                      <img
                        src={resolveAgentAvatar(draft.avatar).src}
                        alt=""
                        className="size-7 rounded-md"
                      />
                      <span className="truncate text-sm">
                        {resolveAgentAvatar(draft.avatar).label}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>选择头像</Label>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {agentAvatarOptions.map((avatar) => (
                      <button
                        key={avatar.id}
                        type="button"
                        className={[
                          "rounded-md border bg-card p-1.5 text-center shadow-xs transition-all hover:border-primary/45 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                          draft.avatar === avatar.id ? "border-primary ring-1 ring-primary/20" : "border-border",
                        ].join(" ")}
                        title={avatar.label}
                        onClick={() => updateDraft((current) => ({ ...current, avatar: avatar.id }))}
                      >
                        <img src={avatar.src} alt={avatar.label} className="aspect-square w-full rounded-md" />
                        <span className="mt-1 block truncate text-[11px] text-muted-foreground">
                          {avatar.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="agent-description">Agent 描述</Label>
                  <Textarea
                    id="agent-description"
                    value={draft.description ?? ""}
                    placeholder="描述这个 Agent 的角色、能力或适用场景"
                    className="min-h-24 resize-none"
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      updateDraft((current) => ({ ...current, description: value }));
                    }}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="agent-provider">LLM</Label>
                    <select
                      id="agent-provider"
                      className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm shadow-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      value={draft.providerId}
                      disabled={providers.length === 0}
                      onChange={(event) => {
                        const providerId = event.currentTarget.value;
                        const provider = providers.find((item) => item.id === providerId);
                        const model = provider?.models.find((item) => item.isEnabled);
                        updateDraft((current) => ({
                          ...current,
                          providerId,
                          modelId: model?.id ?? "",
                        }));
                      }}
                    >
                      {providers.length === 0 ? (
                        <option value="">未配置 LLM</option>
                      ) : (
                        providers.map((provider) => (
                          <option key={provider.id} value={provider.id}>
                            {provider.name}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="agent-model">模型</Label>
                    <select
                      id="agent-model"
                      className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm shadow-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      value={draft.modelId}
                      disabled={!selectedProvider || selectedModels.length === 0}
                      onChange={(event) => {
                        const modelId = event.currentTarget.value;
                        updateDraft((current) => ({ ...current, modelId }));
                      }}
                    >
                      {selectedModels.length === 0 ? (
                        <option value="">未启用模型</option>
                      ) : (
                        selectedModels.map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.modelName || model.modelId}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </div>

                {selectedAgentId && (
                  <div className="flex justify-end rounded-md border border-border/70 bg-muted/35 px-3 py-2.5">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void remove(selectedAgentId)}
                      disabled={isSaving}
                    >
                      <Trash2 className="size-4" />
                      <span>删除 Agent</span>
                    </Button>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        <DialogFooter className="border-t border-border/80 px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={isSaving || isLoading}>
            <Save className="size-4" />
            <span>{isSaving ? "保存中" : "保存 Agent"}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
