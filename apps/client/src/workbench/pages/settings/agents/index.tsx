import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Check, Library, Loader2, Plus, Search } from "lucide-react";
import { addAgentFromTemplate, getAgentSettings, getAgentTemplates } from "@/api/agents";
import { normalizeAgentAvatarId, resolveAvatar } from "@/assets/avatars";
import { Button } from "design-system/components/ui/button";
import { Input } from "design-system/components/ui/input";
import { ScrollArea } from "design-system/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "design-system/components/ui/dialog";
import { SettingsPageHeader } from "../page-header";
import { AgentEditDialog, type AgentEditDialogHandle } from "./edit";
import type { AgentDefinition, AgentTemplate } from "./types";

export const AgentSettingsPage = () => {
  const editor = useRef<AgentEditDialogHandle>(null);
  const [agents, setAgents] = useState<AgentDefinition[]>([]);
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [tab, setTab] = useState<"mine" | "library">("mine");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("全部");
  const [detail, setDetail] = useState<AgentTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [error, setError] = useState("");
  const [libraryError, setLibraryError] = useState("");
  const [addingId, setAddingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const loadAgents = useCallback(async () => {
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
  const loadTemplates = useCallback(async () => {
    setLibraryLoading(true);
    setLibraryError("");
    try {
      setTemplates((await getAgentTemplates()).templates);
    } catch (caught) {
      setLibraryError(String(caught));
    } finally {
      setLibraryLoading(false);
    }
  }, []);
  useEffect(() => {
    void loadAgents();
    void loadTemplates();
  }, [loadAgents, loadTemplates]);
  const changeTab = (next: "mine" | "library") => {
    setTab(next);
    setQuery("");
    setCategory("全部");
    setNotice("");
  };
  const add = async (template: AgentTemplate) => {
    setAddingId(template.id);
    setError("");
    setNotice("");
    try {
      setAgents((await addAgentFromTemplate(template.id)).agents);
      setNotice(`已添加 ${template.name}，可在“我的智能体”中修改或重置。`);
    } catch (caught) {
      setError(String(caught));
    } finally {
      setAddingId(null);
    }
  };
  const categories = ["全部", ...new Set((tab === "mine" ? agents : templates).map((item) => item.category))];
  const visible = useMemo(
    () =>
      (tab === "mine" ? agents : templates).filter(
        (item) =>
          (category === "全部" || item.category === category) &&
          `${item.name} ${item.category} ${item.summary} ${item.useCases.join(" ")}`
            .toLocaleLowerCase()
            .includes(query.trim().toLocaleLowerCase()),
      ),
    [agents, templates, tab, query, category],
  );
  const busy = tab === "mine" ? loading : libraryLoading;
  const selectedAgent = detail ? agents.find((agent) => agent.templateId === detail.id) : undefined;
  const avatar = (item: AgentTemplate | AgentDefinition) => (
    <img
      src={resolveAvatar(normalizeAgentAvatarId(item.avatar)).src}
      alt=""
      className="size-10 shrink-0 rounded-xl object-cover"
    />
  );
  return (
    <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-surface/45">
      <SettingsPageHeader
        title="智能体设置"
        description="从系统配置库添加智能体，或创建自己的工作方式"
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
            <div role="tablist" aria-label="智能体列表" className="flex gap-5">
              {(
                [
                  ["mine", "我的智能体", agents.length],
                  ["library", "智能体配置库", templates.length],
                ] as const
              ).map(([value, label, count]) => (
                <button
                  key={value}
                  role="tab"
                  tabIndex={tab === value ? 0 : -1}
                  onKeyDown={(event) => {
                    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                    event.preventDefault();
                    const next =
                      event.key === "Home"
                        ? "mine"
                        : event.key === "End"
                          ? "library"
                          : tab === "mine"
                            ? "library"
                            : "mine";
                    changeTab(next);
                    event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`#agent-tab-${next}`)?.focus();
                  }}
                  aria-selected={tab === value}
                  aria-controls="agent-list"
                  id={`agent-tab-${value}`}
                  className={`border-b-2 py-3 text-sm transition-colors ${tab === value ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                  onClick={() => changeTab(value)}
                >
                  {label}
                  <span className="ml-2 text-xs text-muted-foreground">{count}</span>
                </button>
              ))}
            </div>
            <div className="relative w-56 max-w-full pb-2">
              <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
              <Input
                aria-label="搜索智能体"
                placeholder="搜索名称或用途"
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
            {tab === "library"
              ? "系统维护的智能体配置。添加到“我的智能体”后即可在聊天中选择，也可以修改并重置为系统配置。"
              : "聊天只显示我的智能体，可在模型菜单中选择，或通过 / 和 + 仅为当前请求引用。新对话默认不选中智能体。"}
          </p>
          {notice && (
            <p role="status" className="text-sm text-muted-foreground">
              {notice}
            </p>
          )}
          {error && (
            <div role="alert" className="text-sm text-destructive">
              {error}
              <Button variant="ghost" size="sm" onClick={() => void loadAgents()}>
                重试
              </Button>
            </div>
          )}
          {tab === "library" && libraryError && (
            <div role="alert" className="text-sm text-destructive">
              {libraryError}
              <Button variant="ghost" size="sm" onClick={() => void loadTemplates()}>
                重试
              </Button>
            </div>
          )}
          <div id="agent-list" role="tabpanel" aria-labelledby={`agent-tab-${tab}`}>
            {busy ? (
              <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                正在读取智能体
              </div>
            ) : visible.length ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {visible.map((item) => {
                  const fromLibrary = "references" in item;
                  const added = fromLibrary && agents.some((agent) => agent.templateId === item.id);
                  const content = (
                    <>
                      <span className="flex w-full min-w-0 items-center gap-3">
                        {avatar(item)}
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{item.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{item.category}</span>
                      </span>
                      <span className="min-h-10 text-sm leading-5 text-muted-foreground">
                        {item.summary || "暂无介绍"}
                      </span>
                      <span className="mt-auto flex flex-wrap gap-1.5">
                        {item.useCases.slice(0, 3).map((useCase) => (
                          <span
                            key={useCase}
                            className="rounded-md bg-muted/65 px-2 py-1 text-xs text-muted-foreground"
                          >
                            {useCase}
                          </span>
                        ))}
                      </span>
                    </>
                  );
                  return fromLibrary ? (
                    <article
                      key={item.id}
                      className="flex min-w-0 flex-col rounded-xl border border-border/70 bg-card/60"
                    >
                      <button
                        aria-label={`查看配置 ${item.name}`}
                        onClick={() => setDetail(item)}
                        className="flex flex-1 flex-col gap-3 rounded-t-xl p-4 text-left transition-colors hover:bg-accent/25 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        {content}
                      </button>
                      <div className="flex items-center justify-between gap-2 border-t border-border/50 px-4 py-3">
                        <span className="text-xs text-muted-foreground">系统配置</span>
                        <Button
                          size="sm"
                          variant={added ? "ghost" : "outline"}
                          disabled={added || loading || addingId !== null}
                          onClick={() => void add(item)}
                        >
                          {addingId === item.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : added ? (
                            <Check className="size-3.5" />
                          ) : (
                            <Plus className="size-3.5" />
                          )}
                          {added ? "已添加" : "添加到我的智能体"}
                        </Button>
                      </div>
                    </article>
                  ) : (
                    <button
                      key={item.id}
                      aria-label={`编辑智能体 ${item.name}`}
                      onClick={() => editor.current?.open({ mode: "edit", agent: item })}
                      className="flex min-w-0 flex-col gap-3 rounded-xl border border-border/70 bg-card/60 p-4 text-left transition-colors hover:border-primary/30 hover:bg-accent/25 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {content}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex min-h-56 flex-col items-center justify-center gap-3 text-center">
                <Bot className="size-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {query || category !== "全部"
                    ? "没有匹配的智能体"
                    : tab === "mine"
                      ? "还没有智能体，可以从系统配置库添加，或新建自己的智能体。"
                      : "暂无系统智能体配置"}
                </p>
                {tab === "mine" && !query && category === "全部" && !error && (
                  <Button variant="outline" onClick={() => changeTab("library")}>
                    <Library className="size-4" />
                    浏览配置库
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
          if (!open && !addingId) setDetail(null);
        }}
      >
        <DialogContent className="!flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          {detail && (
            <>
              <DialogHeader className="shrink-0 border-b border-border/70 px-6 py-5">
                <DialogTitle className="flex items-center gap-3">
                  {avatar(detail)}
                  {detail.name}
                </DialogTitle>
                <DialogDescription>{detail.summary}</DialogDescription>
              </DialogHeader>
              <div className="min-h-0 space-y-5 overflow-y-auto px-6 py-5">
                <div>
                  <h3 className="mb-2 text-sm font-medium">适用场景</h3>
                  <p className="text-sm text-muted-foreground">{detail.useCases.join(" · ")}</p>
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-medium">工作指令</h3>
                  <p className="rounded-lg bg-muted/40 p-3 text-sm leading-6 whitespace-pre-wrap text-muted-foreground">
                    {detail.instructions}
                  </p>
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-medium">示例任务</h3>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    {detail.starterPrompts.map((prompt) => (
                      <li key={prompt}>{prompt}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="mb-2 text-xs font-medium text-muted-foreground">配置参考</h3>
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {detail.references.map((reference) => (
                      <a
                        key={reference.url}
                        href={reference.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                      >
                        {reference.name}
                      </a>
                    ))}
                  </div>
                </div>
                {error && (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                )}
              </div>
              <DialogFooter className="shrink-0 border-t border-border/70 px-6 py-4">
                {selectedAgent ? (
                  <Button
                    onClick={() => {
                      setDetail(null);
                      editor.current?.open({ mode: "edit", agent: selectedAgent });
                    }}
                  >
                    编辑我的智能体
                  </Button>
                ) : (
                  <Button disabled={loading || addingId !== null} onClick={() => void add(detail)}>
                    {addingId === detail.id ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                    添加到我的智能体
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      <AgentEditDialog
        bind={editor}
        onSaved={async () => {
          changeTab("mine");
          await loadAgents();
        }}
      />
    </section>
  );
};
