import {
  NativeSelect,
  NativeSelectOption,
} from "design-system/components/ui/native-select";
import { FlaskConical } from "lucide-react";
import { useMemo, useState } from "react";
import type { Project } from "../../app/projects/model";
import { amount } from "../../shared/turn/EffectsEditor";
import type { PlaytestConfig } from "../playtest/config";
import type { Experiment } from "../records/records";
import {
  experimentTotal,
  MAX_COMPARISON_SAMPLES,
  parameterOptions,
  type ParameterOption,
} from "./comparison";
import {
  prepareComparison,
  ruleSources,
  type ComparisonRequest,
} from "./comparison-project";
export function ComparisonBuilder({
  project,
  config,
  disabled,
  start,
}: {
  project: Project;
  config: PlaytestConfig;
  disabled: boolean;
  start(experiment: Experiment): void;
}) {
  const [mode, setMode] = useState<ComparisonRequest["mode"]>("versions");
  const [baseline, setBaseline] = useState(
      project.versions.at(-1)?.id ?? "draft",
    ),
    [candidate, setCandidate] = useState("draft");
  const sources = ruleSources(project),
    base = sources.find((s) => s.id === baseline);
  const options = base ? parameterOptions(base.model) : [];
  const [key, setKey] = useState(options[0]?.key ?? ""),
    [from, setFrom] = useState(options[0]?.value ?? 1),
    [to, setTo] = useState(
      Math.min(options[0]?.max ?? 100, (options[0]?.value ?? 1) + 2),
    ),
    [step, setStep] = useState(1);
  const option = options.find((p) => p.key === key);
  const chooseParameter = (p: ParameterOption | undefined) => {
    setKey(p?.key ?? "");
    setFrom(p?.value ?? 1);
    setTo(Math.min(p?.max ?? 100, (p?.value ?? 1) + 2));
    setStep(1);
  };
  const prepared = useMemo(() => {
    try {
      if (mode === "parameter" && !option)
        throw new Error("请选择有效的数值参数。");
      const experiment = prepareComparison(project, config, {
        mode,
        baseline,
        candidate,
        ...(mode === "parameter"
          ? { scan: { parameter: option!.ref, from, to, step } }
          : {}),
      });
      return { experiment, error: "" };
    } catch (cause) {
      return {
        experiment: null,
        error: cause instanceof Error ? cause.message : String(cause),
      };
    }
  }, [project, config, mode, baseline, candidate, key, from, to, step]);
  return (
    <details className="comparison-builder settings-section" open>
      <summary>版本与参数对照</summary>
      <div className="view-toggle comparison-modes" aria-label="规则对照方式">
        <button
          className={mode === "versions" ? "active" : ""}
          aria-pressed={mode === "versions"}
          onClick={() => setMode("versions")}
        >
          版本对照
        </button>
        <button
          className={mode === "parameter" ? "active" : ""}
          aria-pressed={mode === "parameter"}
          onClick={() => setMode("parameter")}
        >
          单参数扫描
        </button>
      </div>
      <div className="rule-grid">
        <label className="form-field">
          基准规则
          <NativeSelect
            aria-label="基准规则"
            value={baseline}
            onChange={(event) => {
              setBaseline(event.target.value);
              chooseParameter(
                parameterOptions(
                  sources.find((s) => s.id === event.target.value)!.model,
                )[0],
              );
            }}
            size="sm"
          >
            {!base && (
              <NativeSelectOption value={baseline}>
                来源已不存在
              </NativeSelectOption>
            )}
            {sources.map((s) => (
              <NativeSelectOption key={s.id} value={s.id}>
                {s.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        {mode === "versions" ? (
          <label className="form-field">
            候选规则
            <NativeSelect
              aria-label="候选规则"
              value={candidate}
              onChange={(event) => setCandidate(event.target.value)}
              size="sm"
            >
              {!sources.some((s) => s.id === candidate) && (
                <NativeSelectOption value={candidate}>
                  来源已不存在
                </NativeSelectOption>
              )}
              {sources.map((s) => (
                <NativeSelectOption key={s.id} value={s.id}>
                  {s.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
        ) : (
          <label className="form-field">
            扫描参数
            <NativeSelect
              aria-label="扫描参数"
              value={key}
              onChange={(event) =>
                chooseParameter(
                  options.find((p) => p.key === event.target.value),
                )
              }
              size="sm"
            >
              {!option && (
                <NativeSelectOption value="">请选择参数</NativeSelectOption>
              )}
              {options.map((p) => (
                <NativeSelectOption key={p.key} value={p.key}>
                  {p.label} · 当前 {p.value}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
        )}
      </div>
      {mode === "parameter" && (
        <div className="rule-grid">
          <label className="form-field">
            扫描起点
            <input
              aria-label="扫描起点"
              type="number"
              min={option?.min ?? 0}
              max={option?.max ?? 1000000}
              value={from}
              onChange={(e) =>
                setFrom(
                  amount(
                    e.target.value,
                    option?.min ?? 0,
                    option?.max ?? 1000000,
                  ),
                )
              }
            />
          </label>
          <label className="form-field">
            扫描终点
            <input
              aria-label="扫描终点"
              type="number"
              min={option?.min ?? 0}
              max={option?.max ?? 1000000}
              value={to}
              onChange={(e) =>
                setTo(
                  amount(
                    e.target.value,
                    option?.min ?? 0,
                    option?.max ?? 1000000,
                  ),
                )
              }
            />
          </label>
          <label className="form-field">
            扫描步长
            <input
              aria-label="扫描步长"
              type="number"
              min="1"
              max="1000000"
              value={step}
              onChange={(e) => setStep(amount(e.target.value, 1))}
            />
          </label>
        </div>
      )}
      <p className="hint">
        使用“验证设置”中选择的场景、对照策略和种子范围。各组锁定基准解析后的开局数值与能力；卡池和流程按各自规则执行。模型状态与能力标识需要一致。
      </p>
      {mode === "versions" && !project.versions.length && (
        <p className="hint">
          到“版本”保存一份规则，再修改草稿，即可比较修改前后。
        </p>
      )}
      {prepared.error && (
        <p className="form-error" role="alert">
          {prepared.error}
        </p>
      )}
      {prepared.experiment && (
        <p className="comparison-plan" role="status">
          场景 {prepared.experiment.setup!.scenario.name} ·{" "}
          {prepared.experiment.comparison!.variants.length} 组规则 ×{" "}
          {prepared.experiment.policies.length} 种策略 ×{" "}
          {prepared.experiment.count} 个种子 ={" "}
          {experimentTotal(prepared.experiment)} 局
          {mode === "parameter" && (
            <>
              {" "}
              · 比较数值{" "}
              {prepared.experiment
                .comparison!.variants.map(
                  (v) => `${v.value}${v.id === "baseline" ? "（基准）" : ""}`,
                )
                .join("、")}
            </>
          )}
        </p>
      )}
      <div className="settings-actions">
        <button
          className="button primary"
          disabled={disabled || !prepared.experiment}
          onClick={() => prepared.experiment && start(prepared.experiment)}
        >
          <FlaskConical size={16} />
          {mode === "versions" ? "运行版本对照" : "运行参数扫描"}
        </button>
        <span className="hint">
          单次上限 {MAX_COMPARISON_SAMPLES} 局，可取消并保留已完成样本。
        </span>
      </div>
    </details>
  );
}
