import { defineUIExtension } from "@isle/extension-sdk/ui";

export default defineUIExtension({
  id: "isle.session-insights",
  apiVersion: 1,
  mount(root, ctx) {
    const style = document.createElement("style");
    style.textContent = `
      .insights{padding:16px}.intro,.note{color:var(--muted-foreground);line-height:1.7}
      .intro{margin:0 0 20px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .metric{padding:16px 12px;border:1px solid var(--border);border-radius:12px}
      .value{font-size:26px;font-weight:600;font-variant-numeric:tabular-nums;margin-top:8px}
      .label{color:var(--muted-foreground);font-size:12px}.note{margin-top:16px;font-size:12px}
      button{padding:7px 12px;border:1px solid var(--border);border-radius:8px;background:var(--background)}
      .error{margin-top:12px;line-height:1.6}
    `;
    const body = document.createElement("div");
    body.className = "insights";
    const intro = document.createElement("p");
    intro.className = "intro";
    intro.textContent = "查看当前会话已保存的消息与运行记录。";
    const grid = document.createElement("div");
    grid.className = "grid";
    grid.setAttribute("aria-live", "polite");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "刷新统计";
    const note = document.createElement("p");
    note.className = "note";
    const error = document.createElement("p");
    error.className = "error";
    error.setAttribute("role", "alert");
    body.append(intro, grid, note, button, error);
    root.append(style, body);
    let disposed = false;
    const load = async () => {
      button.disabled = true;
      error.textContent = "";
      try {
        const snapshot = await ctx.host.session.read();
        if (disposed || ctx.signal.aborted) return;
        const duration = snapshot.runs.reduce(
          (sum, run) =>
            sum +
            (run.startedAt !== null && run.endedAt !== null
              ? Math.max(0, run.endedAt - run.startedAt)
              : 0),
          0,
        );
        const metrics = [
          [
            "用户消息",
            snapshot.messages.filter((message) => message.role === "user")
              .length,
          ],
          [
            "Agent 回复",
            snapshot.messages.filter((message) => message.role === "assistant")
              .length,
          ],
          ["运行次数", snapshot.runs.length],
          [
            "失败次数",
            snapshot.runs.filter((run) => run.status === "error").length,
          ],
          [
            "执行中",
            snapshot.runs.filter((run) => run.status === "running").length,
          ],
          ["累计运行时间", `${(duration / 1000).toFixed(1)}s`],
        ];
        grid.replaceChildren(
          ...metrics.map(([label, value]) => {
            const card = document.createElement("div");
            card.className = "metric";
            const title = document.createElement("div");
            title.className = "label";
            title.textContent = String(label);
            const count = document.createElement("div");
            count.className = "value";
            count.textContent = String(value);
            card.append(title, count);
            return card;
          }),
        );
        note.textContent = snapshot.truncated
          ? "当前统计仅覆盖返回的最近记录；数据或消息内容已截断。"
          : `更新于 ${new Date().toLocaleTimeString()} · 不含私有上下文，运行时间可能重叠。`;
      } catch (caught) {
        if (!disposed)
          error.textContent =
            caught instanceof Error ? caught.message : String(caught);
      } finally {
        if (!disposed) button.disabled = false;
      }
    };
    button.addEventListener("click", load);
    void load();
    return () => {
      disposed = true;
      button.removeEventListener("click", load);
      root.replaceChildren();
    };
  },
});
