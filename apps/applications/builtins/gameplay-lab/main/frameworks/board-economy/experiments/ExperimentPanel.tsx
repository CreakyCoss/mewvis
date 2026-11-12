import { useEffect, useMemo, useState } from "react";
import {
  NativeSelect,
  NativeSelectOption,
} from "design-system/components/ui/native-select";
import { IncompatibleDataNotice } from "../../../app/projects/components/IncompatibleDataNotice";
import type { Project } from "../../../app/projects/model";
import type { BoardModel } from "../model";
import {
  boardExperimentIssues,
  boardExperimentTotal,
  type BoardExperiment,
  type BoardExperimentPlan,
  type BoardSample,
  type BoardVariant,
} from "./model";
import {
  boardExperimentRows,
  boardPairedComparison,
  boardPairedDifference,
} from "./statistics";
import {
  boardRentScanPoints,
  boardRentVariantLabel,
  createBoardRentScanPlan,
  parseBoardRentMultiplier,
} from "./rent-scan";
import {
  RentScanFields,
  RentScanPreview,
  type RentScanInput,
} from "./RentScanSettings";
import { RentScanTrend } from "./RentScanTrend";
import type { useBoardExperiments } from "./use-board-experiments";
const statusNames: Record<BoardExperiment["status"], string> = {
  running: "运行中",
  completed: "已完成",
  cancelled: "已取消",
  interrupted: "已中断",
};
const fixed = (value: number | null) =>
  value === null ? "—" : value.toFixed(1);
const signed = (value: number | null) =>
  value === null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
