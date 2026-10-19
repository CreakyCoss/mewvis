import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Activity,
  Bot,
  ChevronRight,
  Clock3,
  MessageSquare,
  RefreshCw,
  Settings2,
  UserRound,
  Wrench,
} from "lucide-react";
import type { ExtensionUIContext } from "@mewvis/extension-host/ui";
import type {
  ExtensionLedgerSnapshot,
  ExtensionSummaryResult,
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
const roleIcons: Record<string, typeof Activity> = {
  user: UserRound,
  assistant: Bot,
  system: Settings2,
  tool: Wrench,
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
function Messages({ messages }: { messages: Message[] }) {
  return (
    <section className="messages" aria-label="消息记录">
      {messages.length ? (
        messages.map((message) => {
          const Icon = roleIcons[message.role] ?? MessageSquare;
          return (
            <article className="message" key={message.id}>
              <header className="message-meta">
                <span className="message-role">
                  <Icon aria-hidden="true" />
                  {roles[message.role] ?? message.role}
                </span>
                <span>{time(message.timestamp, true)}</span>
                <span className="identifier" title={message.id}>
                  {shortId(message.id)}
                </span>
              </header>
              <div className="message-text">{message.text || "（空）"}</div>
            </article>
          );
        })
      ) : (
        <Empty>本次运行没有记录消息。</Empty>
      )}
    </section>
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
    <section className="records" aria-label={title}>
      <h3 className="records-heading">{title}</h3>
      {entries.length ? (
        entries.map((entry, index) => (
          <article key={entry.id} className="record">
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
    </section>
  );
}
function Summary({
  context,
  runId,
  onBusyChange,
  disabled = false,
}: {
  context: ExtensionUIContext;
  runId: string;
  onBusyChange(busy: boolean): void;
  disabled?: boolean;
}) {
  const [result, setResult] = useState<ExtensionSummaryResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    onBusyChange(busy);
    return () => onBusyChange(false);
  }, [busy, onBusyChange]);
  useEffect(() => () => abort.current?.abort(), []);
  const generate = async () => {
    if (abort.current || disabled) return;
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setError("");
    try {
      const value = await context.services.session.summarize(
        { scope: { kind: "run", runId } },
        { signal: controller.signal },
      );
      if (!controller.signal.aborted && !context.signal.aborted)
        setResult(value);
    } catch (caught) {
      if (!controller.signal.aborted && !context.signal.aborted)
        setError(errorText(caught));
    } finally {
      if (abort.current === controller) abort.current = null;
      if (!controller.signal.aborted && !context.signal.aborted) setBusy(false);
    }
  };
  return (
    <section className="summary-view">
      <p className="muted">
        本次运行的摘要仅用于本次查看，关闭后不保留，也不会影响后续聊天。
      </p>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      <div className="summary-text" aria-live="polite">
        {result?.text || (busy ? "正在生成摘要…" : "尚未生成摘要")}
      </div>
      <div className="summary-footer">
        <span className="muted">
          {result
            ? `生成于 ${time(result.generatedAt, true)}${result.truncated ? " · 基于截断后的记录" : ""} · 关闭后不保留`
            : ""}
        </span>
        <div className="actions">
          {busy && (
            <button
              className="button"
              onClick={() => {
                abort.current?.abort();
                abort.current = null;
                setBusy(false);
              }}
            >
              取消生成
            </button>
          )}
          <button
            className="button primary"
            disabled={
              disabled ||
              busy ||
              !context.services.supports("session.summarize")
            }
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
type RunView = Run & { messages: Message[]; number: number };
function Status({ run }: { run: Run }) {
  return (
    <span className={`status ${run.status ?? "unknown"}`}>
      <span className={`dot ${run.status ?? "unknown"}`} aria-hidden="true" />
      {run.status ? statuses[run.status] : "状态未记录"}
    </span>
  );
}
function Details({
  ledger,
  run,
  context,
  onSummaryBusy,
  loading,
}: {
  ledger: ExtensionLedgerSnapshot;
  run: RunView;
  context: ExtensionUIContext;
  onSummaryBusy(busy: boolean): void;
  loading: boolean;
}) {
  const [category, setCategory] = useState("messages");
  const messages = run.messages;
  const thoughts = messages
    .filter((message) => message.thinking)
    .map((message) => ({ id: message.id, text: message.thinking! }));
  const tools = messages.flatMap((message) => [
    ...(message.tools
      ? [
          {
            id: `${message.id}:calls`,
            text: message.tools,
            timestamp: message.timestamp,
          },
        ]
      : []),
    ...(message.role === "tool"
      ? [
          {
            id: `${message.id}:result`,
            text: message.text,
            timestamp: message.timestamp,
          },
        ]
      : []),
  ]);
  const instructions = ledger.instructions.filter((entry) =>
    run.instructionIds.includes(entry.id),
  );
  const contexts = ledger.contexts.filter((entry) =>
    run.contextIds.includes(entry.id),
  );
  const categories = [
    { id: "messages", title: "消息", count: messages.length },
    { id: "instructions", title: "指令", count: instructions.length },
    { id: "contexts", title: "上下文", count: contexts.length },
    { id: "tools", title: "工具", count: tools.length },
    { id: "thoughts", title: "思考", count: thoughts.length },
    { id: "summary", title: "运行摘要" },
  ];
  return (
    <section className="run-detail" aria-label={`第 ${run.number} 次运行详情`}>
      <header className="detail-heading">
        <div className="detail-eyebrow">
          <span>第 {run.number} 次运行</span>
          <Status run={run} />
        </div>
        <h2>
          {messages.find((message) => message.role === "user")?.text ||
            "本次运行没有记录用户消息"}
        </h2>
        <div className="detail-meta">
          <span>
            <Clock3 />
            {time(run.startedAt, true)}
          </span>
          <span>
            耗时{" "}
            {duration(run) || (run.status === "running" ? "计时中" : "未记录")}
          </span>
          <span>
            <MessageSquare />
            {messages.length} 条消息
          </span>
        </div>
      </header>
      <nav className="categories" aria-label="运行记录分类">
        {categories.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={category === item.id}
            onClick={() => setCategory(item.id)}
          >
            {item.title}
            {item.count !== undefined && <span>{item.count}</span>}
          </button>
        ))}
      </nav>
      <div className="detail-scroll" key={category}>
        {category === "messages" && (
          <>
            <Messages messages={messages} />
            <Section title="调试信息" open={false}>
              <div className="meta">结束时间 · {time(run.endedAt, true)}</div>
              <pre>
                {JSON.stringify(
                  ledger.runs.find((item) => item.id === run.id),
                  null,
                  2,
                )}
              </pre>
            </Section>
          </>
        )}
        {category === "instructions" && (
          <Blocks title="运行指令（实际提示词）" entries={instructions} />
        )}
        {category === "contexts" && (
          <Blocks title="请求上下文（包装后）" entries={contexts} />
        )}
        {category === "tools" && (
          <Blocks title="工具调用与结果" entries={tools} />
        )}
        {category === "thoughts" && (
          <Blocks title="思考内容" entries={thoughts} />
        )}
        {category === "summary" && (
          <Summary
            context={context}
            runId={run.id}
            onBusyChange={onSummaryBusy}
            disabled={loading}
          />
        )}
      </div>
    </section>
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
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
      if (!controller.signal.aborted && !context.signal.aborted)
        setLoading(false);
    }
  }, [context]);
  useEffect(() => {
    void load();
    return () => pending.current?.abort();
  }, [load]);
  const runs = useMemo(() => {
    if (!ledger) return [];
    const messages = new Map(
      ledger.messages.map((message) => [message.id, message]),
    );
    return [...ledger.runs]
      .sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))
      .map((run, index): RunView => ({
        ...run,
        number: ledger.runs.length - index,
        messages: run.messageIds.flatMap((id) => {
          const message = messages.get(id);
          return message ? [message] : [];
        }),
      }));
  }, [ledger]);
  const selected = runs.find((run) => run.id === selectedId) ?? runs[0];
  return (
    <>
      <style>{styles}</style>
      <main className="ledger" aria-busy={loading}>
        <header className="toolbar">
          <div className="toolbar-copy">
            <span className="ledger-symbol">
              <Activity />
            </span>
            <div>
              <strong>当前会话</strong>
              <p>
                {ledger
                  ? `${runs.length} 次运行 · ${ledger.messages.length} 条消息`
                  : "查看会话中的运行记录"}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="refresh-button"
            aria-label="刷新链路"
            title={loading ? "正在刷新…" : "刷新运行记录"}
            disabled={loading || summarizing}
            onClick={() => void load()}
          >
            <RefreshCw className={loading ? "spin" : ""} />
          </button>
        </header>
        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button
              className="button"
              disabled={loading || summarizing}
              onClick={() => void load()}
            >
              重新加载
            </button>
          </div>
        )}
        {ledger?.truncated && (
          <p className="notice">记录较多，当前仅展示部分运行与消息。</p>
        )}
        {loading && !ledger && (
          <p className="loading-status" role="status">
            正在读取运行链路…
          </p>
        )}
        {ledger && runs.length > 0 ? (
          <div className="ledger-layout">
            <aside className="run-sidebar" aria-label="运行记录">
              <div className="list-heading">
                <h2>运行记录</h2>
                <span className="badge">{runs.length}</span>
                <span className="muted">最新在前</span>
              </div>
              <div className="run-list">
                {runs.map((run) => {
                  const title =
                    preview(
                      run.messages.find((message) => message.role === "user")
                        ?.text,
                      70,
                    ) || `第 ${run.number} 次运行`;
                  return (
                    <button
                      type="button"
                      className="run-row"
                      key={run.id}
                      aria-pressed={selected?.id === run.id}
                      onClick={() => setSelectedId(run.id)}
                    >
                      <div className="run-row-top">
                        <span className="run-number">
                          #{String(run.number).padStart(2, "0")}
                        </span>
                        <Status run={run} />
                      </div>
                      <strong
                        title={
                          run.messages.find(
                            (message) => message.role === "user",
                          )?.text || title
                        }
                      >
                        {title}
                      </strong>
                      <span className="reply">
                        {preview(
                          run.messages.find(
                            (message) =>
                              message.role === "assistant" && message.text,
                          )?.text,
                        ) ||
                          (run.status === "running"
                            ? "回复生成中…"
                            : "未记录回复内容")}
                      </span>
                      <span className="run-row-meta">
                        <span>{time(run.startedAt)}</span>
                        {duration(run) && <span>{duration(run)}</span>}
                        <ChevronRight />
                      </span>
                    </button>
                  );
                })}
              </div>
            </aside>
            {runs.length > 0 && (
              <div className="mobile-picker">
                <label htmlFor="ledger-run">选择运行</label>
                <select
                  id="ledger-run"
                  value={selected?.id}
                  onChange={(event) => setSelectedId(event.target.value)}
                >
                  {runs.map((run) => (
                    <option key={run.id} value={run.id}>
                      第 {run.number} 次 ·{" "}
                      {run.status ? statuses[run.status] : "状态未记录"} ·{" "}
                      {preview(
                        run.messages.find((message) => message.role === "user")
                          ?.text,
                        32,
                      ) || "无用户消息"}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {selected ? (
              <Details
                key={selected.id}
                ledger={ledger}
                run={selected}
                context={context}
                onSummaryBusy={setSummarizing}
                loading={loading}
              />
            ) : null}
          </div>
        ) : !loading && ledger ? (
          <div className="ledger-empty">
            <Activity />
            <h2>暂无运行链路</h2>
            <p>发送一条消息后，可以在这里查看运行过程和详细记录。</p>
          </div>
        ) : null}
      </main>
    </>
  );
}
