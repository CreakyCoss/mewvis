import { SelectField } from "./SelectField";
import { useRef } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  formulaLatex,
  type ContentBlock,
  type ExperimentConfig,
} from "./richContent";
import { FormulaContent } from "./RichLesson";
type FormulaBlock = Extract<ContentBlock, { type: "formula" }>;
const structures = [
  ["分式", String.raw`\frac{a}{b}`],
  ["根式", String.raw`\sqrt{x}`],
  ["幂", "x^{2}"],
  ["求和", String.raw`\sum_{i=1}^{n} a_i`],
  ["积分", String.raw`\int_{a}^{b} f(x)\,dx`],
  ["矩阵", String.raw`\begin{pmatrix} a & b \\ c & d \end{pmatrix}`],
] as const;
export function FormulaEditor({
  block,
  experiment,
  onChange,
}: {
  block: FormulaBlock;
  experiment?: ExperimentConfig;
  onChange: (block: FormulaBlock) => void;
}) {
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const outputs =
    experiment?.template === "expression"
      ? experiment.outputs
      : experiment
        ? [{ id: "y", label: "函数值" }]
        : [];
  let latex = block.latex;
  try {
    latex = formulaLatex(block, experiment);
  } catch {
    /* The preview explains an invalid link. */
  }
  const insert = (snippet: string) => {
    const field = sourceRef.current;
    const start = field?.selectionStart ?? block.latex.length,
      end = field?.selectionEnd ?? start;
    onChange({
      ...block,
      latex: block.latex.slice(0, start) + snippet + block.latex.slice(end),
    });
    requestAnimationFrame(() => {
      field?.focus();
      field?.setSelectionRange(start, start + snippet.length);
    });
  };
  return (
    <div className="learn-formula-editor">
      <label>
        公式来源
        <SelectField
          value={block.experimentOutput ?? ""}
          onChange={(event) => {
            if (!event.target.value) {
              const { experimentOutput, ...independent } = block;
              onChange({ ...independent, latex });
            } else {
              const linked = { ...block, experimentOutput: event.target.value };
              try {
                linked.latex = formulaLatex(linked, experiment);
              } catch {}
              onChange(linked);
            }
          }}
        >
          <option value="">独立公式</option>
          {outputs.map((output, index) => (
            <option key={index} value={output.id}>
              同步实验 · {output.label}（{output.id}）
            </option>
          ))}
          {block.experimentOutput &&
            !outputs.some((output) => output.id === block.experimentOutput) && (
              <option value={block.experimentOutput}>关联结果已移除</option>
            )}
        </SelectField>
      </label>
      {!block.experimentOutput && (
        <div className="learn-formula-tools" aria-label="插入公式结构">
          {structures.map(([label, source]) => (
            <button
              type="button"
              className="learn-button compact"
              key={label}
              onClick={() => insert(source)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <label>
        {block.experimentOutput ? "来自实验的公式" : "公式表达式 · LaTeX"}
        <textarea
          ref={sourceRef}
          aria-label="公式表达式"
          className="learn-formula-source"
          rows={5}
          maxLength={1500}
          readOnly={!!block.experimentOutput}
          value={latex}
          placeholder={String.raw`例如：\frac{a}{b}，x^{2}，\int_0^1 x\,dx`}
          onChange={(event) =>
            onChange({ ...block, latex: event.target.value })
          }
        />
      </label>
      {block.experimentOutput && (
        <p className="learn-muted">
          在「动手实验」修改表达式，这里的公式会同步更新。
        </p>
      )}
      <label>
        公式说明（可选）
        <input
          maxLength={500}
          value={block.caption}
          onChange={(event) =>
            onChange({ ...block, caption: event.target.value })
          }
        />
      </label>
      <details className="learn-formula-details">
        <summary>符号说明 · {block.symbols?.length ?? 0}</summary>
        {(block.symbols ?? []).map((symbol, index) => (
          <div className="learn-symbol-edit" key={index}>
            <label>
              符号
              <input
                aria-label={`符号 ${index + 1}`}
                maxLength={80}
                value={symbol.symbol}
                onChange={(event) =>
                  onChange({
                    ...block,
                    symbols: block.symbols!.map((entry, i) =>
                      i === index
                        ? { ...entry, symbol: event.target.value }
                        : entry,
                    ),
                  })
                }
              />
            </label>
            <label>
              含义
              <input
                aria-label={`符号 ${index + 1} 含义`}
                maxLength={200}
                value={symbol.meaning}
                onChange={(event) =>
                  onChange({
                    ...block,
                    symbols: block.symbols!.map((entry, i) =>
                      i === index
                        ? { ...entry, meaning: event.target.value }
                        : entry,
                    ),
                  })
                }
              />
            </label>
            <label>
              单位
              <input
                aria-label={`符号 ${index + 1} 单位`}
                maxLength={30}
                value={symbol.unit}
                onChange={(event) =>
                  onChange({
                    ...block,
                    symbols: block.symbols!.map((entry, i) =>
                      i === index
                        ? { ...entry, unit: event.target.value }
                        : entry,
                    ),
                  })
                }
              />
            </label>
            <button
              type="button"
              className="learn-button compact"
              aria-label={`删除符号 ${index + 1}`}
              onClick={() =>
                onChange({
                  ...block,
                  symbols: block.symbols!.filter((_, i) => i !== index),
                })
              }
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="learn-button compact"
          disabled={(block.symbols?.length ?? 0) >= 8}
          onClick={() =>
            onChange({
              ...block,
              symbols: [
                ...(block.symbols ?? []),
                { symbol: "x", meaning: "", unit: "" },
              ],
            })
          }
        >
          <Plus size={14} />
          添加符号说明
        </button>
      </details>
      <details className="learn-formula-details">
        <summary>分步推导 · {block.steps?.length ?? 0}</summary>
        {(block.steps ?? []).map((step, index) => (
          <div className="learn-derivation-edit" key={index}>
            <div className="learn-block-toolbar">
              <strong>步骤 {index + 1}</strong>
              <button
                type="button"
                className="learn-button compact"
                aria-label={`删除推导步骤 ${index + 1}`}
                onClick={() =>
                  onChange({
                    ...block,
                    steps: block.steps!.filter((_, i) => i !== index),
                  })
                }
              >
                <Trash2 size={14} />
              </button>
            </div>
            <label>
              步骤公式
              <input
                aria-label={`步骤 ${index + 1} 公式`}
                maxLength={1000}
                value={step.latex}
                onChange={(event) =>
                  onChange({
                    ...block,
                    steps: block.steps!.map((entry, i) =>
                      i === index
                        ? { ...entry, latex: event.target.value }
                        : entry,
                    ),
                  })
                }
              />
            </label>
            <label>
              推导说明
              <input
                aria-label={`步骤 ${index + 1} 说明`}
                maxLength={300}
                value={step.explanation}
                onChange={(event) =>
                  onChange({
                    ...block,
                    steps: block.steps!.map((entry, i) =>
                      i === index
                        ? { ...entry, explanation: event.target.value }
                        : entry,
                    ),
                  })
                }
              />
            </label>
          </div>
        ))}
        <button
          type="button"
          className="learn-button compact"
          disabled={(block.steps?.length ?? 0) >= 8}
          onClick={() =>
            onChange({
              ...block,
              steps: [...(block.steps ?? []), { latex, explanation: "" }],
            })
          }
        >
          <Plus size={14} />
          添加推导步骤
        </button>
      </details>
      <div className="learn-formula-preview">
        <span className="learn-eyebrow">学生预览</span>
        <FormulaContent block={block} experiment={experiment} />
      </div>
    </div>
  );
}
