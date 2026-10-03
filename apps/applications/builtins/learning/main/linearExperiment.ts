export type Parameter = {
  min: number;
  max: number;
  step: number;
  initial: number;
};
export type FunctionExperimentConfig = {
  template: "linear-function";
  task: string;
  parameters: { k: Parameter; b: Parameter };
  target: { x: number; y: number; tolerance: number };
  hint: string;
  successMessage: string;
};
export type LinearExperimentAttempt = {
  k: number;
  b: number;
  checkedAt: number;
};
export const defaultExperiment = (): FunctionExperimentConfig => ({
  template: "linear-function",
  task: "让直线经过点 (2, 5)",
  parameters: {
    k: { min: -3, max: 3, step: 0.1, initial: 1 },
    b: { min: -3, max: 3, step: 0.1, initial: 1 },
  },
  target: { x: 2, y: 5, tolerance: 0.05 },
  hint: "先固定一个参数，再调整另一个。想一想：当 x = 2 时，2k + b 应该等于多少？",
  successMessage: "做到了！试着固定另一个参数，找一组不同的解。",
});
function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label}格式无效`);
  return value as Record<string, unknown>;
}
function string(
  value: unknown,
  label: string,
  max: number,
  optional = false,
): string {
  if (optional && (value === undefined || value === "")) return "";
  if (
    typeof value !== "string" ||
    (!optional && !value.trim()) ||
    value.length > max
  )
    throw new Error(`${label}需为 ${optional ? 0 : 1}–${max} 个字符`);
  return value.trim();
}
function number(
  value: unknown,
  label: string,
  min: number,
  max: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    throw new Error(`${label}须在 ${min} 到 ${max} 之间`);
  return value;
}
export function onParameterGrid(value: number, parameter: Parameter): boolean {
  const steps = (value - parameter.min) / parameter.step;
  return (
    Number.isFinite(value) &&
    value >= parameter.min - 1e-8 &&
    value <= parameter.max + 1e-8 &&
    Math.abs(steps - Math.round(steps)) < 1e-6
  );
}
export const rounded = (value: number) => Number(value.toFixed(6));
export function snapParameter(value: number, p: Parameter): number {
  return rounded(
    Math.min(
      p.max,
      Math.max(p.min, p.min + Math.round((value - p.min) / p.step) * p.step),
    ),
  );
}
export function checkExperiment(
  config: FunctionExperimentConfig,
  values: { k: number; b: number },
) {
  if (
    !onParameterGrid(values.k, config.parameters.k) ||
    !onParameterGrid(values.b, config.parameters.b)
  )
    throw new Error("实验参数超出范围或不符合步长");
  const actual = rounded(values.k * config.target.x + values.b);
  const distance = Math.abs(actual - config.target.y);
  return {
    actual,
    distance: rounded(distance),
    passed: distance <= config.target.tolerance + 1e-8,
  };
}
export function validateLinearExperiment(
  value: unknown,
): FunctionExperimentConfig {
  const row = record(value, "实验");
  if (row.template !== "linear-function")
    throw new Error("仅支持函数图像实验模板");
  const parameters = record(row.parameters, "实验参数");
  const parameter = (key: "k" | "b"): Parameter => {
    const p = record(parameters[key], `参数 ${key}`);
    const result = {
      min: number(p.min, `${key} 最小值`, -100, 100),
      max: number(p.max, `${key} 最大值`, -100, 100),
      step: number(p.step, `${key} 步长`, 0.01, 100),
      initial: number(p.initial, `${key} 初始值`, -100, 100),
    };
    if (
      Object.values(result).some(
        (value) => Math.abs(value - rounded(value)) > 1e-9,
      )
    )
      throw new Error(`${key} 参数最多支持 6 位小数`);
    if (
      result.min >= result.max ||
      (result.max - result.min) / result.step > 2000 ||
      !onParameterGrid(result.max, result)
    )
      throw new Error(`${key} 范围须递增、可被步长整除，且最多 2,000 步`);
    if (!onParameterGrid(result.initial, result))
      throw new Error(`${key} 初始值须在范围内并符合步长`);
    return result;
  };
  const target = record(row.target, "检查目标");
  const config: FunctionExperimentConfig = {
    template: "linear-function",
    task: string(row.task, "实验任务", 500),
    parameters: { k: parameter("k"), b: parameter("b") },
    target: {
      x: number(target.x, "目标 x", -100, 100),
      y: number(target.y, "目标 y", -100, 100),
      tolerance: number(target.tolerance, "允许误差", 0.001, 1),
    },
    hint: string(row.hint, "实验提示", 1000, true),
    successMessage: string(row.successMessage, "成功反馈", 500, true),
  };
  // Enumerate one slider's bounded grid; select the closest reachable value on the other.
  const k = config.parameters.k;
  for (let i = 0; i <= Math.round((k.max - k.min) / k.step); i++) {
    const slope = rounded(k.min + i * k.step);
    const intercept = snapParameter(
      config.target.y - slope * config.target.x,
      config.parameters.b,
    );
    if (checkExperiment(config, { k: slope, b: intercept }).passed)
      return config;
  }
  throw new Error("在当前参数范围和步长下无法完成任务，请调整目标或参数");
}
export function restoreLinearExperimentAttempt(
  config: FunctionExperimentConfig,
  value: unknown,
): LinearExperimentAttempt | undefined {
  try {
    const row = record(value, "实验记录");
    const attempt = {
      k: number(row.k, "k", -100, 100),
      b: number(row.b, "b", -100, 100),
      checkedAt: number(row.checkedAt, "检查时间", 0, Number.MAX_SAFE_INTEGER),
    };
    checkExperiment(config, attempt);
    return attempt;
  } catch {
    return undefined;
  }
}
