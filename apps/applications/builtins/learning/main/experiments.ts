import {
  parseExpression,
  symbolLatex,
  formatNumber,
  validSymbol,
} from "./expression";
import {
  validateLinearExperiment,
  restoreLinearExperimentAttempt,
  checkExperiment,
  snapParameter,
  rounded,
  type FunctionExperimentConfig,
  type LinearExperimentAttempt,
} from "./linearExperiment";

export type Values = Record<string, number>;
type VariableBase = {
  id: string;
  label: string;
  unit: string;
  initial: number;
};
export type NumericVariable = VariableBase & {
  control: "slider" | "number";
  min: number;
  max: number;
  step: number;
};
export type Variable =
  | NumericVariable
  | (VariableBase & {
      control: "select";
      options: { label: string; value: number }[];
    })
  | (VariableBase & { control: "toggle" });
export type ModelOutput = {
  id: string;
  label: string;
  unit: string;
  expression: string;
};
export type Challenge =
  | {
      mode: "target";
      output: string;
      kind: "value" | "range";
      value: number;
      min: number;
      max: number;
      tolerance: number;
      at?: { variable: string; value: number };
      reference: Values;
    }
  | {
      mode: "curve";
      output: string;
      expression: string;
      tolerance: number;
      reference: Values;
    };
