import { useEffect, useState } from "react";
import { AlertCircle, FolderOpen, Loader2, Plus, Puzzle, RefreshCw, Search, Settings2, Trash2 } from "lucide-react";
import { Button } from "design-system/components/ui/button";
import { Input } from "design-system/components/ui/input";
import { cn } from "design-system/lib/utils";
import { Switch } from "design-system/components/ui/switch";
import { ScrollArea } from "design-system/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "design-system/components/ui/dialog";
import {
  listExtensions,
  addExtension,
  configureExtension,
  removeExtension,
  type DesktopExtension,
} from "@/api/extensions";
import { openSystemDialog } from "@/api/native";
import { SchemaFields, schemaDraft, schemaValues, type FieldDraft } from "./schema-fields";

export function ExtensionsPage() {
  const [items, setItems] = useState<DesktopExtension[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [path, setPath] = useState("");
  const [editing, setEditing] = useState<DesktopExtension | null>(null);
  const [draft, setDraft] = useState<FieldDraft>({});
  const run = async (operation: () => Promise<DesktopExtension[]>, onSuccess?: () => void) => {
    setBusy(true);
    setError("");
    try {
      setItems(await operation());
      setLoaded(true);
      onSuccess?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void run(listExtensions);
  }, []);
  const choose = async () => {
    try {
      const selected = await openSystemDialog({ directory: true, multiple: false, title: "选择已构建的插件包" });
      if (typeof selected === "string") setPath(selected);
    } catch (caught) {
      setError(String(caught));
    }
  };
  const openAdd = () => {
    setError("");
    setAdding(true);
  };
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = items.filter((item) => `${item.id} ${item.description}`.toLowerCase().includes(normalizedQuery));
  const enabledCount = items.filter((item) => item.enabled).length;

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-surface/45">
      <header className="flex min-h-20 shrink-0 flex-wrap items-center justify-between gap-4 border-b border-border/70 bg-card/50 px-6 py-4 max-sm:px-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Puzzle className="size-5 text-primary" aria-hidden="true" />
            <h1 className="text-lg font-semibold tracking-[-0.02em]">插件</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">按需扩展 Agent 能力与应用界面</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            disabled={busy}
            onClick={() => void run(listExtensions)}
            aria-label="刷新插件列表"
            title="刷新插件列表"
            className="text-muted-foreground"
          >
            <RefreshCw className={cn("size-4", busy && "animate-spin motion-reduce:animate-none")} />
          </Button>
          <Button disabled={busy} onClick={openAdd}>
            <Plus className="size-4" />
            添加插件
          </Button>
        </div>
      </header>
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto w-full max-w-6xl space-y-5 p-6 max-sm:p-4">
          {error && !editing && !adding ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <p className="min-w-0 break-words">{error}</p>
            </div>
          ) : null}
          {items.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-baseline gap-3">
                <h2 className="text-sm font-semibold">
                  已添加插件 <span className="ml-1 text-muted-foreground">{items.length}</span>
                </h2>
                <span className="text-xs text-muted-foreground">{enabledCount} 个已启用</span>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="搜索插件"
                  placeholder="搜索插件…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="bg-card pl-9"
                />
              </div>
            </div>
          ) : null}
          {busy && !loaded ? (
            <div
              role="status"
              className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"
            >
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
              正在读取插件…
            </div>
          ) : loaded && !items.length ? (
            <div className="flex min-h-80 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 px-6 py-12 text-center">
              <span className="mb-4 flex size-12 items-center justify-center rounded-xl bg-accent text-primary">
                <Puzzle className="size-6" />
              </span>
              <h2 className="text-base font-semibold">添加第一个插件</h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                接入本地插件，扩展 Agent 或应用界面。会话插件可在聊天右侧使用。
              </p>
              <Button variant="outline" className="mt-5 bg-card" disabled={busy} onClick={openAdd}>
                <Plus className="size-4" />
                添加本地插件
              </Button>
            </div>
          ) : items.length > 0 && !filtered.length ? (
            <div
              role="status"
              className="flex min-h-56 flex-col items-center justify-center gap-3 text-sm text-muted-foreground"
            >
              <Search className="size-6" />
              <p>没有找到匹配的插件</p>
              <Button variant="ghost" size="sm" onClick={() => setQuery("")}>
                清除搜索
              </Button>
            </div>
          ) : filtered.length > 0 ? (
            <div className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/80 bg-card">
              {filtered.map((item) => (
                <article
                  key={item.id}
                  className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 gap-y-3 p-5 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto] sm:gap-x-4"
                >
                  <span
                    className={cn(
                      "flex size-10 items-center justify-center rounded-xl",
                      item.enabled ? "bg-accent text-primary" : "bg-muted text-muted-foreground",
                    )}
                  >
                    <Puzzle className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <h3 className="break-all text-sm font-semibold">{item.id}</h3>
                      <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                        {item.source === "bundled" ? "内置" : "本地"}
                      </span>
                      {item.modules.map((module) => (
                        <span
                          key={module}
                          className="rounded-md bg-accent px-1.5 py-0.5 text-xs text-accent-foreground"
                        >
                          {module === "ui" ? "界面" : "Agent"}
                        </span>
                      ))}
                      {item.version ? (
                        <span className="text-xs tabular-nums text-muted-foreground">v{item.version}</span>
                      ) : null}
                      {item.error ? (
                        <span className="rounded-md bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">
                          加载异常
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {item.description || "该插件暂无描述。"}
                    </p>
                    <p className="mt-1.5 truncate text-xs text-muted-foreground/75" title={item.path}>
                      {item.path}
                    </p>
                    {item.error ? (
                      <p role="alert" className="mt-2 break-words text-sm text-destructive">
                        {item.error}
                      </p>
                    ) : null}
                  </div>
                  <div className="col-start-2 flex flex-wrap items-center gap-2 sm:col-start-3 sm:row-start-1 sm:self-start">
                    <label className="mr-2 flex min-h-9 cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                      <span>{item.enabled ? "已启用" : "已停用"}</span>
                      <Switch
                        aria-label={`${item.enabled ? "停用" : "启用"} ${item.id}`}
                        checked={item.enabled}
                        disabled={busy}
                        onCheckedChange={(enabled) => void run(() => configureExtension(item.id, { enabled }))}
                      />
                    </label>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`配置 ${item.id}`}
                      title={item.configSchema ? "配置插件" : "此插件无需配置"}
                      disabled={busy || !item.configSchema || !!item.error}
                      onClick={() => {
                        setEditing(item);
                        setError("");
                        setDraft(schemaDraft(item.configSchema!, item.config));
                      }}
                      className="text-muted-foreground"
                    >
                      <Settings2 className="size-4" />
                    </Button>
                    {item.source !== "bundled" ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={busy}
                        aria-label={`移除 ${item.id}`}
                        title="移除插件"
                        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => void run(() => removeExtension(item.id))}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ) : null}
          {items.length ? (
            <p className="px-1 text-xs leading-5 text-muted-foreground">
              界面扩展即时更新；Agent 扩展从下一次执行生效。移除插件会保留会话数据。
            </p>
          ) : null}
        </div>
      </ScrollArea>
      <Dialog
        open={adding}
        onOpenChange={(open) => {
          if (!busy) {
            setAdding(open);
            setError("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加本地插件</DialogTitle>
            <DialogDescription>选择已构建的插件包目录，添加后即可启用。</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              void run(
                () => addExtension(path.trim()),
                () => {
                  setAdding(false);
                  setPath("");
                  setQuery("");
                },
              );
            }}
          >
            <div className="space-y-2">
              <label htmlFor="extension-package-path" className="text-sm font-medium">
                插件包目录
              </label>
              <div className="flex gap-2">
                <Input
                  id="extension-package-path"
                  className="min-w-0 flex-1"
                  placeholder="选择或填写插件包目录"
                  value={path}
                  onChange={(event) => setPath(event.target.value)}
                  disabled={busy}
                  required
                />
                <Button type="button" variant="outline" disabled={busy} onClick={() => void choose()}>
                  <FolderOpen className="size-4" />
                  浏览
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">支持本地插件目录，请只添加你信任的插件。</p>
            </div>
            {error ? (
              <p role="alert" className="break-words text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setAdding(false);
                  setError("");
                }}
              >
                取消
              </Button>
              <Button disabled={busy || !path.trim()}>
                {busy ? (
                  <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                ) : (
                  <Plus className="size-4" />
                )}
                {busy ? "正在添加…" : "添加插件"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setEditing(null);
            setError("");
          }
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>插件配置</DialogTitle>
            <DialogDescription>{editing?.id}</DialogDescription>
          </DialogHeader>
          {editing?.configSchema ? (
            <form
              className="space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                try {
                  const config = schemaValues(editing.configSchema!, draft);
                  void run(
                    () => configureExtension(editing.id, { config }),
                    () => setEditing(null),
                  );
                } catch (caught) {
                  setError(caught instanceof Error ? caught.message : String(caught));
                }
              }}
            >
              <SchemaFields schema={editing.configSchema} draft={draft} onChange={setDraft} disabled={busy} />
              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setEditing(null);
                    setError("");
                  }}
                >
                  取消
                </Button>
                <Button disabled={busy}>保存配置</Button>
              </div>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
