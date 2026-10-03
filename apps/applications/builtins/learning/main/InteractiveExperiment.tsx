import { SelectField } from "./SelectField";
import { useId, useMemo, useRef, useState } from "react";
import { Lightbulb, RotateCcw } from "lucide-react";
import { FunctionExperiment } from "./FunctionExperiment";
import { Formula } from "./RichLesson";
import {
  checkModel,
  evaluateExperiment,
  initialValues,
  nextObservation,
  outputFormula,
  sampleExperiment,
  snapValue,
  type ExperimentConfig,
  type ExperimentAttempt,
  type ExpressionAttempt,
  type ExpressionExperiment,
  type Values,
} from "./experiments";
import { formatNumber } from "./expression";

function ModelGraph({
  config,
  values,
}: {
  config: ExpressionExperiment;
  values: Values;
}) {
  const goal = config.goal;
  const [selected, setSelected] = useState(
    goal.mode === "explore" ? config.outputs[0].id : goal.output,
  );
  const output =
    config.outputs.find((output) => output.id === selected) ??
    config.outputs[0];
  const series = config.outputs.filter((item) => item.unit === output.unit);
  const samples = useMemo(
    () => sampleExperiment(config, values),
    [config, values],
  );
  const showTarget =
    goal.mode === "curve" && series.some((output) => output.id === goal.output);
  const ys = samples
    .flatMap((sample) => [
      ...series.map((output) => sample.outputs?.[output.id]),
      ...(showTarget ? [sample.target] : []),
    ])
    .filter(
      (value): value is number => value !== undefined && Number.isFinite(value),
    );
  if (
    goal.mode === "target" &&
    series.some((output) => output.id === goal.output)
  )
    ys.push(...(goal.kind === "value" ? [goal.value] : [goal.min, goal.max]));
  const low = ys.length ? Math.min(...ys) : -1,
    high = ys.length ? Math.max(...ys) : 1;
  const padding =
    high === low ? Math.max(Math.abs(low) * 0.1, 1) : (high - low) * 0.08;
  const yMin = low - padding,
    yMax = high + padding;
  const x = (value: number) =>
    64 +
    ((value - config.axis.min) / (config.axis.max - config.axis.min)) * 580;
  const y = (value: number) => 274 - ((value - yMin) / (yMax - yMin)) * 244;
  const colors = [
    "var(--primary)",
    "var(--learn-experiment-target)",
    "var(--learn-experiment-third)",
  ];
  const axisVariable = config.variables.find(
    (variable) => variable.id === config.axis.variable,
  );
  const path = (
    get: (sample: (typeof samples)[number]) => number | undefined,
  ) => {
    let started = false;
    return samples
      .map((sample) => {
        const value = get(sample);
        if (value === undefined) {
          started = false;
          return "";
        }
        const command = `${started ? "L" : "M"}${x(sample.x).toFixed(2)},${y(value).toFixed(2)}`;
        started = true;
        return command;
      })
      .join(" ");
  };
  return (
    <div className="learn-model-graph">
      {new Set(config.outputs.map((output) => output.unit)).size > 1 && (
        <label>
          曲线结果
          <SelectField
            value={output.id}
            onChange={(event) => setSelected(event.target.value)}
          >
            {config.outputs.map((output) => (
              <option key={output.id} value={output.id}>
                {output.label}
                {output.unit ? `（${output.unit}）` : ""}
              </option>
            ))}
          </SelectField>
        </label>
      )}
      <svg
        viewBox="0 0 680 320"
        role="img"
        aria-label={`${axisVariable?.label ?? config.axis.variable}从 ${formatNumber(config.axis.min)} 到 ${formatNumber(config.axis.max)} 时，${series.map((output) => output.label).join("、")}的变化曲线。未定义的采样点以断线表示。`}
      >
        <title>实验结果曲线</title>
        {Array.from({ length: 5 }, (_, index) => {
          const vx =
            config.axis.min + ((config.axis.max - config.axis.min) * index) / 4;
          const vy = yMin + ((yMax - yMin) * index) / 4;
          return (
            <g key={index} className="learn-graph-grid">
              <line x1={x(vx)} y1={30} x2={x(vx)} y2={274} />
              <line x1={64} y1={y(vy)} x2={644} y2={y(vy)} />
              <text x={x(vx)} y={294} textAnchor="middle">
                {formatNumber(vx)}
              </text>
              <text x={56} y={y(vy) + 4} textAnchor="end">
                {formatNumber(vy)}
              </text>
            </g>
          );
        })}
        {config.axis.min <= 0 && config.axis.max >= 0 && (
          <line
            className="learn-graph-axis"
            x1={x(0)}
            x2={x(0)}
            y1={30}
            y2={274}
          />
        )}
        {yMin <= 0 && yMax >= 0 && (
          <line
            className="learn-graph-axis"
            x1={64}
            x2={644}
            y1={y(0)}
            y2={y(0)}
          />
        )}
        {series.map((output, index) => (
          <path
            key={output.id}
            d={path((sample) => sample.outputs?.[output.id])}
            fill="none"
            stroke={colors[index]}
            strokeWidth={2.5}
            strokeDasharray={index === 2 ? "7 3" : undefined}
          />
        ))}
        {showTarget && (
          <path
            d={path((sample) => sample.target)}
            fill="none"
            stroke="var(--muted-foreground)"
            strokeWidth={2}
            strokeDasharray="4 5"
          />
        )}
        {goal.mode === "target" &&
          goal.kind === "value" &&
          goal.at?.variable === config.axis.variable &&
          series.some((output) => output.id === goal.output) &&
          goal.at.value >= config.axis.min &&
          goal.at.value <= config.axis.max && (
            <circle
              cx={x(goal.at.value)}
              cy={y(goal.value)}
              r={5}
              fill="var(--card)"
              stroke="var(--muted-foreground)"
              strokeWidth={2}
            />
          )}
        <text className="learn-graph-label" x={64} y={17}>
          {output.unit || "结果"}
        </text>
        <text className="learn-graph-label" x={644} y={316} textAnchor="end">
          {axisVariable?.label ?? config.axis.variable}
          {axisVariable?.unit ? `（${axisVariable.unit}）` : ""}
        </text>
      </svg>
      <div className="learn-graph-legend">
        {series.map((output, index) => (
          <span key={output.id}>
            <i style={{ background: colors[index] }} />
            {output.label}
            {index === 2 ? " · 虚线" : ""}
          </span>
        ))}
        {showTarget && <span>┄ 目标曲线</span>}
      </div>
      {!ys.length && (
        <p className="learn-field-error">当前范围内没有可绘制的结果。</p>
      )}
    </div>
  );
}
function SampleTable({
  config,
  values,
}: {
  config: ExpressionExperiment;
  values: Values;
}) {
  const samples = useMemo(
    () => sampleExperiment(config, values, 11),
    [config, values],
  );
  const variable = config.variables.find(
    (variable) => variable.id === config.axis.variable,
  );
  return (
    <details className="learn-observation-table">
      <summary>采样数据 · 11 个位置</summary>
      <div className="learn-table-scroll">
        <table>
          <thead>
            <tr>
              <th>
                {variable?.label ?? config.axis.variable}
                {variable?.unit ? `（${variable.unit}）` : ""}
              </th>
              {config.outputs.map((output) => (
                <th key={output.id}>
                  {output.label}
                  {output.unit ? `（${output.unit}）` : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {samples.map((sample, index) => (
              <tr key={index}>
                <td>{formatNumber(sample.x)}</td>
                {config.outputs.map((output) => (
                  <td key={output.id}>
                    {sample.outputs
                      ? formatNumber(sample.outputs[output.id])
                      : "未定义"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <small>
        固定其他变量，只改变 {config.axis.variable}；采样值用于观察曲线。
      </small>
    </details>
  );
}
export function ExpressionLab({
  config,
  attempt,
  onCheck,
  preview = false,
  disabled = false,
  onAsk,
  onReference,
}: {
  config: ExpressionExperiment;
  attempt?: ExpressionAttempt;
  onCheck?: (attempt: ExpressionAttempt) => Promise<void>;
  preview?: boolean;
  disabled?: boolean;
  onAsk?: (prompt: string) => void;
  onReference?: (values: Values) => void;
}) {
  const inputId = useId();
  const [values, setValues] = useState<Values>(
    attempt?.values ?? initialValues(config),
  );
  const [record, setRecord] = useState(attempt);
  const [checked, setChecked] = useState(!!attempt),
    [hint, setHint] = useState(false),
    [saving, setSaving] = useState(false),
    [saveError, setSaveError] = useState("");
  const lock = useRef(false);
  const busy = disabled || saving;
  const goalOutput =
    config.goal.mode === "explore" ? undefined : config.goal.output;
  const goalLabel =
    config.outputs.find((output) => output.id === goalOutput)?.label ??
    goalOutput;
  let outputs: Values | undefined,
    error = "",
    result: ReturnType<typeof checkModel> | undefined;
  try {
    outputs = evaluateExperiment(config, values);
    result = checkModel(config, values);
  } catch (e) {
    error = e instanceof Error ? e.message : "请检查输入参数";
  }
  const update = (id: string, value: number) => {
    setValues((current) => ({ ...current, [id]: value }));
    setChecked(false);
    setSaveError("");
  };
  const observations = record?.history ?? (record ? [record] : []);
  const save = async () => {
    if (lock.current || busy || error) return;
    lock.current = true;
    setSaving(true);
    setSaveError("");
    try {
      const next = nextObservation(values, record);
      await onCheck?.(next);
      setRecord(next);
      setChecked(true);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "保存失败，请重试");
    } finally {
      lock.current = false;
      setSaving(false);
    }
  };
  return (
    <section
      className={`learn-experiment learn-expression-lab ${preview ? "is-preview" : ""}`}
      aria-label={preview ? "实验试跑" : "互动实验"}
    >
      <div className="learn-experiment-heading">
        <div>
          <span className="learn-activity-mode">
            {config.goal.mode === "explore" ? "自由探索" : "目标挑战"}
          </span>
          <h2>{config.task}</h2>
          <p>
            调整变量，观察结果
            {config.goal.mode === "explore"
              ? "，记录并比较不同尝试。"
              : "，再检查是否达到目标。"}
          </p>
        </div>
      </div>
      <div className="learn-model-formulas">
        {config.outputs.map((output) => (
          <div key={output.id}>
            <small>{output.label}</small>
            <Formula latex={outputFormula(config, output.id)} />
          </div>
        ))}
      </div>
      {config.views.values && (
        <div className="learn-model-values">
          {config.outputs.map((output) => (
            <div key={output.id}>
              <span>{output.label}</span>
              <strong>
                {outputs ? formatNumber(outputs[output.id]) : "—"}
                <small>{output.unit}</small>
              </strong>
            </div>
          ))}
        </div>
      )}
      {config.views.graph && <ModelGraph config={config} values={values} />}
      <fieldset className="learn-parameter-controls" disabled={busy}>
        <legend>调整实验变量</legend>
        {config.variables.map((variable) => (
          <div className="learn-parameter-control" key={variable.id}>
            <label htmlFor={`${inputId}-${variable.id}`}>
              {variable.label}{" "}
              <small>
                {variable.id}
                {variable.unit ? ` · ${variable.unit}` : ""}
              </small>
            </label>
            {variable.control === "slider" ? (
              <>
                <output>{formatNumber(values[variable.id])}</output>
                <input
                  id={`${inputId}-${variable.id}`}
                  type="range"
                  min={variable.min}
                  max={variable.max}
                  step={variable.step}
                  value={values[variable.id]}
                  onChange={(event) =>
                    update(
                      variable.id,
                      snapValue(variable, Number(event.target.value)),
                    )
                  }
                />
                <div className="learn-range-ends">
                  <span>{formatNumber(variable.min)}</span>
                  <span>{formatNumber(variable.max)}</span>
                </div>
              </>
            ) : variable.control === "number" ? (
              <input
                id={`${inputId}-${variable.id}`}
                type="number"
                min={variable.min}
                max={variable.max}
                step={variable.step}
                value={
                  Number.isFinite(values[variable.id])
                    ? values[variable.id]
                    : ""
                }
                onChange={(event) =>
                  update(variable.id, event.target.valueAsNumber)
                }
              />
            ) : variable.control === "select" ? (
              <SelectField
                id={`${inputId}-${variable.id}`}
                value={values[variable.id]}
                onChange={(event) =>
                  update(variable.id, Number(event.target.value))
                }
              >
                {variable.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectField>
            ) : (
              <input
                id={`${inputId}-${variable.id}`}
                type="checkbox"
                role="switch"
                checked={values[variable.id] === 1}
                onChange={(event) =>
                  update(variable.id, event.target.checked ? 1 : 0)
                }
              />
            )}
          </div>
        ))}
      </fieldset>
      {error && (
        <p className="learn-field-error" role="alert">
          {error}
        </p>
      )}
      {config.views.table && <SampleTable config={config} values={values} />}
      {config.goal.mode !== "explore" && (
        <p className="learn-goal-description">
          {config.goal.mode === "curve"
            ? `${goalLabel} 与目标曲线比较 ${config.axis.samples} 个采样点，允许误差 ${formatNumber(config.goal.tolerance)}。`
            : `${config.goal.at ? `在 ${config.goal.at.variable} = ${formatNumber(config.goal.at.value)} 时，` : ""}${goalLabel} ${config.goal.kind === "value" ? `达到 ${formatNumber(config.goal.value)}` : `位于 ${formatNumber(config.goal.min)}–${formatNumber(config.goal.max)}`}，允许误差 ${formatNumber(config.goal.tolerance)}。`}
        </p>
      )}
      <div className="learn-experiment-footer">
        <div className="learn-experiment-actions">
          <button
            type="button"
            className="learn-button"
            disabled={busy}
            onClick={() => {
              setValues(initialValues(config));
              setChecked(false);
              setSaveError("");
            }}
          >
            <RotateCcw size={14} />
            重置
          </button>
          <button
            type="button"
            className="learn-button primary"
            disabled={busy || !!error}
            onClick={() => void save()}
          >
            {saving
              ? "保存中…"
              : config.goal.mode === "explore"
                ? "记录本次观察"
                : "检查结果"}
          </button>
        </div>
        {onReference && config.goal.mode !== "explore" && (
          <button
            type="button"
            className="learn-button compact"
            disabled={!!error || busy}
            onClick={() => onReference({ ...values })}
          >
            用当前参数作参考解
          </button>
        )}
      </div>
      {saveError && (
        <p className="learn-field-error" role="alert">
          {saveError}
        </p>
      )}
      {checked && result && !error && (
        <div
          className={`learn-experiment-result ${result.passed === false ? "retry" : "passed"}`}
          role="status"
        >
          <strong>
            {result.passed === null
              ? "观察已记录"
              : result.passed
                ? "挑战完成"
                : "再调整一下"}
          </strong>
          <p>
            {result.message}
            {result.passed && config.successMessage
              ? ` ${config.successMessage}`
              : ""}
          </p>
        </div>
      )}
      <div className="learn-experiment-help">
        {config.hint && (
          <button
            type="button"
            className="learn-button text compact"
            aria-expanded={hint}
            onClick={() => setHint(!hint)}
          >
            <Lightbulb size={15} />
            {hint ? "收起提示" : "给我一点提示"}
          </button>
        )}
        {onAsk && (
          <button
            type="button"
            className="learn-button text compact"
            disabled={!!error}
            onClick={() =>
              onAsk(
                `我在做互动实验：${config.task}。模型：${config.outputs.map((output) => `${output.id}=${output.expression}`).join("；")}。当前参数：${JSON.stringify(values)}；结果：${JSON.stringify(outputs)}。${config.goal.mode === "explore" ? "请引导我观察变量与结果的关系。" : `任务：${result?.message}。请先给思考提示。`}`,
              )
            }
          >
            请导师帮我分析
          </button>
        )}
      </div>
      {hint && <p className="learn-experiment-hint">{config.hint}</p>}
      {!!observations.length && (
        <details className="learn-observation-table">
          <summary>观察记录 · 最近 {observations.length} 次</summary>
          <div className="learn-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>尝试</th>
                  {config.variables.map((v) => (
                    <th key={v.id}>{v.id}</th>
                  ))}
                  {config.outputs.map((o) => (
                    <th key={o.id}>
                      {o.label}
                      {o.unit ? `（${o.unit}）` : ""}
                    </th>
                  ))}
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {observations.map((observation, index) => {
                  const result = evaluateExperiment(config, observation.values);
                  return (
                    <tr key={index}>
                      <td>{index + 1}</td>
                      {config.variables.map((v) => (
                        <td key={v.id}>
                          {formatNumber(observation.values[v.id])}
                        </td>
                      ))}
                      {config.outputs.map((o) => (
                        <td key={o.id}>{formatNumber(result[o.id])}</td>
                      ))}
                      <td>
                        <button
                          type="button"
                          className="learn-button text compact"
                          disabled={busy}
                          onClick={() => {
                            setValues({ ...observation.values });
                            setChecked(false);
                            setSaveError("");
                          }}
                        >
                          恢复参数 {index + 1}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      )}
      {preview && (
        <small className="learn-muted">试跑记录只保留在预览中。</small>
      )}
    </section>
  );
}
export function InteractiveExperiment({
  config,
  attempt,
  onCheck,
  ...props
}: {
  config: ExperimentConfig;
  attempt?: ExperimentAttempt;
  onCheck?: (attempt: ExperimentAttempt) => Promise<void>;
  disabled?: boolean;
  onAsk?: (prompt: string) => void;
}) {
  return config.template === "linear-function" ? (
    <FunctionExperiment
      config={config}
      attempt={attempt && !("template" in attempt) ? attempt : undefined}
      onCheck={onCheck}
      {...props}
    />
  ) : (
    <ExpressionLab
      config={config}
      attempt={attempt && "template" in attempt ? attempt : undefined}
      onCheck={onCheck}
      {...props}
    />
  );
}
