import { Play } from "lucide-react";
import { useMemo } from "react";
import { narrativeAnalysis } from "../analysis";
import { type NarrativeModel } from "../model";
import { type StoryRecord } from "../records";

export function HistoryView({
  model,
  records,
  historyReady,
  historyErrors,
  busy,
  reload,
  openRecord,
  editNode,
}: {
  model: NarrativeModel;
  records: StoryRecord[];
  historyReady: boolean;
  historyErrors: string[];
  busy: boolean;
  reload(): void;
  openRecord(record: StoryRecord): void;
  editNode(id: string): void;
}) {
  const analysis = useMemo(() => narrativeAnalysis(model), [model]);
  return (
    <section className="page-content">
      <div className="page-heading">
        <div>
          <h1>试玩记录与结构检查</h1>
          <p>
            叙事以分支、条件和后果为检查对象；体验与选择质量需要人工试玩判断。
          </p>
        </div>
        <button className="button" disabled={busy} onClick={reload}>
          重新加载记录
        </button>
      </div>
      <section className="settings-section">
        <h2>当前草稿 · 结构可达性</h2>
        <p>
          {model.nodes.length} 段剧情 · 从起点结构上可达 {analysis.reachable} 段
          · 可达结局 {analysis.endings} 个
        </p>
        <p className="hint">
          这里只检查连线，不穷举条件组合，也不代表实际玩家可以到达所有结局。
        </p>
        {analysis.unreachable.map((n) => (
          <p key={n.id}>
            未连接到起点：
            <button className="text-button" onClick={() => editNode(n.id)}>
              {n.title}
            </button>
          </p>
        ))}
      </section>
      {historyErrors.map((e, i) => (
        <p className="form-error" key={i} role="alert">
          {e}
        </p>
      ))}
      <h2>已保存的试玩</h2>
      {records.map((r) => (
        <button
          className="history-row"
          key={r.id}
          onClick={() => openRecord(r)}
        >
          <Play size={16} />
          <span>
            {r.model.name} · {r.decisions.length} 次选择
            <small className="history-meta">
              {new Date(r.updatedAt).toLocaleString()} · 条件分支叙事 v
              {r.simulator.version}
            </small>
          </span>
          <span>
            {r.final.outcome === "ending"
              ? "已到结局"
              : r.final.outcome === "playing"
                ? "可继续"
                : r.final.outcome === "blocked"
                  ? "条件死路"
                  : "达到上限"}
          </span>
        </button>
      ))}
      {historyReady && !records.length && (
        <p className="hint">
          开始人工试玩后，每次选择都会保存。重开可继续或回放。
        </p>
      )}
    </section>
  );
}
