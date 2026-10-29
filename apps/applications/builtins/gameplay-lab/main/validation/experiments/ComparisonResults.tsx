import {
  NativeSelect,
  NativeSelectOption,
} from "design-system/components/ui/native-select";
import { Play } from "lucide-react";
import { useMemo, useState } from "react";
import {
  experimentPolicyName,
  experimentRows,
  type Experiment,
  type Sample,
} from "../records/records";
import {
  experimentTotal,
  experimentVariants,
  pairedDifference,
  round,
  ruleChanges,
  variantModel,
} from "./comparison";
const signed = (v: number | null, unit = "") =>
  v === null ? "—" : `${v > 0 ? "+" : ""}${v}${unit}`;
const rate = (n: number, total: number) =>
  total ? `${round((n / total) * 100)}%` : "—";
export function ComparisonResults({
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
  const variants = experimentVariants(e),
    rows = experimentRows(e);
  const changes = useMemo(
    () =>
      variants.slice(1).map((v) => ({
        variant: v,
        changes: ruleChanges(e.model, variantModel(e, v.id)),
      })),
    [e.comparison, e.model],
  );
  return (
    <article className="experiment-record comparison-record">
      <div className="section-title">
        <h2>
          {e.model.name} ·{" "}
          {e.comparison!.mode === "versions" ? "版本对照" : "参数扫描"}
        </h2>
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
      <p className="hint">
        场景 {e.setup!.scenario.name} · 种子 {e.seed}–{e.seed + e.count - 1} ·{" "}
        {e.samples.length}/{experimentTotal(e)} 局 ·{" "}
        {new Date(e.createdAt).toLocaleString()}
      </p>
      <p className="hint">
        基准：{variants[0].name}
        。开局数值与能力已固定，不随模型初始值变化。所有规则、场景及策略均使用本次实验快照。
      </p>
      {e.comparison!.mode === "parameter" && <ParameterTrend experiment={e} />}
      <div className="table-scroll">
        <table className="data-table comparison-table">
          <thead>
            <tr>
              <th>规则分组</th>
              <th>策略</th>
              <th>完成 / 计划</th>
              {Array.from({ length: e.players }, (_, i) => (
                <th key={i}>{e.setup!.scenario.participants[i].name} 达标</th>
              ))}
              <th>平均步数</th>
              <th>截断 / 异常</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={`${row.variant}:${row.policy}`}
                className={row.variant === "baseline" ? "baseline-row" : ""}
              >
                <td>
                  {row.variant === "baseline" ? "基准 · " : ""}
                  {row.variantName}
                </td>
                <td>{experimentPolicyName(e, row.policy)}</td>
                <td>
                  {row.completed} / {e.count}
                </td>
                {row.players.map((p) => (
                  <td key={p.id}>
                    {p.reached} 局 · {rate(p.reached, row.completed)}
                  </td>
                ))}
                <td>{row.completed ? row.average : "—"}</td>
                <td>
                  {row.limited} / {row.error}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3 className="section-gap">与基准的差值</h3>
      <p className="hint">
        只比较同策略、同种子且双方均成功结算的样本。达标率差用百分点表示；异常样本不计入均值。平均步数包含正常结算到目标或预算上限的对局。
      </p>
      <div className="table-scroll">
        <table className="data-table comparison-table">
          <thead>
            <tr>
              <th>候选规则</th>
              <th>策略</th>
              <th>配对样本</th>
              {Array.from({ length: e.players }, (_, i) => (
                <th key={i}>
                  {e.setup!.scenario.participants[i].name} 达标率差
                </th>
              ))}
              <th>平均步数差</th>
              <th>结果变化</th>
            </tr>
          </thead>
          <tbody>
            {variants.slice(1).flatMap((v) =>
              e.policies.map((policy) => {
                const delta = pairedDifference(e, v.id, policy);
                return (
                  <tr key={`${v.id}:${policy}`}>
                    <td>{v.name}</td>
                    <td>{experimentPolicyName(e, policy)}</td>
                    <td>{delta.count}</td>
                    {delta.players.map((p) => (
                      <td key={p.id}>{signed(p.rate, " pp")}</td>
                    ))}
                    <td>{signed(delta.steps)}</td>
                    <td>{delta.count ? `${delta.changed} 局` : "—"}</td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      </div>
      <details className="sample-list">
        <summary>各参与者与目标结果</summary>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>规则 / 策略</th>
                <th>参与者</th>
                <th>目标</th>
                <th>达标局数 / 完成</th>
                <th>达标率</th>
                <th>与基准差</th>
              </tr>
            </thead>
            <tbody>
              {rows.flatMap((row) =>
                row.players.flatMap((p) =>
                  p.goals.map((g) => {
                    const delta =
                      row.variant === "baseline"
                        ? null
                        : (pairedDifference(e, row.variant, row.policy)
                            .players.find((v) => v.id === p.id)
                            ?.goals.find((v) => v.id === g.id)?.rate ?? null);
                    return (
                      <tr key={`${row.variant}:${row.policy}:${p.id}:${g.id}`}>
                        <td>
                          {row.variantName} ·{" "}
                          {experimentPolicyName(e, row.policy)}
                        </td>
                        <td>{p.name}</td>
                        <td>{g.name}</td>
                        <td>
                          {g.reached} / {row.completed}
                        </td>
                        <td>{rate(g.reached, row.completed)}</td>
                        <td>
                          {row.variant === "baseline"
                            ? "基准"
                            : !e.model.goals.some((v) => v.id === g.id)
                              ? "新增目标"
                              : signed(delta, " pp")}
                        </td>
                      </tr>
                    );
                  }),
                ),
              )}
            </tbody>
          </table>
        </div>
      </details>
      {changes.map(({ variant, changes }) => (
        <details className="sample-list" key={variant.id}>
          <summary>
            {variant.name} · 规则差异（{changes.length}）
          </summary>
          {!changes.length ? (
            <p className="hint">执行规则无变化。</p>
          ) : (
            <div className="table-scroll">
              <table className="data-table rule-changes">
                <thead>
                  <tr>
                    <th>规则</th>
                    <th>基准</th>
                    <th>候选</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.slice(0, 80).map((c, i) => (
                    <tr key={i}>
                      <td>{c.label}</td>
                      <td>{c.before}</td>
                      <td>{c.after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {changes.length > 80 && (
                <p className="hint">显示前 80 项，完整规则保存在实验快照中。</p>
              )}
            </div>
          )}
        </details>
      ))}
      {e.samples.some((s) => s.error) && (
        <p className="error-banner" role="alert">
          {[
            ...new Set(e.samples.flatMap((s) => (s.error ? [s.error] : []))),
          ].join("；")}
        </p>
      )}
      {(e.status === "cancelled" || e.status === "interrupted") &&
        e.samples.length < experimentTotal(e) && (
          <button className="button" disabled={busy} onClick={resume}>
            继续剩余样本
          </button>
        )}
      <details className="sample-list">
        <summary>逐局样本与回放（{e.samples.length}）</summary>
        {e.samples.map((sample) => (
          <button
            className="history-row"
            key={`${sample.variant}:${sample.policy}:${sample.index}`}
            onClick={() => preview(sample)}
          >
            <Play size={15} />
            <span>
              {variants.find((v) => v.id === sample.variant)?.name} ·{" "}
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
          </button>
        ))}
      </details>
    </article>
  );
}
function ParameterTrend({ experiment: e }: { experiment: Experiment }) {
  const [metric, setMetric] = useState("steps");
  const rows = experimentRows(e),
    variants = [...experimentVariants(e)].sort((a, b) => a.value! - b.value!),
    min = variants[0].value!,
    max = variants.at(-1)!.value!;
  const values = rows
      .filter((r) => r.completed)
      .map((r) =>
        metric === "steps"
          ? r.average
          : (100 * r.players[Number(metric)].reached) / r.completed,
      ),
    top =
      metric === "steps" ? Math.max(1, Math.ceil(Math.max(0, ...values))) : 100;
  const x = (n: number) => 50 + ((n - min) / (max - min)) * 550,
    y = (n: number) => 180 - (n / top) * 145;
  const colors = [
    "var(--primary)",
    "var(--info)",
    "var(--success)",
    "var(--warning)",
  ];
  return (
    <section className="parameter-trend">
      <div className="section-title">
        <h3>参数变化与结果</h3>
        <label>
          查看指标
          <NativeSelect
            aria-label="趋势指标"
            value={metric}
            onChange={(event) => setMetric(event.target.value)}
            size="sm"
          >
            <NativeSelectOption value="steps">平均步数</NativeSelectOption>
            {Array.from({ length: e.players }, (_, i) => (
              <NativeSelectOption key={i} value={i}>
                {e.setup!.scenario.participants[i].name} 达标率
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
      </div>
      <div className="trend-chart">
        <svg
          viewBox="0 0 640 225"
          role="img"
          aria-label={`参数扫描趋势：${metric === "steps" ? "平均步数" : "参与者达标率"}`}
        >
          {[0, top / 2, top].map((t) => (
            <g key={t}>
              <line
                x1="50"
                y1={y(t)}
                x2="600"
                y2={y(t)}
                className="trend-grid"
              />
              <text x="42" y={y(t) + 4} textAnchor="end">
                {round(t)}
                {metric === "steps" ? "" : "%"}
              </text>
            </g>
          ))}
          <line
            x1={x(e.comparison!.scan!.baseline)}
            x2={x(e.comparison!.scan!.baseline)}
            y1="25"
            y2="180"
            className="trend-baseline"
          >
            <title>基准值 {e.comparison!.scan!.baseline}</title>
          </line>
          {e.policies.map((policy, i) => {
            let path = "",
              connected = false;
            const points = variants.map((v) => {
              const r = rows.find(
                (r) => r.policy === policy && r.variant === v.id,
              )!;
              if (!r.completed) {
                connected = false;
                return null;
              }
              const value =
                metric === "steps"
                  ? r.average
                  : (100 * r.players[Number(metric)].reached) / r.completed;
              path += `${connected ? " L" : "M"}${x(v.value!)} ${y(value)}`;
              connected = true;
              return {
                x: x(v.value!),
                y: y(value),
                parameter: v.value!,
                value,
              };
            });
            return (
              <g key={policy} style={{ color: colors[i] }}>
                <path
                  d={path}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                {points
                  .filter((p) => p !== null)
                  .map((p) => (
                    <circle
                      key={p.parameter}
                      cx={p.x}
                      cy={p.y}
                      r="4"
                      fill="currentColor"
                    >
                      <title>
                        {experimentPolicyName(e, policy)} · 参数 {p.parameter} ·{" "}
                        {round(p.value)}
                        {metric === "steps" ? " 步" : "%"}
                      </title>
                    </circle>
                  ))}
              </g>
            );
          })}
          {variants.map((v) => (
            <text key={v.id} x={x(v.value!)} y="201" textAnchor="middle">
              {v.value}
              {v.id === "baseline" ? "*" : ""}
            </text>
          ))}
        </svg>
      </div>
      <div className="trend-legend">
        {e.policies.map((p, i) => (
          <span key={p} style={{ color: colors[i] }}>
            ● {experimentPolicyName(e, p)}
          </span>
        ))}
        <span>* 基准值</span>
      </div>
      <p className="hint">
        曲线使用已完成样本的均值；数值点可悬停查看，未完成分组留空。
      </p>
    </section>
  );
}
