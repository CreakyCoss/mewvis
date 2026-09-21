import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Play, Puzzle, RefreshCw, Square } from "lucide-react";
import { Button } from "design-system/components/ui/button";
import { Input } from "design-system/components/ui/input";
import { ScrollArea } from "design-system/components/ui/scroll-area";
import { listExtensionCommands, type ExtensionCommand, type ExtensionCommandTarget } from "@/api/extensions";
import { SchemaFields, schemaDraft, schemaValues, type FieldDraft } from "@/workbench/pages/extensions/schema-fields";
import type { ExtensionCommandController } from "./use-commands";

const labels: Record<string, string> = {
  connecting: "正在连接",
  starting: "正在准备",
  queued: "排队中",
  running: "执行中",
  waiting_user: "等待授权",
  completing: "正在完成",
  cancelling: "正在停止",
  cancelled: "已取消",
  done: "已完成",
  failed: "执行失败",
  recovering: "正在恢复连接",
};

export function ExtensionCommandsPanel({
  target,
  controller,
}: {
  target: ExtensionCommandTarget;
  controller: ExtensionCommandController;
}) {
  const [commands, setCommands] = useState<ExtensionCommand[]>([]);
  const [selected, setSelected] = useState<ExtensionCommand | null>(null);
  const [draft, setDraft] = useState<FieldDraft>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const list = await listExtensionCommands(target);
      setCommands(list);
      setSelected((current) => (current && list.find((item) => item.id === current.id)) || null);
    } catch (caught) {
      setCommands([]);
      setSelected(null);
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, [target.workspacePath, target.chatId]);
  const choose = (command: ExtensionCommand) => {
    setSelected(command);
    setDraft(schemaDraft(command.parameters));
    setError("");
  };
  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label="插件命令">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <Puzzle className="size-4" />
          插件命令
        </h2>
        <Button
          variant="ghost"
          size="icon"
          aria-label="刷新插件命令"
          disabled={loading || controller.busy}
          onClick={() => void load()}
        >
          <RefreshCw className="size-4" />
        </Button>
      </header>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-4">
          <p className="text-xs text-muted-foreground">命令作用于当前会话，不会发送聊天消息。</p>
          <Link to="/extensions" className="text-sm text-primary underline underline-offset-4">
            管理插件
          </Link>
          <Input
            aria-label="搜索插件命令"
            placeholder="搜索命令"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {loading ? (
            <p role="status" className="text-sm text-muted-foreground">
              正在读取命令…
            </p>
          ) : !commands.length ? (
            <p className="text-sm text-muted-foreground">当前没有可用命令。请先添加并启用提供命令的插件。</p>
          ) : null}
          <div className="space-y-1">
            {commands
              .filter((item) => `${item.id} ${item.description}`.toLowerCase().includes(search.toLowerCase()))
              .map((command) => (
                <button
                  type="button"
                  key={command.id}
                  disabled={controller.busy}
                  aria-pressed={selected?.id === command.id}
                  className={`w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted disabled:opacity-60 ${selected?.id === command.id ? "border-primary bg-primary/5" : "border-transparent"}`}
                  onClick={() => choose(command)}
                >
                  <span className="block break-all text-sm font-medium">{command.id}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{command.description}</span>
                </button>
              ))}
          </div>
          {selected ? (
            <form
              key={selected.id}
              className="space-y-4 border-t pt-4"
              onSubmit={(event) => {
                event.preventDefault();
                setError("");
                try {
                  void controller.execute(selected.id, schemaValues(selected.parameters, draft));
                } catch (caught) {
                  setError(caught instanceof Error ? caught.message : String(caught));
                }
              }}
            >
              <SchemaFields schema={selected.parameters} draft={draft} onChange={setDraft} disabled={controller.busy} />
              <Button type="submit" className="w-full" disabled={controller.busy || loading}>
                <Play className="size-4" />
                执行命令
              </Button>
            </form>
          ) : null}
          {controller.status ? (
            <div className="flex items-center justify-between gap-2">
              <p role="status" className="text-sm">
                {labels[controller.status] ?? controller.status}
              </p>
              {controller.busy ? (
                <Button variant="ghost" size="sm" onClick={() => void controller.cancel()}>
                  <Square className="size-3" />
                  停止
                </Button>
              ) : null}
            </div>
          ) : null}
          {controller.approval ? (
            <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <h3 className="text-sm font-medium">需要授权</h3>
              <p className="break-words text-sm">{controller.approval.summary}</p>
              <p className="text-xs text-muted-foreground">{controller.approval.reason}</p>
              <details className="text-xs">
                <summary>查看执行详情</summary>
                <pre className="mt-2 whitespace-pre-wrap break-all">{controller.approval.details}</pre>
              </details>
              <div className="flex gap-2">
                <Button size="sm" disabled={controller.answering} onClick={() => void controller.answer(true)}>
                  允许本次执行
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={controller.answering}
                  onClick={() => void controller.answer(false)}
                >
                  拒绝
                </Button>
              </div>
            </div>
          ) : null}
          {error || controller.error ? (
            <div role="alert" className="space-y-2 text-sm text-destructive">
              <p>{error || controller.error}</p>
              {controller.busy ? (
                <Button variant="outline" size="sm" onClick={() => void controller.recover()}>
                  重新读取执行状态
                </Button>
              ) : null}
            </div>
          ) : null}
          {controller.result?.success ? (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">执行结果</h3>
              <pre className="rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap break-all">
                {JSON.stringify(controller.result.value, null, 2)}
              </pre>
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </section>
  );
}
