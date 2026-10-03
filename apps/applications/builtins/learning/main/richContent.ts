import katex from "katex";

export type DiagramNode = { label: string; description: string };
export type ContentBlock = { id: string } & (
  | { type: "text"; text: string }
  | { type: "formula"; latex: string; caption: string }
  | {
      type: "diagram";
      title: string;
      direction: "horizontal" | "vertical";
      nodes: DiagramNode[];
      caption: string;
    }
  | { type: "code"; code: string; language: string }
  | { type: "callout"; title: string; text: string }
);
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
export type ExperimentAttempt = { k: number; b: number; checkedAt: number };
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
/** Only KaTeX-produced MathML is rendered. User HTML and trusted TeX extensions are disabled. */
export function renderFormula(latex: string): string {
  return katex.renderToString(latex, {
    output: "mathml",
    displayMode: true,
    throwOnError: true,
    trust: false,
    strict: "error",
    maxExpand: 200,
    maxSize: 10,
  });
}
export function validateBlocks(value: unknown): ContentBlock[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20)
    throw new Error("教学内容需包含 1–20 个内容块");
  const ids = new Set<string>();
  const rows = value.map((entry, index) =>
    record(entry, `第 ${index + 1} 个内容块`),
  );
  const reserved = new Set(rows.map((row) => row.id));
  return rows.map((row, index): ContentBlock => {
    let id =
      row.id === undefined
        ? `block-${index + 1}`
        : string(row.id, "内容块 ID", 80);
    if (row.id === undefined) {
      let suffix = 1;
      while (reserved.has(id) || ids.has(id))
        id = `block-${index + 1}-${suffix++}`;
    }
    if (!/^[a-zA-Z0-9-]+$/.test(id) || ids.has(id))
      throw new Error("内容块 ID 无效或重复");
    ids.add(id);
    switch (row.type) {
      case "text":
        return { id, type: "text", text: string(row.text, "正文", 8000) };
      case "formula": {
        const latex = string(row.latex, "公式", 1500);
        try {
          renderFormula(latex);
        } catch {
          throw new Error(
            `第 ${index + 1} 个内容块的公式无效，请检查 LaTeX 表达式`,
          );
        }
        return {
          id,
          type: "formula",
          latex,
          caption: string(row.caption, "公式说明", 500, true),
        };
      }
      case "diagram": {
        if (row.direction !== "horizontal" && row.direction !== "vertical")
          throw new Error("图解方向无效");
        if (
          !Array.isArray(row.nodes) ||
          row.nodes.length < 2 ||
          row.nodes.length > 8
        )
          throw new Error("流程图需包含 2–8 个节点");
        return {
          id,
          type: "diagram",
          title: string(row.title, "图解标题", 120),
          direction: row.direction,
          nodes: row.nodes.map((entry) => {
            const node = record(entry, "图解节点");
            return {
              label: string(node.label, "节点文字", 80),
              description: string(node.description, "节点说明", 160, true),
            };
          }),
          caption: string(row.caption, "图解说明", 500, true),
        };
      }
      case "code":
        return {
          id,
          type: "code",
          code: string(row.code, "代码示例", 4000),
          language: string(row.language, "代码语言", 40, true),
        };
      case "callout":
        return {
          id,
          type: "callout",
          title: string(row.title, "提示标题", 80),
          text: string(row.text, "提示内容", 2000),
        };
      default:
        throw new Error("不支持的内容块类型");
    }
  });
}
export function blocksToText(blocks: ContentBlock[]): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case "text":
          return block.text;
        case "formula":
          return [block.latex, block.caption].filter(Boolean).join("\n");
        case "diagram":
          return [
            block.title,
            block.nodes
              .map(
                (n) => n.label + (n.description ? `（${n.description}）` : ""),
              )
              .join(" → "),
            block.caption,
          ]
            .filter(Boolean)
            .join("\n");
        case "code":
          return block.code;
        case "callout":
          return `${block.title}\n${block.text}`;
      }
    })
    .join("\n\n");
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
export function validateExperiment(value: unknown): FunctionExperimentConfig {
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
export function restoreExperimentAttempt(
  config: FunctionExperimentConfig,
  value: unknown,
): ExperimentAttempt | undefined {
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