function source(
  project: Project<BoardModel>,
  key: string,
  id: BoardVariant["id"],
): BoardVariant | null {
  if (key === "draft")
    return {
      id,
      name: "当前草稿",
      source: { kind: "draft" },
      model: project.model,
    };
  const version = project.versions.find((v) => "version:" + v.id === key);
  return version
    ? {
        id,
        name: version.name,
        source: { kind: "version", id: version.id },
        model: version.model,
      }
    : null;
}
function RuleOptions({ project }: { project: Project<BoardModel> }) {
  return (
    <>
      <NativeSelectOption value="draft">当前草稿</NativeSelectOption>
      {project.versions.map((v) => (
        <NativeSelectOption key={v.id} value={"version:" + v.id}>
          {v.name}
        </NativeSelectOption>
      ))}
    </>
  );
}
export function ExperimentPanel({
  project,
  session,
  busy,
  preview,
}: {
  project: Project<BoardModel>;
  session: ReturnType<typeof useBoardExperiments>;
  busy: boolean;
  preview(e: BoardExperiment, s: BoardSample): void;
}) {
  const [mode, setMode] = useState("single"),
    [single, setSingle] = useState("draft"),
    [baseline, setBaseline] = useState(
      project.versions[0] ? "version:" + project.versions[0].id : "draft",
    ),
    [candidate, setCandidate] = useState("draft"),
    [seedStart, setSeedStart] = useState(42),
    [seedCount, setSeedCount] = useState(100);
  const [scanSeeds, setScanSeeds] = useState(20),
    [scanInput, setScanInput] = useState<RentScanInput>({
      start: "0.5",
      end: "2",
      step: "0.25",
    });
  const comparison = mode === "comparison",
    scanning = mode === "scan",
    count = scanning ? scanSeeds : seedCount;
  const variants = comparison
    ? [
        source(project, baseline, "baseline"),
        source(project, candidate, "candidate"),
      ]
    : [source(project, single, "baseline")];
  let plan: BoardExperimentPlan = {
    variants: variants.filter((v): v is BoardVariant => !!v),
    seedStart,
    seedCount: count,
  };
  let scanError = "";
  if (scanning && variants[0]) {
    try {
      const start = parseBoardRentMultiplier(scanInput.start),
        end = parseBoardRentMultiplier(scanInput.end),
        step = parseBoardRentMultiplier(scanInput.step);
      if (start === null || end === null || step === null)
        throw new Error("租金倍率须为 0.01–100，最多两位小数。");
      plan = createBoardRentScanPlan(
        variants[0],
        { kind: "rent-multiplier", start, end, step },
        seedStart,
        count,
      );
    } catch (cause) {
      scanError = (cause as Error).message;
    }
  }
  const issues = scanError
    ? [{ path: "棋盘实验", message: scanError }]
    : variants.some((v) => !v)
      ? [{ path: "棋盘实验", message: "规则来源已不存在，请重新选择。" }]
      : boardExperimentIssues(plan);
  const active =
    session.records.find((e) => e.id === session.activeId) ??
    session.records[0];
  return (
    <section className="page-content">
      <div className="page-heading">
        <div>
          <h1>棋盘自动实验</h1>
          <p>
            用相同种子验证局长、先后手胜率与现金流规则，保留每一局的冻结回放。
          </p>
        </div>
        <button
          className="button"
          disabled={busy || session.running}
          onClick={session.reload}
        >
          重新加载实验
        </button>
      </div>
      {session.error && (
        <p className="form-error" role="alert">
          {session.error}
        </p>
      )}
      {session.errors.map((e, i) => (
        <p className="form-error" key={i}>
          {e}
        </p>
      ))}
      <IncompatibleDataNotice
        items={session.incompatible}
        disabled={!session.ready || busy || session.running}
        remove={session.remove}
        done={session.reload}
      />
      <section className="settings-section">
        <h2>新建实验</h2>
        <fieldset
          className="board-experiment-fields"
          disabled={busy || session.running || !session.ready}
        >
          <div className="rule-grid">
            <label className="form-field">
              实验类型
              <NativeSelect
                size="sm"
                aria-label="棋盘实验类型"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
              >
                <NativeSelectOption value="single">单版验证</NativeSelectOption>
                <NativeSelectOption value="comparison">
                  规则版本对照
                </NativeSelectOption>
                <NativeSelectOption value="scan">
                  租金倍率扫描
                </NativeSelectOption>
              </NativeSelect>
            </label>
            {comparison ? (
              <>
                <label className="form-field">
                  基准规则
                  <NativeSelect
                    size="sm"
                    aria-label="棋盘实验基准规则"
                    value={baseline}
                    onChange={(e) => setBaseline(e.target.value)}
                  >
                    <RuleOptions project={project} />
                  </NativeSelect>
                </label>
                <label className="form-field">
                  候选规则
                  <NativeSelect
                    size="sm"
                    aria-label="棋盘实验候选规则"
                    value={candidate}
                    onChange={(e) => setCandidate(e.target.value)}
                  >
                    <RuleOptions project={project} />
                  </NativeSelect>
                </label>
              </>
            ) : (
              <label className="form-field">
                规则来源
                <NativeSelect
                  size="sm"
                  aria-label="棋盘实验规则来源"
                  value={single}
                  onChange={(e) => setSingle(e.target.value)}
                >
                  <RuleOptions project={project} />
                </NativeSelect>
              </label>
            )}
            {scanning && (
              <RentScanFields value={scanInput} change={setScanInput} />
            )}
            <label className="form-field">
              起始种子
              <input
                aria-label="棋盘实验起始种子"
                type="number"
                min={0}
                max={4294967295}
                value={seedStart}
                onChange={(e) => setSeedStart(Number(e.target.value))}
              />
            </label>
            <label className="form-field">
              种子数量
              <input
                aria-label="棋盘实验种子数量"
                type="number"
                min={1}
                max={Math.floor(240 / Math.max(1, plan.variants.length))}
                value={count}
                onChange={(e) =>
                  (scanning ? setScanSeeds : setSeedCount)(
                    Number(e.target.value),
                  )
                }
              />
            </label>
          </div>
          <p className="hint">
            固定第一位玩家先手，双方使用基础自动策略
            v1；每个种子先跑基准，再跑其余规则。单次最多 240 局。
          </p>
          {scanning && (
            <p className="hint">
              保留 1 倍基准，最多 11
              个倍率点；只调整地产租金，四舍五入为整数、最低
              1。换算相同的规则合并运行，超过租金上限时需缩小范围。不会修改草稿或命名版本。
            </p>
          )}
          {!scanError && (
            <p>
              种子 {seedStart}–{seedStart + count - 1} · {count} 个种子 ×{" "}
              {plan.variants.length} 份规则 = {boardExperimentTotal(plan)} 局
            </p>
          )}
          {scanning && !issues.length && <RentScanPreview plan={plan} />}
          {!!issues.length && (
            <ul className="form-error">
              {issues.map((i, n) => (
                <li key={n}>{i.message}</li>
              ))}
            </ul>
          )}
          <button
            className="button primary"
            disabled={!!issues.length}
            onClick={() => session.start(plan)}
          >
            开始棋盘实验
          </button>
        </fieldset>
      </section>
      {!!session.records.length && (
        <section className="settings-section">
          <label className="form-field">
            查看实验
            <NativeSelect
              size="sm"
              aria-label="查看棋盘实验"
              value={active?.id ?? ""}
              onChange={(e) => session.setActiveId(e.target.value)}
            >
              {session.records.map((e) => (
                <NativeSelectOption key={e.id} value={e.id}>
                  {e.scan
                    ? "租金扫描"
                    : e.variants.length === 2
                      ? "规则对照"
                      : "单版验证"}{" "}
                  · {new Date(e.createdAt).toLocaleString()} ·{" "}
                  {statusNames[e.status]} · {e.samples.length}/
                  {boardExperimentTotal(e)} 局
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
        </section>
      )}
      {active && (
        <BoardExperimentResults
          experiment={active}
          running={session.running}
          stopping={session.stopping}
          busy={busy}
          cancel={() => void session.cancel()}
          resume={() => session.resume(active)}
          preview={(s) => preview(active, s)}
        />
      )}
      {session.ready && !session.records.length && (
        <p className="hint">
          开始第一份实验后，计划及每个完成样本会自动保存。重新打开项目可继续未完成实验。
        </p>
      )}
    </section>
  );
}
function BoardExperimentResults({
  experiment: e,
  running,
  stopping,
  busy,
  cancel,
  resume,
  preview,
}: {
  experiment: BoardExperiment;
  running: boolean;
  stopping: boolean;
  busy: boolean;
  cancel(): void;
  resume(): void;
  preview(s: BoardSample): void;
}) {
  const rows = boardExperimentRows(e),
    paired = boardPairedComparison(e),
    points = boardRentScanPoints(e);
  const variantName = (id: BoardVariant["id"]) =>
    e.scan
      ? boardRentVariantLabel(points, id)
      : e.variants.find((v) => v.id === id)!.name;
  const [variant, setVariant] = useState<BoardVariant["id"]>("baseline"),
    [result, setResult] = useState("all"),
    [seed, setSeed] = useState(""),
    [page, setPage] = useState(0);
  useEffect(() => {
    setVariant("baseline");
    setResult("all");
    setSeed("");
    setPage(0);
  }, [e.id]);
  const filtered = useMemo(
    () =>
      e.samples
        .filter((s) => {
          if (
            s.variant !== variant ||
            (seed.trim() && String(s.seed) !== seed.trim())
          )
            return false;
          if (result === "all") return true;
          if (result === "error") return !!s.error;
          return !s.error && s.final.outcome?.kind === result;
        })
        .sort((a, b) => a.index - b.index),
    [e.samples, variant, result, seed],
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 10)),
    current = Math.min(page, pages - 1);
  return (
    <section className="settings-section board-experiment-results">
      <div className="page-heading">
        <div>
          <h2>
            {e.scan
              ? "租金倍率扫描结果"
              : e.variants.length === 2
                ? "规则版本对照结果"
                : "单版验证结果"}
          </h2>
          <p role="status">
            {statusNames[e.status]} · 已处理 {e.samples.length} /{" "}
            {boardExperimentTotal(e)} 局
          </p>
        </div>
        {running && e.status === "running" ? (
          <button
            className="button"
            disabled={stopping || busy}
            onClick={cancel}
          >
            {stopping ? "正在取消…" : "取消当前实验"}
          </button>
        ) : (
          e.status !== "completed" && (
            <button
              className="button"
              disabled={running || busy}
              onClick={resume}
            >
              继续实验
            </button>
          )
        )}
      </div>
      <progress
        aria-label="棋盘实验进度"
        max={boardExperimentTotal(e)}
        value={e.samples.length}
      />
      {e.scan && (
        <>
          <p className="hint">
            {points.length} 个倍率点合并为 {e.variants.length}{" "}
            份冻结规则；每份规则使用相同的 {e.seedCount}{" "}
            个种子。表格按独立规则分组，曲线按倍率点展示。
          </p>
          <RentScanPreview plan={e} />
          <RentScanTrend experiment={e} />
        </>
      )}
      <div className="board-experiment-table-scroll">
        <table>
          <caption>
            成功完成的样本统计；达到上限单列，错误样本不参与胜率和平均局长。
          </caption>
          <thead>
            <tr>
              <th>规则</th>
              <th>成功 / 计划</th>
              <th>先手胜率</th>
              <th>后手胜率</th>
              <th>平均回合</th>
              <th>破产率</th>
              <th>上限率</th>
              <th>错误</th>
              {e.scan && (
                <>
                  <th>与基准配对</th>
                  <th>局长差</th>
                  <th>先手胜率差</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <th scope="row">
                  {!e.scan && e.variants.length === 2
                    ? row.id === "baseline"
                      ? "基准 · "
                      : "候选 · "
                    : ""}
                  {variantName(row.id)}
                </th>
                <td>
                  {row.finished} / {row.planned}
                </td>
                <td>{row.finished ? fixed(row.winRates[0]) + "%" : "—"}</td>
                <td>{row.finished ? fixed(row.winRates[1]) + "%" : "—"}</td>
                <td>{fixed(row.averageTurns)}</td>
                <td>{row.finished ? fixed(row.bankruptRate) + "%" : "—"}</td>
                <td>{row.finished ? fixed(row.limitRate) + "%" : "—"}</td>
                <td>{row.errors}</td>
                {e.scan &&
                  (() => {
                    const diff = boardPairedDifference(e, row.id);
                    return (
                      <>
                        <td>{diff ? `${diff.count} 组` : "基准"}</td>
                        <td>
                          {diff
                            ? signed(diff.averageTurnChange) + " 回合"
                            : "—"}
                        </td>
                        <td>
                          {diff
                            ? signed(diff.firstWinRateChange) + " 个百分点"
                            : "—"}
                        </td>
                      </>
                    );
                  })()}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {e.scan && (
        <p className="hint">
          差值为扫描规则减基准，仅使用双方均成功的同种子；没有配对数据时留空。错误样本保留在记录中，不计入统计。
        </p>
      )}
      {paired && (
        <div className="board-paired-summary">
          <strong>同种子配对 · {paired.count} 组</strong>
          <p>
            {paired.count
              ? `候选 − 基准：平均局长 ${signed(paired.averageTurnChange)} 回合；先手胜率 ${signed(paired.firstWinRateChange)} 个百分点。`
              : "两版都成功完成同一种子后显示配对差异。"}
          </p>
          <small>
            仅纳入两版都成功的同种子样本；未完成或错误的单元不进入配对差异。
          </small>
          <p className="hint">
            上限率较高时，先手胜率下降不能单独说明先手优势减小。
          </p>
        </div>
      )}
      <details>
        <summary>冻结的规则与执行方式</summary>
        {e.variants.map((v) => (
          <p key={v.id}>
            {v.id === "baseline" ? "基准" : "候选"} · {variantName(v.id)}：
            {v.model.tiles.length} 格，初始资金 {v.model.rules.initialCash}
            ，起点收入 {v.model.rules.salary}，{v.model.rules.diceSides}{" "}
            面骰子，上限 {v.model.rules.maxTurns} 回合。
          </p>
        ))}
        <p>
          模拟器 board-economy v1 · 基础自动策略 v1 · 起始种子 {e.seedStart}
        </p>
      </details>
      <h3>样本回放</h3>
      <div className="rule-grid">
        <label className="form-field">
          样本版本
          <NativeSelect
            size="sm"
            aria-label="棋盘实验样本版本"
            value={variant}
            onChange={(event) => {
              setVariant(event.target.value as BoardVariant["id"]);
              setPage(0);
            }}
          >
            {e.variants.map((v) => (
              <NativeSelectOption value={v.id} key={v.id}>
                {variantName(v.id)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        <label className="form-field">
          结果筛选
          <NativeSelect
            size="sm"
            aria-label="棋盘实验样本结果"
            value={result}
            onChange={(event) => {
              setResult(event.target.value);
              setPage(0);
            }}
          >
            <NativeSelectOption value="all">全部结果</NativeSelectOption>
            <NativeSelectOption value="won">破产结束</NativeSelectOption>
            <NativeSelectOption value="limit">达到上限</NativeSelectOption>
            <NativeSelectOption value="error">执行错误</NativeSelectOption>
          </NativeSelect>
        </label>
        <label className="form-field">
          查找种子
          <input
            aria-label="查找棋盘实验种子"
            inputMode="numeric"
            value={seed}
            onChange={(event) => {
              setSeed(event.target.value);
              setPage(0);
            }}
            placeholder="输入完整种子"
          />
        </label>
      </div>
      <div className="board-experiment-samples">
        {filtered.slice(current * 10, current * 10 + 10).map((s) => {
          const name = e.variants.find((v) => v.id === s.variant)!.name;
          return (
            <article key={`${s.variant}:${s.index}`}>
              <div>
                <strong>
                  种子 {s.seed} ·{" "}
                  {s.error
                    ? "执行错误"
                    : s.final.outcome?.kind === "won"
                      ? `${s.final.players[s.final.outcome.winner].name} 获胜`
                      : "达到上限"}
                </strong>
                <p>
                  {s.final.turn} 回合 · {s.decisions.length} 步操作
                </p>
                {s.error && <p className="form-error">{s.error}</p>}
              </div>
              <button
                className="button"
                aria-label={`回放 ${name} 种子 ${s.seed}`}
                disabled={busy}
                onClick={() => preview(s)}
              >
                回放样本
              </button>
            </article>
          );
        })}
      </div>
      {!filtered.length && <p className="hint">当前筛选没有已保存的样本。</p>}
      <div className="board-sample-pages">
        <button
          className="button"
          disabled={!current}
          onClick={() => setPage(current - 1)}
        >
          上一页样本
        </button>
        <span>
          第 {current + 1} / {pages} 页 · {filtered.length} 局
        </span>
        <button
          className="button"
          disabled={current >= pages - 1}
          onClick={() => setPage(current + 1)}
        >
          下一页样本
        </button>
      </div>
    </section>
  );
}