export type ExpressionExperiment = {
  template: "expression";
  version: 1;
  task: string;
  variables: Variable[];
  outputs: ModelOutput[];
  views: { values: boolean; graph: boolean; table: boolean };
  axis: { variable: string; min: number; max: number; samples: number };
  goal: { mode: "explore" } | Challenge;
  hint: string;
  successMessage: string;
};
export type ExperimentConfig = FunctionExperimentConfig | ExpressionExperiment;
export type Observation = { values: Values; checkedAt: number };
export type ExpressionAttempt = Observation & {
  template: "expression";
  history?: Observation[];
};
export type ExperimentAttempt = LinearExperimentAttempt | ExpressionAttempt;
const obj = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label}格式无效`);
  return value as Record<string, unknown>;
};
const text = (value: unknown, label: string, max: number, optional = false) => {
  if (optional && (value === undefined || value === "")) return "";
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new Error(`${label}需为 ${optional ? 0 : 1}–${max} 个字符`);
  return value.trim();
};
const num = (value: unknown, label: string, min = -1e9, max = 1e9) => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    throw new Error(`${label}须在 ${min} 到 ${max} 之间`);
  return value;
};
const list = (value: unknown, label: string, max: number) => {
  if (!Array.isArray(value) || value.length < 1 || value.length > max)
    throw new Error(`${label}需有 1–${max} 项`);
  return value as unknown[];
};
const identifier = (value: unknown, label: string) => {
  const name = text(value, label, 24);
  if (!validSymbol(name))
    throw new Error(`${label}请使用字母开头的英文标识，勿使用函数名或保留字`);
  return name;
};
export const initialValues = (config: ExpressionExperiment): Values =>
  Object.fromEntries(config.variables.map((v) => [v.id, v.initial]));
export function acceptsValue(variable: Variable, value: number) {
  if (!Number.isFinite(value)) return false;
  if (variable.control === "toggle") return value === 0 || value === 1;
  if (variable.control === "select")
    return variable.options.some((option) => option.value === value);
  const steps = (value - variable.min) / variable.step;
  const epsilon = Math.max(
    1e-7,
    Math.abs(value / variable.step) * Number.EPSILON * 8,
  );
  return (
    value >= variable.min - variable.step * epsilon &&
    value <= variable.max + variable.step * epsilon &&
    Math.abs(steps - Math.round(steps)) <= epsilon
  );
}
export function snapValue(variable: NumericVariable, value: number) {
  if (!Number.isFinite(value)) return variable.initial;
  return Number(
    Math.min(
      variable.max,
      Math.max(
        variable.min,
        variable.min +
          Math.round((value - variable.min) / variable.step) * variable.step,
      ),
    ).toPrecision(14),
  );
}
export function validateValues(
  config: ExpressionExperiment,
  value: unknown,
): Values {
  const row = obj(value, "参数值");
  const values: Values = {};
  for (const variable of config.variables) {
    const n = num(row[variable.id], variable.label);
    if (!acceptsValue(variable, n))
      throw new Error(`${variable.label}超出范围或不符合步长 / 选项`);
    values[variable.id] = n;
  }
  return values;
}
export function compileModel(config: ExpressionExperiment) {
  const inputs = new Set(config.variables.map((v) => v.id));
  const outputs = new Map(
    config.outputs.map((output) => [
      output.id,
      parseExpression(output.expression),
    ]),
  );
  const visiting = new Set<string>(),
    visited = new Set<string>(),
    order: string[] = [];
  const visit = (id: string) => {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new Error("计算结果之间存在循环引用");
    visiting.add(id);
    for (const symbol of outputs.get(id)!.symbols) {
      if (outputs.has(symbol)) visit(symbol);
      else if (!inputs.has(symbol))
        throw new Error(`未定义变量 ${symbol}，请添加变量或修改表达式`);
    }
    visiting.delete(id);
    visited.add(id);
    order.push(id);
  };
  for (const output of config.outputs) visit(output.id);
  return (values: Values) => {
    const scope = { ...values },
      result: Values = {};
    for (const id of order)
      result[id] = scope[id] = outputs.get(id)!.evaluate(scope);
    return result;
  };
}
export function evaluateExperiment(
  config: ExpressionExperiment,
  values: Values,
) {
  return compileModel(config)(validateValues(config, values));
}
export function outputFormula(config: ExperimentConfig, id: string) {
  if (config.template === "linear-function") {
    if (id !== "y") throw new Error("关联的实验结果已不存在");
    return "y = kx + b";
  }
  const output = config.outputs.find((output) => output.id === id);
  if (!output) throw new Error("关联的实验结果已不存在，请重新选择公式来源");
  return `${symbolLatex(output.id)} = ${parseExpression(output.expression).latex}`;
}
export type Sample = { x: number; outputs: Values | null; target?: number };
export function sampleExperiment(
  config: ExpressionExperiment,
  values: Values,
  count = config.axis.samples,
): Sample[] {
  const evaluate = compileModel(config);
  const target =
    config.goal.mode === "curve"
      ? parseExpression(config.goal.expression)
      : undefined;
  const size = Math.max(2, Math.min(161, Math.round(count)));
  return Array.from({ length: size }, (_, i) => {
    const x =
      config.axis.min + ((config.axis.max - config.axis.min) * i) / (size - 1);
    let outputs: Values | null = null,
      goal: number | undefined;
    try {
      outputs = evaluate({ ...values, [config.axis.variable]: x });
    } catch {
      /* Undefined intervals are gaps, never connected by a graph line. */
    }
    try {
      goal = target?.evaluate({ [config.axis.variable]: x });
    } catch {
      /* Shown as an undefined target. */
    }
    return { x, outputs, ...(goal === undefined ? {} : { target: goal }) };
  });
}
export type ExperimentResult = {
  passed: boolean | null;
  message: string;
  distance?: number;
};
export function checkModel(
  config: ExpressionExperiment,
  values: Values,
): ExperimentResult {
  const valid = validateValues(config, values);
  const goal = config.goal;
  if (goal.mode === "explore") {
    evaluateExperiment(config, valid);
    return {
      passed: null,
      message: "已记录本次观察。换一组参数，比较结果的变化。",
    };
  }
  if (goal.mode === "curve") {
    const samples = sampleExperiment(config, valid);
    if (
      samples.some(
        (sample) => sample.outputs === null || sample.target === undefined,
      )
    )
      return {
        passed: false,
        message: "比较范围内存在未定义的结果，请调整参数或范围。",
      };
    const distance = Math.max(
      ...samples.map((sample) =>
        Math.abs(sample.outputs![goal.output] - sample.target!),
      ),
    );
    return {
      passed: distance <= goal.tolerance + goal.tolerance * 1e-10,
      distance,
      message: `在 ${samples.length} 个采样点中，最大误差 ${formatNumber(distance)}；允许误差 ${formatNumber(goal.tolerance)}。`,
    };
  }
  const scope = goal.at
    ? { ...valid, [goal.at.variable]: goal.at.value }
    : valid;
  const actual = compileModel(config)(scope)[goal.output];
  const distance =
    goal.kind === "value"
      ? Math.abs(actual - goal.value)
      : Math.max(goal.min - actual, actual - goal.max, 0);
  const location = goal.at
    ? `${goal.at.variable} = ${formatNumber(goal.at.value)} 时，`
    : "";
  const outputLabel =
    config.outputs.find((output) => output.id === goal.output)?.label ??
    goal.output;
  return {
    passed: distance <= goal.tolerance + goal.tolerance * 1e-10,
    distance,
    message: `${location}${outputLabel} = ${formatNumber(actual)}；${goal.kind === "value" ? `目标 ${formatNumber(goal.value)}` : `目标区间 ${formatNumber(goal.min)}–${formatNumber(goal.max)}`}，误差 ${formatNumber(distance)}。`,
  };
}
function validateExpressionExperiment(
  value: unknown,
  reference = true,
): ExpressionExperiment {
  const row = obj(value, "实验");
  if (row.version !== 1) throw new Error("不支持的互动实验版本");
  const ids = new Set<string>();
  const unique = (id: string) => {
    if (ids.has(id)) throw new Error(`变量或结果标识 ${id} 重复`);
    ids.add(id);
    return id;
  };
  const variables = list(row.variables, "变量", 6).map((entry): Variable => {
    const v = obj(entry, "变量");
    const base = {
      id: unique(identifier(v.id, "变量标识")),
      label: text(v.label, "变量名称", 60),
      unit: text(v.unit, "单位", 30, true),
      initial: num(v.initial, "初始值"),
    };
    let variable: Variable;
    if (v.control === "toggle") variable = { ...base, control: "toggle" };
    else if (v.control === "select") {
      const options = list(v.options, "选项", 8).map((entry) => {
        const option = obj(entry, "选项");
        return {
          label: text(option.label, "选项名称", 60),
          value: num(option.value, "选项值"),
        };
      });
      if (
        options.length < 2 ||
        new Set(options.map((option) => option.value)).size !== options.length
      )
        throw new Error("下拉选项需至少两项，数值不能重复");
      variable = { ...base, control: "select", options };
    } else if (v.control === "slider" || v.control === "number") {
      const min = num(v.min, "最小值"),
        max = num(v.max, "最大值"),
        step = num(v.step, "步长", 1e-9, 1e9);
      const steps = (max - min) / step;
      if (
        min >= max ||
        min + step === min ||
        (v.control === "slider" && steps > 10000) ||
        Math.abs(steps - Math.round(steps)) >
          Math.max(1e-6, steps * Number.EPSILON * 8)
      )
        throw new Error(
          `${base.label}范围须递增、可被步长整除，滑块最多 10,000 步`,
        );
      variable = { ...base, control: v.control, min, max, step };
    } else throw new Error("不支持的变量控件");
    if (!acceptsValue(variable, base.initial))
      throw new Error(`${base.label}初始值不符合范围、步长或选项`);
    return variable;
  });
  const outputs = list(row.outputs, "计算结果", 3).map((entry) => {
    const output = obj(entry, "计算结果");
    return {
      id: unique(identifier(output.id, "结果标识")),
      label: text(output.label, "结果名称", 60),
      unit: text(output.unit, "单位", 30, true),
      expression: text(output.expression, "表达式", 500),
    };
  });
  const view = obj(row.views, "展示方式");
  if (
    [view.values, view.graph, view.table].some(
      (value) => typeof value !== "boolean",
    ) ||
    !(view.values || view.graph || view.table)
  )
    throw new Error("请选择至少一种展示方式");
  const rawAxis = obj(row.axis, "横轴");
  const axis = {
    variable: text(rawAxis.variable, "横轴变量", 24),
    min: num(rawAxis.min, "横轴起点"),
    max: num(rawAxis.max, "横轴终点"),
    samples: num(rawAxis.samples, "采样数", 11, 161),
  };
  if (axis.min >= axis.max || !Number.isInteger(axis.samples))
    throw new Error("横轴范围须递增，采样数须为 11–161 的整数");
  const g = obj(row.goal, "教学任务");
  const output = () => {
    const id = text(g.output, "目标结果", 24);
    if (!outputs.some((output) => output.id === id))
      throw new Error("请选择有效的目标结果");
    return id;
  };
  let goal: ExpressionExperiment["goal"];
  if (g.mode === "explore") goal = { mode: "explore" };
  else if (g.mode === "target") {
    if (g.kind !== "value" && g.kind !== "range")
      throw new Error("目标类型无效");
    const at = g.at === undefined ? undefined : obj(g.at, "固定检查位置");
    goal = {
      mode: "target",
      output: output(),
      kind: g.kind,
      value: num(g.value, "目标值"),
      min: num(g.min, "目标下限"),
      max: num(g.max, "目标上限"),
      tolerance: num(g.tolerance, "允许误差", 1e-9, 1e9),
      reference: obj(g.reference, "参考参数") as Values,
      ...(at
        ? {
            at: {
              variable: text(at.variable, "检查变量", 24),
              value: num(at.value, "检查位置"),
            },
          }
        : {}),
    };
    if (goal.kind === "range" && goal.min > goal.max)
      throw new Error("目标区间下限不能大于上限");
    if (goal.at) {
      const fixed = goal.at;
      const variable = variables.find(
        (variable) => variable.id === fixed.variable,
      );
      if (
        !variable ||
        (variable.control !== "slider" && variable.control !== "number") ||
        goal.at.value < variable.min ||
        goal.at.value > variable.max
      )
        throw new Error("固定检查位置需在数值变量范围内");
    }
  } else if (g.mode === "curve")
    goal = {
      mode: "curve",
      output: output(),
      expression: text(g.expression, "目标曲线", 500),
      tolerance: num(g.tolerance, "允许误差", 1e-9, 1e9),
      reference: obj(g.reference, "参考参数") as Values,
    };
  else throw new Error("请选择自由探索或目标挑战");
  if (view.graph || view.table || goal.mode === "curve") {
    const variable = variables.find(
      (variable) => variable.id === axis.variable,
    );
    if (
      !variable ||
      (variable.control !== "slider" && variable.control !== "number") ||
      axis.min < variable.min ||
      axis.max > variable.max
    )
      throw new Error("横轴须选择数值变量，且采样范围在变量范围内");
  }
  const config: ExpressionExperiment = {
    template: "expression",
    version: 1,
    task: text(row.task, "实验任务", 500),
    variables,
    outputs,
    views: {
      values: view.values as boolean,
      graph: view.graph as boolean,
      table: view.table as boolean,
    },
    axis,
    goal,
    hint: text(row.hint, "实验提示", 1000, true),
    successMessage: text(row.successMessage, "成功反馈", 500, true),
  };
  evaluateExperiment(config, initialValues(config));
  if (goal.mode === "curve") {
    if (
      parseExpression(goal.expression).symbols.some(
        (symbol) => symbol !== axis.variable,
      )
    )
      throw new Error("目标曲线只能使用横轴变量和数学常量");
    if (
      sampleExperiment(config, initialValues(config)).some(
        (sample) => sample.target === undefined,
      )
    )
      throw new Error("目标曲线在采样范围内存在未定义点");
  }
  if (goal.mode !== "explore") {
    if (reference) {
      goal.reference = validateValues(config, goal.reference);
      if (!checkModel(config, goal.reference).passed)
        throw new Error("参考参数尚未通过目标检查，请在预览中调整后设为参考解");
    } else {
      try {
        goal.reference = validateValues(config, goal.reference);
      } catch {
        goal.reference = initialValues(config);
      }
    }
  }
  return config;
}
export function validateExperiment(value: unknown): ExperimentConfig {
  const row = obj(value, "实验");
  if (row.template === "linear-function")
    return validateLinearExperiment(value);
  if (row.template === "expression") return validateExpressionExperiment(value);
  throw new Error("不支持的实验模板");
}
/** Author preview relaxes only the reference-answer check; publication always uses validateExperiment. */
export const validateExperimentPreview = (value: ExpressionExperiment) =>
  validateExpressionExperiment(value, false);
export function restoreExperimentAttempt(
  config: ExperimentConfig,
  value: unknown,
): ExperimentAttempt | undefined {
  if (config.template === "linear-function")
    return restoreLinearExperimentAttempt(config, value);
  try {
    const row = obj(value, "实验记录");
    if (row.template !== "expression") return undefined;
    const observation = (value: unknown): Observation => {
      const item = obj(value, "观察记录");
      const values = validateValues(config, item.values);
      evaluateExperiment(config, values);
      return {
        values,
        checkedAt: num(item.checkedAt, "检查时间", 0, Number.MAX_SAFE_INTEGER),
      };
    };
    const latest = observation(row);
    const history: Observation[] = [];
    if (Array.isArray(row.history))
      for (const item of row.history.slice(-8)) {
        try {
          history.push(observation(item));
        } catch {
          /* Old invalid observations do not erase the valid latest attempt. */
        }
      }
    return {
      template: "expression",
      ...latest,
      ...(history.length ? { history } : {}),
    };
  } catch {
    return undefined;
  }
}
export function nextObservation(
  values: Values,
  previous?: ExpressionAttempt,
): ExpressionAttempt {
  const latest = { values: { ...values }, checkedAt: Date.now() };
  const history = [
    ...(previous?.history ??
      (previous
        ? [{ values: previous.values, checkedAt: previous.checkedAt }]
        : [])),
    latest,
  ].slice(-8);
  return { template: "expression", ...latest, history };
}
export function upgradeLinearExperiment(
  config: FunctionExperimentConfig,
): ExpressionExperiment {
  const variables: Variable[] = (["k", "b"] as const).map((id) => ({
    id,
    label: id === "k" ? "斜率" : "截距",
    unit: "",
    control: "slider",
    ...config.parameters[id],
  }));
  const min = Math.floor(Math.min(-5, config.target.x - 2)),
    max = Math.ceil(Math.max(5, config.target.x + 2));
  // The observation control uses a discrete grid; the challenge keeps the
  // original target coordinate, including legacy coordinates such as 1 / 3.
  const observationX = rounded(config.target.x);
  variables.push({
    id: "x",
    label: "观察位置",
    unit: "",
    control: "number",
    min,
    max,
    step: 0.000001,
    initial: observationX,
  });
  let reference: Values = {
    k: config.parameters.k.initial,
    b: config.parameters.b.initial,
    x: observationX,
  };
  for (
    let i = 0;
    i <=
    Math.round(
      (config.parameters.k.max - config.parameters.k.min) /
        config.parameters.k.step,
    );
    i++
  ) {
    const k = rounded(config.parameters.k.min + i * config.parameters.k.step),
      b = snapParameter(
        config.target.y - k * config.target.x,
        config.parameters.b,
      );
    if (checkExperiment(config, { k, b }).passed) {
      reference = { k, b, x: observationX };
      break;
    }
  }
  return {
    template: "expression",
    version: 1,
    task: config.task,
    variables,
    outputs: [{ id: "y", label: "函数值", unit: "", expression: "k*x+b" }],
    views: { values: true, graph: true, table: false },
    axis: { variable: "x", min, max, samples: 81 },
    goal: {
      mode: "target",
      kind: "value",
      output: "y",
      value: config.target.y,
      min: 0,
      max: 1,
      tolerance: config.target.tolerance,
      at: { variable: "x", value: config.target.x },
      reference,
    },
    hint: config.hint,
    successMessage: config.successMessage,
  };
}
