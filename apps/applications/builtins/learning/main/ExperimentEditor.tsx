import {
  type FunctionExperimentConfig,
  type Parameter,
  validateExperiment,
} from "./richContent";
import { FunctionExperiment } from "./FunctionExperiment";

export function ExperimentEditor({
  enabled,
  value,
  onToggle,
  onChange,
}: {
  enabled: boolean;
  value: FunctionExperimentConfig;
  onToggle: (value: boolean) => void;
  onChange: (value: FunctionExperimentConfig) => void;
}) {
  let valid: FunctionExperimentConfig | undefined,
    error = "";
  try {
    if (enabled) valid = validateExperiment(value);
  } catch (e) {
    error = e instanceof Error ? e.message : "实验配置无效";
  }
  const numeric = (number: number) => (Number.isFinite(number) ? number : "");
  return (
    <div className="learn-experiment-editor">
      <label className="learn-enable-experiment">
        <span>
          <strong>为本课启用实验</strong>
          <small>通过调整参数，把公式和图像联系起来。</small>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
        />
      </label>
      {!enabled ? (
        <div className="learn-experiment-empty">
          <h3>让学生动手探索</h3>
          <p>
            选择函数图像模板，设置参数范围和任务目标，即可在本课中加入独立实验台。
          </p>
          <button
            type="button"
            className="learn-button primary"
            onClick={() => onToggle(true)}
          >
            添加函数图像实验
          </button>
        </div>
      ) : (
        <div className="learn-experiment-editor-grid">
          <div className="learn-experiment-settings">
            <label>
              实验模板
              <input readOnly value="函数图像 · y = kx + b" />
            </label>
            <h3>可调参数</h3>
            <div className="learn-parameter-table">
              <table>
                <thead>
                  <tr>
                    <th>参数</th>
                    {["最小值", "最大值", "步长", "初始值"].map((label) => (
                      <th key={label}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(["k", "b"] as const).map((key) => (
                    <tr key={key}>
                      <th>{key === "k" ? "斜率 k" : "截距 b"}</th>
                      {(
                        ["min", "max", "step", "initial"] as (keyof Parameter)[]
                      ).map((field, i) => (
                        <td key={field}>
                          <input
                            aria-label={`${key} ${["最小值", "最大值", "步长", "初始值"][i]}`}
                            type="number"
                            step="any"
                            value={numeric(value.parameters[key][field])}
                            onChange={(e) =>
                              onChange({
                                ...value,
                                parameters: {
                                  ...value.parameters,
                                  [key]: {
                                    ...value.parameters[key],
                                    [field]: e.target.valueAsNumber,
                                  },
                                },
                              })
                            }
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <label>
              实验任务
              <textarea
                rows={2}
                maxLength={500}
                value={value.task}
                onChange={(e) => onChange({ ...value, task: e.target.value })}
              />
            </label>
            <h3>检查规则 · 经过指定点</h3>
            <div className="learn-target-fields">
              {(["x", "y", "tolerance"] as const).map((field, i) => (
                <label key={field}>
                  {["目标 x", "目标 y", "允许误差"][i]}
                  <input
                    type="number"
                    step="any"
                    value={numeric(value.target[field])}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        target: {
                          ...value.target,
                          [field]: e.target.valueAsNumber,
                        },
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <details className="learn-experiment-feedback">
              <summary>提示与反馈</summary>
              <label>
                引导提示（可选）
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={value.hint}
                  onChange={(e) => onChange({ ...value, hint: e.target.value })}
                />
              </label>
              <label>
                成功反馈（可选）
                <textarea
                  rows={2}
                  maxLength={500}
                  value={value.successMessage}
                  onChange={(e) =>
                    onChange({ ...value, successMessage: e.target.value })
                  }
                />
              </label>
            </details>
          </div>
          <div className="learn-experiment-preview-pane">
            <span className="learn-eyebrow">学生预览</span>
            {valid ? (
              <FunctionExperiment
                key={JSON.stringify(valid)}
                config={valid}
                preview
              />
            ) : (
              <p className="learn-field-error" role="status">
                {error}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
