import { Play } from "lucide-react";
import { useState } from "react";
import { type Model } from "../../domains/turn/model";
import { allStrategies, selectedSetup, type PlaytestConfig } from "./config";
import { ScenarioEditor } from "./ScenarioEditor";
import { StrategyEditor } from "./StrategyEditor";
export function PlaytestEditor({
  model,
  config,
  change,
  status,
  error,
  reload,
  busy,
  runDisabled,
  run,
}: {
  model: Model;
  config: PlaytestConfig;
  change(change: (c: PlaytestConfig) => void): void;
  status: string;
  error: string;
  reload(): void;
  busy: boolean;
  runDisabled: boolean;
  run(): void;
}) {
  const [deleting, setDeleting] = useState("");
  const catalogue = allStrategies(config);
  let runError = "",
    experimentError = "";
  try {
    selectedSetup(config, model);
  } catch (e) {
    runError = (e as Error).message;
  }
  try {
    selectedSetup(config, model, true);
  } catch (e) {
    experimentError = (e as Error).message;
  }
  return (
    <section className="page-content playtest-page">
      <div className="page-heading">
        <div>
          <h1>策略与场景</h1>
          <p>保存初始条件，配置决策方式，再用相同场景比较策略。</p>
        </div>
        <div className="config-save">
          <span role="status">配置 · {status}</span>
          <button className="button" disabled={busy} onClick={reload}>
            重新加载配置
          </button>
        </div>
      </div>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <ScenarioEditor
        model={model}
        config={config}
        busy={busy}
        change={change}
        deleting={deleting}
        setDeleting={setDeleting}
      />
      <StrategyEditor
        model={model}
        config={config}
        busy={busy}
        change={change}
        deleting={deleting}
        setDeleting={setDeleting}
      />
      <section className="settings-section section-gap">
        <h2>实验对照</h2>
        <p className="hint">
          选择 1–4
          个策略，逐一用于场景中的第一位参与者。双人时，另一位参与者保持场景中指定的策略。各组使用相同的初始配置和种子范围。
        </p>
        <div className="compare-options">
          {catalogue.map((s) => (
            <label className="check-row" key={s.id}>
              <input
                type="checkbox"
                aria-label={`对照策略 ${s.name}`}
                checked={config.comparedStrategies.includes(s.id)}
                disabled={
                  !config.comparedStrategies.includes(s.id) &&
                  config.comparedStrategies.length >= 4
                }
                onChange={(e) =>
                  change((c) => {
                    c.comparedStrategies = e.target.checked
                      ? [...c.comparedStrategies, s.id]
                      : c.comparedStrategies.filter((id) => id !== s.id);
                  })
                }
              />
              {s.name || "未命名策略"}
            </label>
          ))}
        </div>
        {experimentError && (
          <p className="form-error">实验配置：{experimentError}</p>
        )}
        <p className="hint">
          实验在“实验记录”页启动，分别统计每位参与者及各目标的达成局数；固定先手顺序，结果包含位置影响。
        </p>
      </section>
      {runError && (
        <div className="form-error section-gap" role="alert">
          试运行配置：{runError}
        </div>
      )}
      <button
        className="button primary section-gap"
        disabled={busy || runDisabled || !!error || !!runError}
        onClick={run}
      >
        <Play size={16} />
        用此配置试运行
      </button>
    </section>
  );
}
