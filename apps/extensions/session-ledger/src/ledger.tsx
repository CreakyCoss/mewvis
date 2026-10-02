import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Activity, ChevronRight, Eye, RefreshCw } from "lucide-react";
import type { ExtensionUIContext } from "@mewvis/extension-host/ui";
import type {
  ExtensionLedgerSnapshot,
  ExtensionSummaryResult,
  ExtensionSummaryScope,
} from "@mewvis/extension-host/services";

type Run = ExtensionLedgerSnapshot["runs"][number];
type Message = ExtensionLedgerSnapshot["messages"][number];
const statuses = { running: "执行中", done: "已完成", error: "失败" };
const roles: Record<string, string> = {
  user: "用户",
  assistant: "助手",
  system: "系统",
  tool: "工具",
};
const time = (value: number | null, full = false) =>
  value === null
    ? "未记录"
    : new Intl.DateTimeFormat("zh-CN", {
        ...(full ? { year: "numeric", second: "2-digit" } : {}),
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(value);
const duration = (run: Run) => {
  if (run.startedAt === null || run.endedAt === null) return "";
  const ms = Math.max(0, run.endedAt - run.startedAt);
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
};
const preview = (text = "", limit = 68) => {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > limit ? `${clean.slice(0, limit)}…` : clean;
};
const shortId = (id: string) =>
  id.length > 18 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id;
const runMessages = (ledger: ExtensionLedgerSnapshot, run: Run) => {
  const ids = new Set(run.messageIds);
  return ledger.messages.filter((message) => ids.has(message.id));
};
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

function Section({
  title,
  count,
  open = true,
  children,
}: {
  title: string;
  count?: number;
  open?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="section" open={open}>
      <summary>
        <span>{title}</span>
        {count !== undefined && <span className="badge">{count}</span>}
        <ChevronRight />
      </summary>
      <div className="section-content">{children}</div>
    </details>
  );
}
const Empty = ({ children }: { children: ReactNode }) => (
  <div className="empty">{children}</div>
);
function Messages({
  title,
  messages,
  open = true,
}: {
  title: string;
  messages: Message[];
  open?: boolean;
}) {
  return (
    <Section title={title} count={messages.length} open={open}>
      {messages.length ? (
        messages.map((message) => (
          <article className="card" key={message.id}>
            <div className="meta">
              <span className="badge">
                {roles[message.role] ?? message.role}
              </span>
              <span>{time(message.timestamp, true)}</span>
              <span className="identifier" title={message.id}>
                {shortId(message.id)}
              </span>
            </div>
            <div className="message-text">{message.text || "（空）"}</div>
          </article>
        ))
      ) : (
        <Empty>没有记录{title}</Empty>
      )}
    </Section>
  );
}
function Blocks({
  title,
  entries,
}: {
  title: string;
  entries: Array<{ id: string; text: string; timestamp?: number }>;
}) {
  return (
    <Section title={title} count={entries.length} open={entries.length > 0}>
      {entries.length ? (
        entries.map((entry, index) => (
          <article key={entry.id} className="card">
            <div className="meta">
              <span className="badge">#{index + 1}</span>
              {entry.timestamp !== undefined && (
                <span>{time(entry.timestamp, true)}</span>
              )}
              <span className="identifier" title={entry.id}>
                {shortId(entry.id)}
              </span>
            </div>
            <pre>{entry.text || "（空）"}</pre>
          </article>
        ))
      ) : (
        <Empty>当前链路没有记录{title}。</Empty>
      )}
    </Section>
  );
}
function Summary({
  context,
  scope,
  existing,
}: {
  context: ExtensionUIContext;
  scope: ExtensionSummaryScope;
  existing?: string | null;
}) {
  const [result, setResult] = useState<ExtensionSummaryResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  const generate = async () => {
    if (abort.current) return;
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setError("");
    try {
      const value = await context.services.session.summarize(
        { scope },
        { signal: controller.signal },
      );
      if (!controller.signal.aborted && !context.signal.aborted)
        setResult(value);
    } catch (caught) {
      if (!controller.signal.aborted && !context.signal.aborted)
        setError(errorText(caught));
    } finally {
      if (abort.current === controller) abort.current = null;
      if (!context.signal.aborted) setBusy(false);
    }
  };
  return (
    <section className="summary-view">
      <p className="muted">
        {scope.kind === "run" ? "本次运行" : "会话"}
        的临时摘要仅用于查看，不写入账本，也不参与后续聊天上下文。
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="summary-text" aria-live="polite">
        {result?.text || existing || (busy ? "正在生成摘要…" : "尚未生成摘要")}
      </div>
      <div className="summary-footer">
        <span className="muted">
          {result
            ? `生成于 ${time(result.generatedAt, true)}${result.truncated ? " · 基于截断后的记录" : ""} · 关闭后不保留`
            : existing
              ? "当前显示已有摘要"
              : ""}
        </span>
        <div className="actions">
          {busy && (
            <button className="button" onClick={() => abort.current?.abort()}>
              取消生成
            </button>
          )}
          <button
            className="button primary"
            disabled={busy || !context.services.supports("session.summarize")}
            title={
              context.services.supports("session.summarize")
                ? undefined
                : "当前宿主未提供摘要能力"
            }
            onClick={() => void generate()}
          >
            <RefreshCw className={busy ? "spin" : ""} />
            {busy ? "正在生成" : result ? "重新生成" : "生成临时摘要"}
          </button>
        </div>
      </div>
    </section>
  );
}
function Details({
  ledger,
  run,
  context,
}: {
  ledger: ExtensionLedgerSnapshot;
  run: Run;
  context: ExtensionUIContext;
}) {
  const messages = runMessages(ledger, run);
  const assistants = messages.filter((message) => message.role === "assistant");
  const thoughts = messages
    .filter((message) => message.thinking)
    .map((message) => ({ id: message.id, text: message.thinking! }));
  const tools = messages.flatMap((message) => [
    ...(message.tools
      ? [{ id: `${message.id}:calls`, text: message.tools }]
      : []),
    ...(message.role === "tool"
      ? [{ id: `${message.id}:result`, text: message.text }]
      : []),
  ]);
  return (
    <div className="detail-scroll">
      <div className="run-heading">
        <span className={`dot ${run.status ?? "unknown"}`} />
        <span className="badge">
          {run.status ? statuses[run.status] : "状态未记录"}
        </span>
        <p>
          {preview(messages.find((item) => item.role === "user")?.text, 96) ||
            "本次运行没有记录用户消息"}
        </p>
      </div>
      <div className="metrics">
        {[
          ["开始时间", time(run.startedAt, true)],
          ["结束时间", time(run.endedAt, true)],
          ["耗时", duration(run) || "未记录"],
          ["关联消息", messages.length],
          ["助手回复", assistants.length],
          ["思考", thoughts.length],
          ["工具记录", tools.length],
          ["状态", run.status ? statuses[run.status] : "未记录"],
        ].map(([label, value]) => (
          <div className="metric" key={label}>
            <span>{label}</span>
            <strong title={String(value)}>{value}</strong>
          </div>
        ))}
      </div>
      <Blocks
        title="运行指令（实际提示词）"
        entries={ledger.instructions.filter((entry) =>
          run.instructionIds.includes(entry.id),
        )}
      />
      <Blocks
        title="请求上下文（包装后）"
        entries={ledger.contexts.filter((entry) =>
          run.contextIds.includes(entry.id),
        )}
      />
      <Blocks title="思考内容" entries={thoughts} />
      <Blocks title="工具调用" entries={tools} />
      {messages.some((item) => item.role === "system") && (
        <Messages
          title="系统消息"
          messages={messages.filter((item) => item.role === "system")}
          open={false}
        />
      )}
      <Messages
        title="用户消息"
        messages={messages.filter((item) => item.role === "user")}
      />
      <Messages title="助手回复" messages={assistants} />
      {messages.some(
        (item) => !["user", "assistant", "system", "tool"].includes(item.role),
      ) && (
        <Messages
          title="其他消息"
          messages={messages.filter(
            (item) =>
              !["user", "assistant", "system", "tool"].includes(item.role),
          )}
          open={false}
        />
      )}
      <Section title="本次运行的临时摘要" open={false}>
        <Summary context={context} scope={{ kind: "run", runId: run.id }} />
      </Section>
      <Section title="调试信息" open={false}>
        <pre>{JSON.stringify(run, null, 2)}</pre>
      </Section>
    </div>
  );
}
export function Ledger({
  context,
  styles,
}: {
  context: ExtensionUIContext;
  styles: string;
}) {
  const [ledger, setLedger] = useState<ExtensionLedgerSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [opening, setOpening] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);
    setError("");
    try {
      const value = await context.services.session.ledger.read({
        signal: controller.signal,
      });
      if (!controller.signal.aborted && !context.signal.aborted)
        setLedger(value);
    } catch (caught) {
      if (!controller.signal.aborted && !context.signal.aborted)
        setError(errorText(caught));
    } finally {
      if (pending.current === controller) pending.current = null;
      if (!context.signal.aborted) setLoading(false);
    }
  }, [context]);
  useEffect(() => {
    void load();
    return () => pending.current?.abort();
  }, [load]);
  const open = async (id: string, input = {}) => {
    if (opening || loading) return;
    setOpening(true);
    setError("");
    try {
      await context.ui.dialog.open({ id, input });
    } catch (caught) {
      if (!context.signal.aborted) setError(errorText(caught));
    } finally {
      if (!context.signal.aborted) setOpening(false);
    }
  };
  const runs = [...(ledger?.runs ?? [])].sort(
    (a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0),
  );
  const dialog = context.viewId !== "ledger";
  const selected = ledger?.runs.find((run) => run.id === context.input.runId);
  return (
    <>
      <style>{styles}</style>
      <main className={dialog ? "dialog-body" : "ledger"}>
        {!dialog && (
          <header className="header">
            <h2>
              <Activity />
              <span>运行链路</span>
              <span className="badge">{runs.length}</span>
            </h2>
            <div className="actions">
              <button
                className="icon-button"
                title="查看摘要"
                aria-label="查看摘要"
                disabled={
                  !ledger || loading || opening || !context.ui.dialog.available
                }
                onClick={() => void open("summary")}
              >
                <Eye />
              </button>
              <button
                className="icon-button"
                title="刷新链路"
                aria-label="刷新链路"
                disabled={loading || opening}
                onClick={() => void load()}
              >
                <RefreshCw className={loading ? "spin" : ""} />
              </button>
            </div>
          </header>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {ledger?.truncated && (
          <p className="notice">记录较多，当前展示的数据已截断。</p>
        )}
        {loading && !ledger ? (
          <Empty>正在读取链路…</Empty>
        ) : dialog ? (
          ledger &&
          (context.viewId === "summary" ? (
            <Summary
              context={context}
              scope={{ kind: "session" }}
              existing={ledger.summary}
            />
          ) : selected ? (
            <Details ledger={ledger} run={selected} context={context} />
          ) : (
            <Empty>此运行记录已不存在，请关闭后刷新链路。</Empty>
          ))
        ) : (
          <div className="run-list">
            {runs.length ? (
              runs.map((run, index) => {
                const messages = runMessages(ledger!, run);
                const title =
                  preview(
                    messages.find((item) => item.role === "user")?.text,
                    54,
                  ) || `第 ${runs.length - index} 次运行`;
                return (
                  <button
                    className="run-row"
                    key={run.id}
                    disabled={
                      loading || opening || !context.ui.dialog.available
                    }
                    title={
                      context.ui.dialog.available
                        ? "查看链路详情"
                        : "当前界面未提供弹窗插槽"
                    }
                    onClick={() => void open("run-detail", { runId: run.id })}
                  >
                    <span className={`dot ${run.status ?? "unknown"}`} />
                    <span className="run-copy">
                      <strong>{title}</strong>
                      <span className="reply">
                        {preview(
                          messages.find((item) => item.role === "assistant")
                            ?.text,
                        ) ||
                          (run.status === "running"
                            ? "回复生成中"
                            : "未记录回复内容")}
                      </span>
                      <span className="meta">
                        <span>
                          {run.status ? statuses[run.status] : "状态未记录"}
                        </span>
                        <span>{time(run.startedAt)}</span>
                        {duration(run) && <span>{duration(run)}</span>}
                      </span>
                    </span>
                    <ChevronRight />
                  </button>
                );
              })
            ) : (
              <Empty>
                <Activity />
                暂无运行链路
              </Empty>
            )}
          </div>
        )}
        {dialog && !loading && !ledger && (
          <button className="button retry" onClick={() => void load()}>
            重新加载
          </button>
        )}
      </main>
    </>
  );
}
