import katex from "katex";
import { outputFormula, type ExperimentConfig } from "./experiments";

export type DiagramNode = { label: string; description: string };
export type ContentBlock = { id: string } & (
  | { type: "text"; text: string }
  | {
      type: "formula";
      latex: string;
      caption: string;
      experimentOutput?: string;
      symbols?: { symbol: string; meaning: string; unit: string }[];
      steps?: { latex: string; explanation: string }[];
    }
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
export function renderFormula(latex: string, displayMode = true): string {
  return katex.renderToString(latex, {
    output: "mathml",
    displayMode,
    throwOnError: true,
    trust: false,
    strict: "error",
    maxExpand: 200,
    maxSize: 10,
  });
}
export function formulaLatex(
  block: Extract<ContentBlock, { type: "formula" }>,
  experiment?: ExperimentConfig,
) {
  if (!block.experimentOutput) return block.latex;
  if (!experiment)
    throw new Error("公式关联的实验未启用，请启用实验或将公式改为独立公式");
  return outputFormula(experiment, block.experimentOutput);
}
export function validateBlocks(
  value: unknown,
  experiment?: ExperimentConfig,
): ContentBlock[] {
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
        const experimentOutput =
          row.experimentOutput === undefined
            ? undefined
            : string(row.experimentOutput, "关联结果", 24);
        const latex = experimentOutput
          ? formulaLatex(
              { id, type: "formula", latex: "", caption: "", experimentOutput },
              experiment,
            )
          : string(row.latex, "公式", 1500);
        try {
          renderFormula(latex);
        } catch {
          throw new Error(
            `第 ${index + 1} 个内容块的公式无效，请检查 LaTeX 表达式`,
          );
        }
        const entries = (value: unknown, label: string) => {
          if (!Array.isArray(value) || value.length > 8)
            throw new Error(`${label}最多 8 项`);
          return value.map((entry) => record(entry, label));
        };
        const math = (value: unknown, label: string, max: number) => {
          const latex = string(value, label, max);
          try {
            renderFormula(latex);
          } catch {
            throw new Error(`${label}的 LaTeX 格式无效`);
          }
          return latex;
        };
        return {
          id,
          type: "formula",
          latex,
          caption: string(row.caption, "公式说明", 500, true),
          ...(experimentOutput ? { experimentOutput } : {}),
          ...(row.symbols === undefined
            ? {}
            : {
                symbols: entries(row.symbols, "符号说明").map((symbol) => ({
                  symbol: math(symbol.symbol, "符号", 80),
                  meaning: string(symbol.meaning, "符号含义", 200),
                  unit: string(symbol.unit, "符号单位", 30, true),
                })),
              }),
          ...(row.steps === undefined
            ? {}
            : {
                steps: entries(row.steps, "推导步骤").map((step) => ({
                  latex: math(step.latex, "步骤公式", 1000),
                  explanation: string(step.explanation, "步骤说明", 300),
                })),
              }),
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
export function blocksToText(
  blocks: ContentBlock[],
  experiment?: ExperimentConfig,
): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case "text":
          return block.text;
        case "formula": {
          let latex = block.latex;
          try {
            latex = formulaLatex(block, experiment);
          } catch {
            /* Invalid drafts remain editable; validation reports the missing source. */
          }
          return [
            latex,
            block.caption,
            ...(block.symbols ?? []).map(
              (symbol) =>
                `${symbol.symbol}：${symbol.meaning}${symbol.unit ? `（${symbol.unit}）` : ""}`,
            ),
            ...(block.steps ?? []).map(
              (step, index) =>
                `${index + 1}. ${step.latex}：${step.explanation}`,
            ),
          ]
            .filter(Boolean)
            .join("\n");
        }
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

export {
  defaultExperiment,
  checkExperiment,
  onParameterGrid,
  rounded,
  snapParameter,
} from "./linearExperiment";
export { validateExperiment, restoreExperimentAttempt } from "./experiments";
export type { ExperimentConfig, ExperimentAttempt } from "./experiments";
export type { FunctionExperimentConfig, Parameter } from "./linearExperiment";
