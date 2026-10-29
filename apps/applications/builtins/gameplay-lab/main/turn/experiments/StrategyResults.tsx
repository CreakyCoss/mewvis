import { ChevronRight, Play } from "lucide-react";
import {
  experimentPolicyName,
  experimentRows,
  type Experiment,
  type Sample,
} from "../records/records";

export function StrategyResults({
  experiment: e,
  busy,
  resume,
  preview,
}: {
  experiment: Experiment;
  busy: boolean;
  resume(): void;
  preview(sample: Sample): void;
}) {
  return (
    <article className="experiment-record">
      <div className="section-title">
        <h2>{e.model.name} · 策略对照</h2>
        <span className="muted">
          {
            {
              completed: "已完成",
              cancelled: "已取消，保留部分样本",
              interrupted: "已中断，可继续",
              running: "运行中",
            }[e.status]
          }
        </span>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>策略</th>
            <th>完成局数</th>
            <th>本局有人达标</th>
            <th>截断</th>
            <th>平均步数</th>
            <th>异常</th>
          </tr>
        </thead>
        <tbody>
          {experimentRows(e).map((r) => (
            <tr key={r.policy}>
              <td>{experimentPolicyName(e, r.policy)}</td>
              <td>{r.completed}</td>
              <td>{r.reached}</td>
              <td>{r.limited}</td>
              <td>{r.average}</td>
              <td>{r.error}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">
        {e.setup && <>场景 {e.setup.scenario.name} · </>}
        起始种子 {e.seed} · {e.players} 位参与者 · 每策略最多 {e.count} 局 ·{" "}
        {new Date(e.createdAt).toLocaleString()}
      </p>
      <div className="player-results">
        <h3>参与者与目标达成局数</h3>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>对照策略</th>
                {Array.from({ length: e.players }, (_, i) => (
                  <th key={i}>
                    {e.setup?.scenario.participants[i].name ??
                      `玩家 ${String.fromCharCode(65 + i)}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {experimentRows(e).map((row) => (
                <tr key={row.policy}>
                  <td>{experimentPolicyName(e, row.policy)}</td>
                  {row.players.map((p, i) => (
                    <td key={p.id}>
                      {p.reached} 局达标
                      <small>
                        {e.setup &&
                          `策略：${e.setup.strategies.find((s) => s.id === e.setup!.arms.find((a) => a.id === row.policy)!.strategyIds[i])?.name} · `}
                        {p.goals
                          .map((g) => `${g.name} ${g.reached}`)
                          .join(" / ")}
                      </small>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {e.samples.some((s) => s.error) && (
        <p className="error-banner" role="alert">
          {[
            ...new Set(e.samples.flatMap((s) => (s.error ? [s.error] : []))),
          ].join("；")}
        </p>
      )}
      <p className="hint">
        结果使用实验创建时的规则快照。“本局有人达标”统计任一参与者达到目标的局数。
      </p>
      {(e.status === "cancelled" || e.status === "interrupted") &&
        e.samples.length < e.count * e.policies.length && (
          <button className="button" disabled={busy} onClick={resume}>
            继续剩余样本
          </button>
        )}
      <details className="sample-list">
        <summary>逐局样本与回放（{e.samples.length}）</summary>
        {e.samples.map((sample) => (
          <button
            className="history-row"
            key={`${sample.policy}:${sample.index}`}
            onClick={() => preview(sample)}
          >
            <Play size={15} />
            <span>
              {experimentPolicyName(e, sample.policy)} · 种子 {sample.seed}
              <small className="history-meta">
                {sample.log.choices.length} 步 ·{" "}
                {sample.error
                  ? `异常：${sample.error}`
                  : sample.log.final.outcome?.kind === "won"
                    ? "目标已达成"
                    : "已截断"}
              </small>
            </span>
            <ChevronRight size={15} />
          </button>
        ))}
      </details>
    </article>
  );
}
