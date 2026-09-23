import { definePlugin } from "@isle/extension-host";
import type {
  ExtensionLedgerSnapshot,
  ExtensionSummaryScope,
} from "@isle/extension-host/services";

const element = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = "",
  className = "",
) => {
  const node = document.createElement(tag);
  node.textContent = text;
  node.className = className;
  return node;
};
const time = (value: number | null) =>
  value ? new Date(value).toLocaleString() : "未记录时间";
const preview = (text: string, limit = 70) =>
  text.replace(/\s+/g, " ").trim().slice(0, limit);
const status = { running: "执行中", done: "已完成", error: "失败" };

export default definePlugin({
  id: "isle.session-ledger",
  protocolVersion: 1,
  mount(root, ctx) {
    const style = element("style");
    style.textContent = `
      .ledger{padding:14px;height:100%;overflow:auto}.header,.actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      h2{font-size:14px;margin:0;flex:1}.note{font-size:12px;color:var(--muted-foreground);line-height:1.6}
      button{border:1px solid var(--border);border-radius:7px;padding:6px 9px;background:var(--background)}
      .run,.summary{border:1px solid var(--border);border-radius:10px;margin-top:10px;padding:10px}
      summary{cursor:pointer;line-height:1.7;overflow-wrap:anywhere}summary:focus-visible{outline:2px solid var(--primary)}
      .message{border-top:1px solid var(--border);padding-top:8px;margin-top:8px}h3{font-size:12px;font-weight:600;margin:8px 0}
      pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.7 system-ui;margin:6px 0;max-height:400px;overflow:auto}
      details details{margin:10px 0}.error{line-height:1.6}.summary:empty,.error:empty{display:none}
    `;
    const body = element("div", "", "ledger"),
      header = element("header", "", "header");
    const title = element("h2", "运行链路"),
      refresh = element("button", "刷新链路");
    const summarize = element("button", "临时摘要"),
      cancel = element("button", "取消摘要");
    cancel.hidden = true;
    summarize.disabled = !ctx.services.supports("session.summarize");
    if (summarize.disabled) summarize.title = "当前宿主未提供摘要能力";
    header.append(title, refresh, summarize, cancel);
    const note = element(
      "p",
      "只读查看。临时摘要不会修改账本或影响后续对话。",
      "note",
    );
    const error = element("p", "", "error");
    error.setAttribute("role", "alert");
    const summary = element("section", "", "summary");
    summary.setAttribute("aria-live", "polite");
    const list = element("div");
    body.append(header, note, error, summary, list);
    root.append(style, body);
    let disposed = false,
      busy = false,
      summaryAbort: AbortController | undefined;
    const runButtons: HTMLButtonElement[] = [];
    const alive = () => !disposed && !ctx.signal.aborted;
    const setBusy = (value: boolean) => {
      busy = value;
      refresh.disabled = value;
      summarize.disabled = value || !ctx.services.supports("session.summarize");
      for (const button of runButtons) button.disabled = summarize.disabled;
      cancel.hidden = !summaryAbort;
    };
    const showError = (caught: unknown) => {
      if (alive())
        error.textContent =
          caught instanceof Error ? caught.message : String(caught);
    };
    const createSummary = async (scope: ExtensionSummaryScope) => {
      if (busy) return;
      summaryAbort = new AbortController();
      setBusy(true);
      error.textContent = "";
      try {
        const result = await ctx.services.session.summarize(
          { scope },
          { signal: summaryAbort.signal },
        );
        if (!alive()) return;
        summary.replaceChildren(
          element(
            "h3",
            scope.kind === "run" ? "本次运行的临时摘要" : "会话临时摘要",
          ),
          element("pre", result.text),
          element(
            "p",
            `生成于 ${time(result.generatedAt)}${result.truncated ? " · 基于截断后的消息" : ""} · 关闭面板后不保留`,
            "note",
          ),
        );
      } catch (caught) {
        showError(caught);
      } finally {
        summaryAbort = undefined;
        if (alive()) setBusy(false);
      }
    };
    const section = (title: string, texts: string[]) => {
      const node = element("details");
      node.append(element("summary", `${title} · ${texts.length}`));
      for (const text of texts) node.append(element("pre", text));
      if (!texts.length) node.append(element("p", "暂无记录", "note"));
      return node;
    };
    const render = (snapshot: ExtensionLedgerSnapshot) => {
      list.replaceChildren();
      runButtons.length = 0;
      title.textContent = `运行链路 · ${snapshot.runs.length}`;
      note.textContent = snapshot.truncated
        ? "记录已截断，仅展示返回的数据。摘要不会写回账本。"
        : "只读查看。临时摘要不会修改账本或影响后续对话。";
      if (snapshot.summary)
        list.append(section("已有摘要", [snapshot.summary]));
      const messages = new Map(
        snapshot.messages.map((item) => [item.id, item]),
      );
      for (const run of [...snapshot.runs].sort(
        (a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0),
      )) {
        const entries = run.messageIds.flatMap((id) =>
          messages.has(id) ? [messages.get(id)!] : [],
        );
        const node = element("details", "", "run");
        node.append(
          element(
            "summary",
            `${run.status ? status[run.status] : "状态未记录"} · ${preview(entries.find((item) => item.role === "user")?.text ?? "运行记录")}`,
          ),
        );
        node.append(
          element(
            "p",
            `${time(run.startedAt)}${run.startedAt && run.endedAt ? ` · ${((run.endedAt - run.startedAt) / 1000).toFixed(1)}s` : ""}`,
            "note",
          ),
        );
        const button = element("button", "总结本次运行");
        button.disabled = !ctx.services.supports("session.summarize");
        button.onclick = () =>
          void createSummary({ kind: "run", runId: run.id });
        runButtons.push(button);
        node.append(button);
        node.append(
          section(
            "运行指令",
            snapshot.instructions
              .filter((entry) => run.instructionIds.includes(entry.id))
              .map((entry) => entry.text),
          ),
        );
        node.append(
          section(
            "请求上下文",
            snapshot.contexts
              .filter((entry) => run.contextIds.includes(entry.id))
              .map((entry) => entry.text),
          ),
        );
        node.append(
          section(
            "思考记录",
            entries.flatMap((item) => (item.thinking ? [item.thinking] : [])),
          ),
        );
        node.append(
          section(
            "工具记录",
            entries.flatMap((item) => [
              ...(item.tools ? [item.tools] : []),
              ...(item.role === "tool" ? [item.text] : []),
            ]),
          ),
        );
        for (const message of entries) {
          const card = element("div", "", "message");
          card.append(
            element("h3", `${message.role} · ${time(message.timestamp)}`),
            element("pre", message.text || "（空）"),
          );
          node.append(card);
        }
        node.append(element("p", `运行标识：${run.id}`, "note"));
        list.append(node);
      }
      if (!snapshot.runs.length)
        list.append(element("p", "暂无运行链路", "note"));
    };
    const load = async () => {
      if (busy) return;
      setBusy(true);
      error.textContent = "";
      try {
        const result = await ctx.services.session.ledger.read();
        if (alive()) render(result);
      } catch (caught) {
        showError(caught);
      } finally {
        if (alive()) setBusy(false);
      }
    };
    refresh.onclick = () => void load();
    summarize.onclick = () => void createSummary({ kind: "session" });
    cancel.onclick = () => summaryAbort?.abort();
    void load();
    return () => {
      disposed = true;
      summaryAbort?.abort();
      root.replaceChildren();
    };
  },
});
