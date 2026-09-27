import { useImperativeHandle, useState, type Ref } from "react";
import { Loader2, Save, Trash2 } from "lucide-react";
import { deleteAgent, saveAgent } from "@/api/agents";
import { getSkills } from "@/api/skills";
import { listKnowledgeLibrary } from "@/api/knowledge";
import { listAgentRuntimeTools } from "@/api/agent-runtime";
import { agentAvatarOptions, defaultAgentAvatar, normalizeAgentAvatarId, resolveAvatar } from "@/assets/avatars";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "design-system/components/ui/alert-dialog";
import { Button } from "design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "design-system/components/ui/dialog";
import { Input } from "design-system/components/ui/input";
import { Label } from "design-system/components/ui/label";
import { Textarea } from "design-system/components/ui/textarea";
import type { AgentDefinition, SaveAgentInput } from "./types";

type OpenOptions = { mode: "create" } | { mode: "edit" | "copy"; agent: AgentDefinition };
export type AgentEditDialogHandle = { open(options?: OpenOptions): void };
type BindingOption = { value: string; label: string };
const emptyDraft = (): SaveAgentInput => ({
  name: "",
  avatar: defaultAgentAvatar.id,
  summary: "",
  category: "自定义",
  instructions: "",
  useCases: [],
  starterPrompts: [],
  skillKeys: [],
  toolNames: [],
  knowledgeCollectionIds: [],
});
const lines = (value: string) => [
  ...new Set(
    value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  ),
];
export function AgentEditDialog({
  bind,
  onSaved,
}: {
  bind: Ref<AgentEditDialogHandle>;
  onSaved?: () => void | Promise<void>;
}) {
  const [draft, setDraft] = useState<SaveAgentInput | null>(null);
  const [caseText, setCaseText] = useState("");
  const [starterText, setStarterText] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const [bindingError, setBindingError] = useState("");
  const [bindings, setBindings] = useState<{
    skills: BindingOption[];
    tools: BindingOption[];
    knowledge: BindingOption[];
  }>({ skills: [], tools: [], knowledge: [] });
  const loadBindings = async () => {
    setBindingError("");
    const results = await Promise.allSettled([getSkills(), listAgentRuntimeTools(), listKnowledgeLibrary()]);
    const [skills, tools, knowledge] = results;
    setBindings({
      skills:
        skills.status === "fulfilled" ? skills.value.skills.map((item) => ({ value: item.key, label: item.name })) : [],
      tools:
        tools.status === "fulfilled" ? tools.value.tools.map((item) => ({ value: item.name, label: item.label })) : [],
      knowledge:
        knowledge.status === "fulfilled"
          ? knowledge.value.collections
              .filter((item) => item.enabled)
              .map((item) => ({ value: item.id, label: item.name }))
          : [],
    });
    if (results.some((result) => result.status === "rejected"))
      setBindingError("部分能力列表读取失败，可稍后重试；已保存的绑定会保留。");
  };
  useImperativeHandle(bind, () => ({
    open(options = { mode: "create" }) {
      setError("");
      setConfirmDelete(false);
      setCaseText(options.mode === "create" ? "" : options.agent.useCases.join("\n"));
      setStarterText(options.mode === "create" ? "" : options.agent.starterPrompts.join("\n"));
      if (options.mode === "create") setDraft(emptyDraft());
      else {
        const { id, source: _source, createdAt: _createdAt, updatedAt: _updatedAt, ...definition } = options.agent;
        setDraft({
          ...definition,
          avatar: normalizeAgentAvatarId(definition.avatar),
          id: options.mode === "edit" ? id : null,
          name: options.mode === "copy" ? `${definition.name}（副本）` : definition.name,
        });
      }
      void loadBindings();
    },
  }));
  const patch = (value: Partial<SaveAgentInput>) => setDraft((current) => (current ? { ...current, ...value } : null));
  const submit = async () => {
    if (!draft) return;
    if (!draft.name.trim() || !draft.category.trim() || !draft.instructions.trim()) {
      setError("请填写名称、分类和工作指令。");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await saveAgent({
        ...draft,
        useCases: lines(caseText),
        starterPrompts: lines(starterText),
        name: draft.name.trim(),
        instructions: draft.instructions.trim(),
        summary: draft.summary.trim(),
      });
      setDraft(null);
      await onSaved?.();
    } catch (caught) {
      setError(String(caught));
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!draft?.id) return;
    setSaving(true);
    setError("");
    try {
      await deleteAgent(draft.id);
      setConfirmDelete(false);
      setDraft(null);
      await onSaved?.();
    } catch (caught) {
      setError(String(caught));
      setConfirmDelete(false);
    } finally {
      setSaving(false);
    }
  };
  const bindingList = (
    field: "skillKeys" | "toolNames" | "knowledgeCollectionIds",
    title: string,
    options: BindingOption[],
    help: string,
  ) => {
    if (!draft) return null;
    const all = [
      ...options,
      ...draft[field]
        .filter((id) => !options.some((option) => option.value === id))
        .map((id) => ({ value: id, label: `${id}（当前不可用）` })),
    ];
    return (
      <div className="space-y-2">
        <h4 className="text-sm font-medium">{title}</h4>
        <p className="text-xs leading-5 text-muted-foreground">{help}</p>
        {all.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {all.map((option) => (
              <label key={option.value} className="flex min-w-0 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={draft[field].includes(option.value)}
                  onChange={(event) =>
                    patch({
                      [field]: event.target.checked
                        ? [...draft[field], option.value]
                        : draft[field].filter((id) => id !== option.value),
                    })
                  }
                />
                <span className="truncate" title={option.label}>
                  {option.label}
                </span>
              </label>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">暂无可绑定的{title}</p>
        )}
      </div>
    );
  };
  return (
    <>
      <Dialog
        open={Boolean(draft)}
        onOpenChange={(open) => {
          if (!open && !saving) setDraft(null);
        }}
      >
        <DialogContent className="!flex max-h-[calc(100vh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[720px]">
          <DialogHeader className="shrink-0 border-b border-border/70 px-6 py-5">
            <DialogTitle>{draft?.id ? "编辑智能体" : "新建智能体"}</DialogTitle>
            <DialogDescription>定义工作方式，并按需绑定已有技能、工具和知识库。</DialogDescription>
          </DialogHeader>
          {draft && (
            <form
              className="flex min-h-0 flex-col"
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                <fieldset disabled={saving} className="min-w-0 space-y-5">
                  {error && (
                    <p role="alert" className="text-sm text-destructive">
                      {error}
                    </p>
                  )}
                  <div className="flex items-start gap-4">
                    <img
                      alt="智能体头像"
                      className="size-14 rounded-xl object-cover"
                      src={resolveAvatar(draft.avatar).src}
                    />
                    <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[1fr_140px]">
                      <div className="space-y-2">
                        <Label htmlFor="agent-name">智能体名称</Label>
                        <Input
                          id="agent-name"
                          autoFocus
                          value={draft.name}
                          onChange={(event) => patch({ name: event.target.value })}
                          placeholder="例如：我的办公助手"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="agent-category">分类</Label>
                        <Input
                          id="agent-category"
                          value={draft.category}
                          onChange={(event) => patch({ category: event.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                  <details>
                    <summary className="cursor-pointer text-xs text-muted-foreground">更换头像</summary>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {agentAvatarOptions.map((avatar) => (
                        <button
                          type="button"
                          key={avatar.id}
                          title={avatar.label}
                          aria-label={avatar.label}
                          aria-pressed={draft.avatar === avatar.id}
                          className={`rounded-lg p-1 ${draft.avatar === avatar.id ? "ring-2 ring-primary" : "hover:bg-accent"}`}
                          onClick={() => patch({ avatar: avatar.id })}
                        >
                          <img src={avatar.src} alt="" className="size-9 rounded-md" />
                        </button>
                      ))}
                    </div>
                  </details>
                  <div className="space-y-2">
                    <Label htmlFor="agent-summary">简短介绍</Label>
                    <Input
                      id="agent-summary"
                      value={draft.summary}
                      onChange={(event) => patch({ summary: event.target.value })}
                      placeholder="描述擅长的任务，便于聊天时选择"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="agent-instructions">工作指令</Label>
                    <Textarea
                      id="agent-instructions"
                      value={draft.instructions}
                      onChange={(event) => patch({ instructions: event.target.value })}
                      className="min-h-44 text-sm leading-6"
                      placeholder="写明职责、工作步骤、输出格式和质量要求。"
                    />
                    <p className="text-xs text-muted-foreground">选中或引用后，这些指令会应用到当前请求。</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="agent-cases">适用场景（每行一项）</Label>
                      <Textarea
                        id="agent-cases"
                        value={caseText}
                        onChange={(event) => setCaseText(event.target.value)}
                        placeholder="撰写邮件&#10;整理待办"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="agent-starters">示例任务（每行一项）</Label>
                      <Textarea
                        id="agent-starters"
                        value={starterText}
                        onChange={(event) => setStarterText(event.target.value)}
                        placeholder="把下面的内容整理成工作周报"
                      />
                    </div>
                  </div>
                  <details className="rounded-xl border border-border/70 p-4">
                    <summary className="cursor-pointer text-sm font-medium">
                      能力绑定 <span className="ml-1 font-normal text-muted-foreground">可选</span>
                    </summary>
                    <div className="mt-4 space-y-5">
                      {bindingError && (
                        <p role="status" className="text-xs text-muted-foreground">
                          {bindingError}
                          <Button type="button" variant="ghost" size="sm" onClick={() => void loadBindings()}>
                            重试
                          </Button>
                        </p>
                      )}
                      {bindingList("skillKeys", "技能", bindings.skills, "使用智能体时，自动加载绑定技能的工作指令。")}
                      {bindingList(
                        "toolNames",
                        "工具",
                        bindings.tools,
                        "不选时沿用聊天工具；选择后只允许所选工具，仍受工作区权限限制。",
                      )}
                      {bindingList(
                        "knowledgeCollectionIds",
                        "知识库",
                        bindings.knowledge,
                        "使用智能体时，额外检索所绑定且已启用的知识库。",
                      )}
                    </div>
                  </details>
                </fieldset>
              </div>
              <DialogFooter className="shrink-0 border-t border-border/70 px-6 py-4">
                {draft.id && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="mr-auto text-destructive"
                    disabled={saving}
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 className="size-4" />
                    删除
                  </Button>
                )}
                <Button type="button" variant="outline" disabled={saving} onClick={() => setDraft(null)}>
                  取消
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}保存智能体
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除 {draft?.name}？</AlertDialogTitle>
            <AlertDialogDescription>删除后，该智能体将无法再被选择或引用。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={(event) => {
                event.preventDefault();
                void remove();
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
