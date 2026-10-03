import { SelectField } from "./SelectField";
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ExpressionLab } from "./InteractiveExperiment";
import {
  createExperimentPreset,
  experimentPresets,
  type PresetId,
} from "./experimentPresets";
import {
  evaluateExperiment,
  initialValues,
  upgradeLinearExperiment,
  validateExperiment,
  validateExperimentPreview,
  type Challenge,
  type ExperimentConfig,
  type ExpressionExperiment,
  type Variable,
} from "./experiments";

const numberValue = (value: number) => (Number.isFinite(value) ? value : "");
function NumericField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        step="any"
        value={numberValue(value)}
        onChange={(event) => onChange(event.target.valueAsNumber)}
      />
    </label>
  );
}
export function ExperimentEditor({
  enabled,
  value,
  onToggle,
  onChange,
}: {
  enabled: boolean;
  value: ExperimentConfig;
  onToggle: (enabled: boolean) => void;
  onChange: (value: ExperimentConfig) => void;
}) {
  const [section, setSection] = useState<
    "model" | "variables" | "views" | "goal"
  >("model");
  const [preset, setPreset] = useState<PresetId>("quadratic");
  const model = useMemo(
    () =>
      value.template === "linear-function"
        ? upgradeLinearExperiment(value)
        : value,
    [value],
  );
  const validation = useMemo(() => {
    if (!enabled) return {};
    let preview: ExpressionExperiment | undefined,
      error = "";
    try {
      preview = validateExperimentPreview(model);
    } catch (e) {
      error = e instanceof Error ? e.message : "配置无效";
    }
    if (preview)
      try {
        validateExperiment(model);
      } catch (e) {
        error = e instanceof Error ? e.message : "配置无效";
      }
    return { preview, error };
  }, [model, enabled]);
  const change = (patch: Partial<ExpressionExperiment>) =>
    onChange({ ...model, ...patch });
  const changeVariable = (index: number, variable: Variable) =>
    change({
      variables: model.variables.map((item, i) =>
        i === index ? variable : item,
      ),
    });
  const numericVariables = model.variables.filter(
    (variable) =>
      variable.control === "number" || variable.control === "slider",
  );
  const nextId = (prefix: string) => {
    let i = 1;
    const used = new Set(
      [...model.variables, ...model.outputs].map((item) => item.id),
    );
    while (used.has(`${prefix}${i}`)) i++;
    return `${prefix}${i}`;
  };
  const goal = model.goal;
  const changeGoal = (patch: Partial<Challenge>) => {
    if (goal.mode !== "explore")
      change({ goal: { ...goal, ...patch } as Challenge });
  };
  const chooseMode = (mode: ExpressionExperiment["goal"]["mode"]) => {
    if (mode === "explore") {
      change({ goal: { mode } });
      return;
    }
    const reference = initialValues(model),
      output = model.outputs[0].id;
    let actual = 0;
    try {
      actual = evaluateExperiment(model, reference)[output];
    } catch {}
    if (mode === "target")
      change({
        goal: {
          mode,
          output,
          kind: "value",
          value: actual,
          min: actual - 1,
          max: actual + 1,
          tolerance: 0.01,
          reference,
        },
      });
    else
      change({
        goal: {
          mode,
          output,
          expression: model.outputs[0].expression.replace(
            /\b[A-Za-z][A-Za-z0-9_]*\b/g,
            (name) =>
              name !== model.axis.variable && Object.hasOwn(reference, name)
                ? `(${reference[name]})`
                : name,
          ),
          tolerance: 0.05,
          reference,
        },
      });
  };
  const previewKey = JSON.stringify({
    ...model,
    goal: goal.mode === "explore" ? goal : { ...goal, reference: undefined },
  });
  return (
    <div className="learn-experiment-editor">
      <label className="learn-enable-experiment">
        <span>
          <strong>为本课启用实验</strong>
          <small>让公式、参数和观察结果联系起来。</small>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={enabled}
          onChange={(event) => onToggle(event.target.checked)}
        />
      </label>
      {!enabled ? (
        <div className="learn-experiment-empty">
          <h3>选择一个起点，再按课程内容调整</h3>
          <p>
            支持数学、物理和数量关系。可编辑变量、计算公式、展示方式与教学任务。
          </p>
          <button
            type="button"
            className="learn-button primary"
            onClick={() => onToggle(true)}
          >
            添加互动实验
          </button>
        </div>
      ) : (
        <>
          <div
            className="learn-model-editor-tabs"
            role="tablist"
            aria-label="实验配置区域"
          >
            {(
              [
                ["model", "模型与公式"],
                ["variables", "输入变量"],
                ["views", "展示方式"],
                ["goal", "教学任务"],
              ] as const
            ).map(([id, title]) => (
              <button
                type="button"
                role="tab"
                aria-selected={section === id}
                key={id}
                onClick={() => setSection(id)}
              >
                {title}
              </button>
            ))}
          </div>
          <div className="learn-model-editor-layout">
            <div className="learn-model-settings">
              <div hidden={section !== "model"}>
                <div className="learn-preset-picker">
                  <label>
                    实验预设
                    <SelectField
                      value={preset}
                      onChange={(event) =>
                        setPreset(event.target.value as PresetId)
                      }
                    >
                      {experimentPresets.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.label} · {preset.description}
                        </option>
                      ))}
                    </SelectField>
                  </label>
                  <button
                    type="button"
                    className="learn-button compact"
                    onClick={() => onChange(createExperimentPreset(preset))}
                  >
                    应用预设
                  </button>
                </div>
                <p className="learn-muted">
                  应用预设会替换当前实验配置；也可以直接编辑下方公式。
                </p>
                <div className="learn-block-toolbar">
                  <h3>计算结果</h3>
                  <button
                    type="button"
                    className="learn-button compact"
                    disabled={model.outputs.length >= 3}
                    onClick={() =>
                      change({
                        outputs: [
                          ...model.outputs,
                          {
                            id: nextId("result"),
                            label: "新结果",
                            unit: "",
                            expression: model.outputs[0].id,
                          },
                        ],
                      })
                    }
                  >
                    <Plus size={14} />
                    添加结果
                  </button>
                </div>
                {model.outputs.map((output, index) => (
                  <section
                    className="learn-model-config-card"
                    key={index}
                    aria-label={`计算结果 ${index + 1}`}
                  >
                    <div className="learn-block-toolbar">
                      <strong>结果 {index + 1}</strong>
                      <button
                        type="button"
                        className="learn-button compact"
                        aria-label={`删除结果 ${index + 1}`}
                        disabled={model.outputs.length === 1}
                        onClick={() =>
                          change({
                            outputs: model.outputs.filter(
                              (_, i) => i !== index,
                            ),
                          })
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="learn-config-row">
                      {(
                        [
                          ["id", "结果标识"],
                          ["label", "显示名称"],
                          ["unit", "单位"],
                        ] as const
                      ).map(([field, label]) => (
                        <label key={field}>
                          {label}
                          <input
                            aria-label={`结果 ${index + 1} ${label}`}
                            maxLength={
                              field === "id" ? 24 : field === "unit" ? 30 : 60
                            }
                            value={output[field]}
                            onChange={(event) =>
                              change({
                                outputs: model.outputs.map((item, i) =>
                                  i === index
                                    ? { ...item, [field]: event.target.value }
                                    : item,
                                ),
                              })
                            }
                          />
                        </label>
                      ))}
                    </div>
                    <label>
                      计算表达式
                      <textarea
                        aria-label={`结果 ${index + 1} 表达式`}
                        rows={3}
                        maxLength={500}
                        value={output.expression}
                        placeholder="例如 a*x^2+b*x+c 或 U/R"
                        onChange={(event) =>
                          change({
                            outputs: model.outputs.map((item, i) =>
                              i === index
                                ? { ...item, expression: event.target.value }
                                : item,
                            ),
                          })
                        }
                      />
                    </label>
                  </section>
                ))}
                <details className="learn-expression-help">
                  <summary>表达式写法</summary>
                  <p>
                    乘法写 *，乘方写 ^。支持 + − * / ^、括号、pi、e，以及
                    sin、cos、tan、sqrt、abs、exp、log、log10、min、max、round
                    等函数。三角函数使用弧度。
                  </p>
                  <p>
                    表达式可以引用输入变量及其他结果，如 I = U/R，P =
                    U*I。标识使用英文字母；显示名称和单位可使用中文。
                  </p>
                </details>
              </div>
              <div hidden={section !== "variables"}>
                <div className="learn-block-toolbar">
                  <h3>输入变量 · {model.variables.length} / 6</h3>
                  <button
                    type="button"
                    className="learn-button compact"
                    disabled={model.variables.length >= 6}
                    onClick={() =>
                      change({
                        variables: [
                          ...model.variables,
                          {
                            id: nextId("p"),
                            label: "新变量",
                            unit: "",
                            control: "slider",
                            min: 0,
                            max: 10,
                            step: 0.1,
                            initial: 1,
                          },
                        ],
                      })
                    }
                  >
                    <Plus size={14} />
                    添加变量
                  </button>
                </div>
                {model.variables.map((variable, index) => (
                  <section
                    className="learn-model-config-card"
                    key={index}
                    aria-label={`输入变量 ${index + 1}`}
                  >
                    <div className="learn-block-toolbar">
                      <strong>
                        {variable.label || "新变量"} · {variable.id}
                      </strong>
                      <button
                        type="button"
                        className="learn-button compact"
                        aria-label={`删除变量 ${index + 1}`}
                        disabled={model.variables.length === 1}
                        onClick={() =>
                          change({
                            variables: model.variables.filter(
                              (_, i) => i !== index,
                            ),
                          })
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="learn-config-row">
                      {(
                        [
                          ["id", "变量标识"],
                          ["label", "显示名称"],
                          ["unit", "单位"],
                        ] as const
                      ).map(([field, label]) => (
                        <label key={field}>
                          {label}
                          <input
                            aria-label={`变量 ${index + 1} ${label}`}
                            maxLength={
                              field === "id" ? 24 : field === "unit" ? 30 : 60
                            }
                            value={variable[field]}
                            onChange={(event) =>
                              changeVariable(index, {
                                ...variable,
                                [field]: event.target.value,
                              })
                            }
                          />
                        </label>
                      ))}
                    </div>
                    <label>
                      控件
                      <SelectField
                        aria-label={`变量 ${index + 1} 控件`}
                        value={variable.control}
                        onChange={(event) => {
                          const control = event.target
                            .value as Variable["control"];
                          const base = {
                            id: variable.id,
                            label: variable.label,
                            unit: variable.unit,
                            initial: variable.initial,
                          };
                          changeVariable(
                            index,
                            control === "toggle"
                              ? { ...base, control, initial: 1 }
                              : control === "select"
                                ? {
                                    ...base,
                                    control,
                                    initial: 1,
                                    options: [
                                      { label: "选项一", value: 1 },
                                      { label: "选项二", value: 2 },
                                    ],
                                  }
                                : {
                                    ...base,
                                    control,
                                    min: 0,
                                    max: 10,
                                    step: 0.1,
                                    initial: 1,
                                    ...(variable.control === "slider" ||
                                    variable.control === "number"
                                      ? {
                                          min: variable.min,
                                          max: variable.max,
                                          step: variable.step,
                                          initial: variable.initial,
                                        }
                                      : {}),
                                  },
                          );
                        }}
                      >
                        <option value="slider">滑块</option>
                        <option value="number">数字输入</option>
                        <option value="select">下拉选项</option>
                        <option value="toggle">开关 · 0 / 1</option>
                      </SelectField>
                    </label>
                    {(variable.control === "slider" ||
                      variable.control === "number") && (
                      <div className="learn-config-row two">
                        {(
                          [
                            ["min", "最小值"],
                            ["max", "最大值"],
                            ["step", "步长"],
                            ["initial", "初始值"],
                          ] as const
                        ).map(([field, label]) => (
                          <NumericField
                            key={field}
                            label={`${variable.id} ${label}`}
                            value={variable[field]}
                            onChange={(number) =>
                              changeVariable(index, {
                                ...variable,
                                [field]: number,
                              })
                            }
                          />
                        ))}
                      </div>
                    )}
                    {variable.control === "toggle" && (
                      <label>
                        初始状态
                        <SelectField
                          value={variable.initial}
                          onChange={(event) =>
                            changeVariable(index, {
                              ...variable,
                              initial: Number(event.target.value),
                            })
                          }
                        >
                          <option value={1}>开启 · 1</option>
                          <option value={0}>关闭 · 0</option>
                        </SelectField>
                      </label>
                    )}
                    {variable.control === "select" && (
                      <>
                        <div className="learn-option-editor">
                          {variable.options.map((option, i) => (
                            <div className="learn-config-row" key={i}>
                              <label>
                                选项名称
                                <input
                                  aria-label={`${variable.id} 选项 ${i + 1} 名称`}
                                  maxLength={60}
                                  value={option.label}
                                  onChange={(event) =>
                                    changeVariable(index, {
                                      ...variable,
                                      options: variable.options.map(
                                        (item, j) =>
                                          i === j
                                            ? {
                                                ...item,
                                                label: event.target.value,
                                              }
                                            : item,
                                      ),
                                    })
                                  }
                                />
                              </label>
                              <NumericField
                                label={`${variable.id} 选项 ${i + 1} 数值`}
                                value={option.value}
                                onChange={(number) =>
                                  changeVariable(index, {
                                    ...variable,
                                    options: variable.options.map((item, j) =>
                                      i === j
                                        ? { ...item, value: number }
                                        : item,
                                    ),
                                  })
                                }
                              />
                              <button
                                type="button"
                                className="learn-button compact"
                                aria-label={`删除 ${variable.id} 选项 ${i + 1}`}
                                disabled={variable.options.length <= 2}
                                onClick={() =>
                                  changeVariable(index, {
                                    ...variable,
                                    options: variable.options.filter(
                                      (_, j) => i !== j,
                                    ),
                                  })
                                }
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                        <button
                          type="button"
                          className="learn-button compact"
                          disabled={variable.options.length >= 8}
                          onClick={() =>
                            changeVariable(index, {
                              ...variable,
                              options: [
                                ...variable.options,
                                {
                                  label: "新选项",
                                  value:
                                    Math.max(
                                      ...variable.options.map(
                                        (option) => option.value,
                                      ),
                                    ) + 1,
                                },
                              ],
                            })
                          }
                        >
                          添加选项
                        </button>
                        <label>
                          初始选项
                          <SelectField
                            value={variable.initial}
                            onChange={(event) =>
                              changeVariable(index, {
                                ...variable,
                                initial: Number(event.target.value),
                              })
                            }
                          >
                            {variable.options.map((option, i) => (
                              <option key={i} value={option.value}>
                                {option.label} · {option.value}
                              </option>
                            ))}
                          </SelectField>
                        </label>
                      </>
                    )}
                  </section>
                ))}
              </div>
              <div hidden={section !== "views"}>
                <h3>展示方式</h3>
                <p className="learn-muted">
                  可组合多种展示；不同单位的结果可切换曲线查看。
                </p>
                <div className="learn-view-options">
                  {(
                    [
                      ["values", "实时数值"],
                      ["graph", "变化曲线"],
                      ["table", "采样数据表"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key}>
                      <input
                        type="checkbox"
                        checked={model.views[key]}
                        onChange={(event) =>
                          change({
                            views: {
                              ...model.views,
                              [key]: event.target.checked,
                            },
                          })
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>
                {(model.views.graph ||
                  model.views.table ||
                  goal.mode === "curve") && (
                  <>
                    <label>
                      横轴变量
                      <SelectField
                        value={model.axis.variable}
                        onChange={(event) => {
                          const variable = numericVariables.find(
                            (variable) => variable.id === event.target.value,
                          );
                          if (
                            variable &&
                            (variable.control === "slider" ||
                              variable.control === "number")
                          )
                            change({
                              axis: {
                                ...model.axis,
                                variable: variable.id,
                                min: variable.min,
                                max: variable.max,
                              },
                            });
                        }}
                      >
                        {numericVariables.map((variable) => (
                          <option key={variable.id} value={variable.id}>
                            {variable.label}（{variable.id}）
                          </option>
                        ))}
                      </SelectField>
                    </label>
                    <div className="learn-config-row two">
                      <NumericField
                        label="横轴起点"
                        value={model.axis.min}
                        onChange={(min) =>
                          change({ axis: { ...model.axis, min } })
                        }
                      />
                      <NumericField
                        label="横轴终点"
                        value={model.axis.max}
                        onChange={(max) =>
                          change({ axis: { ...model.axis, max } })
                        }
                      />
                      <NumericField
                        label="曲线采样数"
                        value={model.axis.samples}
                        onChange={(samples) =>
                          change({ axis: { ...model.axis, samples } })
                        }
                      />
                    </div>
                    <p className="learn-muted">
                      采样数 11–161。未定义的位置会断开曲线，表格单独展示 11
                      个采样位置。
                    </p>
                  </>
                )}
              </div>
              <div hidden={section !== "goal"}>
                <label>
                  实验任务
                  <textarea
                    rows={3}
                    maxLength={500}
                    value={model.task}
                    onChange={(event) => change({ task: event.target.value })}
                  />
                </label>
                <label>
                  任务模式
                  <SelectField
                    value={goal.mode}
                    onChange={(event) =>
                      chooseMode(
                        event.target
                          .value as ExpressionExperiment["goal"]["mode"],
                      )
                    }
                  >
                    <option value="explore">自由探索 · 记录观察</option>
                    <option value="target">目标挑战 · 数值或区间</option>
                    <option value="curve">目标挑战 · 匹配曲线</option>
                  </SelectField>
                </label>
                {goal.mode === "explore" ? (
                  <p className="learn-muted">
                    学生调整参数并保存观察，比较不同尝试，不设通过或失败。
                  </p>
                ) : (
                  <>
                    <label>
                      检查结果
                      <SelectField
                        value={goal.output}
                        onChange={(event) =>
                          changeGoal({ output: event.target.value })
                        }
                      >
                        {model.outputs.map((output) => (
                          <option key={output.id} value={output.id}>
                            {output.label}（{output.id}）
                          </option>
                        ))}
                      </SelectField>
                    </label>
                    {goal.mode === "target" ? (
                      <>
                        <label>
                          检查规则
                          <SelectField
                            value={goal.kind}
                            onChange={(event) =>
                              changeGoal({
                                kind: event.target.value as "value" | "range",
                              })
                            }
                          >
                            <option value="value">达到指定数值</option>
                            <option value="range">落入指定区间</option>
                          </SelectField>
                        </label>
                        <div className="learn-config-row two">
                          {goal.kind === "value" ? (
                            <NumericField
                              label="目标值"
                              value={goal.value}
                              onChange={(value) => changeGoal({ value })}
                            />
                          ) : (
                            <>
                              <NumericField
                                label="目标下限"
                                value={goal.min}
                                onChange={(min) => changeGoal({ min })}
                              />
                              <NumericField
                                label="目标上限"
                                value={goal.max}
                                onChange={(max) => changeGoal({ max })}
                              />
                            </>
                          )}
                        </div>
                        <label>
                          固定检查位置
                          <SelectField
                            value={goal.at?.variable ?? ""}
                            onChange={(event) => {
                              const variable = numericVariables.find(
                                (variable) =>
                                  variable.id === event.target.value,
                              );
                              changeGoal({
                                at: variable
                                  ? {
                                      variable: variable.id,
                                      value: variable.initial,
                                    }
                                  : undefined,
                              });
                            }}
                          >
                            <option value="">使用学生当前参数</option>
                            {numericVariables.map((variable) => (
                              <option key={variable.id} value={variable.id}>
                                固定 {variable.label}（{variable.id}）
                              </option>
                            ))}
                          </SelectField>
                        </label>
                        {goal.at && (
                          <NumericField
                            label="检查位置"
                            value={goal.at.value}
                            onChange={(value) =>
                              changeGoal({ at: { ...goal.at!, value } })
                            }
                          />
                        )}
                      </>
                    ) : (
                      <label>
                        目标曲线表达式
                        <input
                          maxLength={500}
                          value={goal.expression}
                          onChange={(event) =>
                            changeGoal({ expression: event.target.value })
                          }
                        />
                        <small>
                          仅使用横轴变量 {model.axis.variable} 和数学常量。
                        </small>
                      </label>
                    )}
                    <NumericField
                      label="允许误差"
                      value={goal.tolerance}
                      onChange={(tolerance) => changeGoal({ tolerance })}
                    />
                    <details className="learn-reference-editor">
                      <summary>参考解 · 保存前验证任务可完成</summary>
                      <p className="learn-muted">
                        在学生预览中完成任务后，点击「用当前参数作参考解」，或在这里填写。
                      </p>
                      <div className="learn-config-row two">
                        {model.variables.map((variable) => (
                          <NumericField
                            key={variable.id}
                            label={`参考 ${variable.id}`}
                            value={goal.reference[variable.id]}
                            onChange={(number) =>
                              changeGoal({
                                reference: {
                                  ...goal.reference,
                                  [variable.id]: number,
                                },
                              })
                            }
                          />
                        ))}
                      </div>
                    </details>
                  </>
                )}
                <details className="learn-experiment-feedback">
                  <summary>提示与反馈</summary>
                  <label>
                    引导提示（可选）
                    <textarea
                      rows={3}
                      maxLength={1000}
                      value={model.hint}
                      onChange={(event) => change({ hint: event.target.value })}
                    />
                  </label>
                  {goal.mode !== "explore" && (
                    <label>
                      成功反馈（可选）
                      <textarea
                        rows={3}
                        maxLength={500}
                        value={model.successMessage}
                        onChange={(event) =>
                          change({ successMessage: event.target.value })
                        }
                      />
                    </label>
                  )}
                </details>
              </div>
              {validation.error ? (
                <p
                  className="learn-field-error learn-model-validation"
                  role="status"
                >
                  {validation.error}
                </p>
              ) : (
                <p className="learn-model-validation valid" role="status">
                  配置通过校验{goal.mode !== "explore" ? " · 参考解通过" : ""}
                </p>
              )}
            </div>
            <div className="learn-model-preview">
              <span className="learn-eyebrow">学生预览</span>
              {validation.preview ? (
                <ExpressionLab
                  key={previewKey}
                  config={validation.preview}
                  preview
                  onReference={(reference) => changeGoal({ reference })}
                />
              ) : (
                <p className="learn-muted">
                  完善配置后，这里会显示可操作的实验预览。
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
