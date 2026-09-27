import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Copy, Loader2, Plus, Search } from "lucide-react";
import { getAgentSettings } from "@/api/agents";
import { normalizeAgentAvatarId, resolveAvatar } from "@/assets/avatars";
import { Button } from "design-system/components/ui/button";
import { Input } from "design-system/components/ui/input";
import { ScrollArea } from "design-system/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "design-system/components/ui/dialog";
import { SettingsPageHeader } from "../page-header";
import { AgentEditDialog, type AgentEditDialogHandle } from "./edit";
import type { AgentDefinition } from "./types";

export const AgentSettingsPage = () => {
  const editor = useRef<AgentEditDialogHandle>(null);
  const [agents, setAgents] = useState<AgentDefinition[]>([]);
  const [tab, setTab] = useState<"builtin" | "custom">("builtin");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("全部");
  const [detail, setDetail] = useState<AgentDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setAgents((await getAgentSettings()).agents);
    } catch (caught) {
      setError(String(caught));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const categories = [
    "全部",
    ...new Set(agents.filter((agent) => agent.source === tab).map((agent) => agent.category)),
  ];
  const visible = useMemo(
    () =>
      agents.filter(
        (agent) =>
          agent.source === tab &&
          (category === "全部" || agent.category === category) &&
          `${agent.name} ${agent.summary} ${agent.useCases.join(" ")}`
            .toLocaleLowerCase()
            .includes(query.trim().toLocaleLowerCase()),
      ),
    [agents, tab, category, query],
  );
  return (
    <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-surface/45">
      <SettingsPageHeader
        title="智能体设置"
        description="选择内置智能体，或创建适合自己工作的智能体"
        action={
          <Button onClick={() => editor.current?.open({ mode: "create" })}>
            <Plus className="size-4" />
            新建智能体
          </Button>
        }
      />
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-5 px-6 pb-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70">
            <div role="tablist" aria-label="智能体来源" className="flex gap-5">
              {(
                [
                  ["builtin", "内置智能体"],
                  ["custom", "我的智能体"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  role="tab"
                  tabIndex={tab === value ? 0 : -1}
                  onKeyDown={(event) => {
                    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                    event.preventDefault();
                    const next =
                      event.key === "Home"
                        ? "builtin"
                        : event.key === "End"
                          ? "custom"
                          : tab === "builtin"
                            ? "custom"
                            : "builtin";
                    setTab(next);
                    setCategory("全部");
                    event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`#agent-tab-${next}`)?.focus();
                  }}
                  aria-selected={tab === value}
                  aria-controls="agent-list"
                  id={`agent-tab-${value}`}
                  className={`border-b-2 py-3 text-sm transition-colors ${tab === value ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                  onClick={() => {
                    setTab(value);
                    setCategory("全部");
                  }}
                >
                  {label}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {agents.filter((agent) => agent.source === value).length}
                  </span>
                </button>
              ))}
            </div>
            <div className="relative w-56 max-w-full pb-2">
              <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
              <Input
                aria-label="搜索智能体"
                placeholder="搜索智能体"
                className="pl-9"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2" aria-label="智能体分类">
            {categories.map((item) => (
              <Button
                key={item}
                size="sm"
                variant={category === item ? "secondary" : "ghost"}
                aria-pressed={category === item}
                onClick={() => setCategory(item)}
                className="h-7 rounded-full px-3 text-xs"
              >
                {item}
              </Button>
            ))}
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            在聊天的模型菜单中选择智能体，或通过 / 和 + 仅为当前请求引用。新对话默认不选中智能体。
          </p>
          {error && (
            <div role="alert" className="text-sm text-destructive">
              {error}
              <Button variant="ghost" size="sm" onClick={() => void load()}>
                重试
              </Button>
            </div>
          )}
          <div id="agent-list" role="tabpanel" aria-labelledby={`agent-tab-${tab}`}>
            {loading ? (
              <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                正在读取智能体
              </div>
            ) : visible.length ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {visible.map((agent) => (
                  <button
                    key={agent.id}
                    className="flex min-w-0 flex-col gap-3 rounded-xl border border-border/70 bg-card/60 p-4 text-left transition-colors hover:border-primary/30 hover:bg-accent/25 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    aria-label={`${agent.source === "builtin" ? "查看" : "编辑"}智能体 ${agent.name}`}
                    onClick={() =>
                      agent.source === "builtin" ? setDetail(agent) : editor.current?.open({ mode: "edit", agent })
                    }
                  >
                    <span className="flex w-full min-w-0 items-center gap-3">
                      <img
                        src={resolveAvatar(normalizeAgentAvatarId(agent.avatar)).src}
                        alt=""
                        className="size-10 shrink-0 rounded-xl object-cover"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{agent.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{agent.category}</span>
                    </span>
                    <span className="min-h-10 text-sm leading-5 text-muted-foreground">
                      {agent.summary || "暂无介绍"}
                    </span>
                    <span className="mt-auto flex flex-wrap gap-1.5">
                      {agent.useCases.slice(0, 3).map((item) => (
                        <span key={item} className="rounded-md bg-muted/65 px-2 py-1 text-xs text-muted-foreground">
                          {item}
                        </span>
                      ))}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex min-h-56 flex-col items-center justify-center gap-3 text-center">
                <Bot className="size-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {query || category !== "全部"
                    ? "没有匹配的智能体"
                    : "还没有自定义智能体，可以复制内置智能体或从空白创建。"}
                </p>
                {tab === "custom" && !query && (
                  <Button variant="outline" onClick={() => editor.current?.open({ mode: "create" })}>
                    新建智能体
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
      <Dialog
        open={Boolean(detail)}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      >
        <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-2xl">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <img src={resolveAvatar(detail.avatar).src} alt="" className="size-10 rounded-xl" />
                  {detail.name}
                </DialogTitle>
                <DialogDescription>{detail.summary}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <h3 className="mb-2 text-sm font-medium">适用场景</h3>
                  <p className="text-sm text-muted-foreground">{detail.useCases.join(" · ")}</p>
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-medium">示例任务</h3>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    {detail.starterPrompts.map((prompt) => (
                      <li key={prompt} className="rounded-lg bg-muted/50 px-3 py-2">
                        {prompt}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-medium">工作指令</h3>
                  <p className="rounded-lg bg-muted/40 p-3 text-sm leading-6 whitespace-pre-wrap text-muted-foreground">
                    {detail.instructions}
                  </p>
                </div>
              </div>
              <Button
                className="justify-self-end"
                onClick={() => {
                  editor.current?.open({ mode: "copy", agent: detail });
                  setDetail(null);
                }}
              >
                <Copy className="size-4" />
                复制并编辑
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
      <AgentEditDialog
        bind={editor}
        onSaved={async () => {
          setTab("custom");
          setCategory("全部");
          setQuery("");
          await load();
        }}
      />
    </section>
  );
};
