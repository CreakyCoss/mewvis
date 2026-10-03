import { useMemo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { ArrowDown, ArrowRight } from "lucide-react";
import {
  type ContentBlock,
  renderFormula,
  formulaLatex,
  type ExperimentConfig,
} from "./richContent";

export function Formula({
  latex,
  inline = false,
}: {
  latex: string;
  inline?: boolean;
}) {
  const rendered = useMemo(() => {
    try {
      return { html: renderFormula(latex, !inline), error: false };
    } catch {
      return { html: "", error: true };
    }
  }, [latex, inline]);
  if (inline)
    return rendered.error ? (
      <span className="learn-field-error" title="公式格式有误">
        {latex}
      </span>
    ) : (
      <span
        className="learn-inline-formula"
        dangerouslySetInnerHTML={{ __html: rendered.html }}
      />
    );
  return rendered.error ? (
    <p className="learn-field-error" role="status">
      公式格式有误，请检查 LaTeX 表达式。
    </p>
  ) : (
    <div
      className="learn-formula"
      dangerouslySetInnerHTML={{ __html: rendered.html }}
    />
  );
}
export function Prose({ text }: { text: string }) {
  return (
    <div className="learn-rich-prose">
      <Markdown
        remarkPlugins={[remarkGfm, remarkMath]}
        skipHtml
        disallowedElements={["img"]}
        components={{
          code: ({ className, children, node: _node, ...props }) =>
            className?.includes("math-inline") ||
            className?.includes("math-display") ? (
              <Formula
                latex={String(children).trim()}
                inline={className.includes("math-inline")}
              />
            ) : (
              <code className={className} {...props}>
                {children}
              </code>
            ),
          pre: ({ node, children }) => {
            const child = node?.children[0];
            return child?.type === "element" &&
              Array.isArray(child.properties?.className) &&
              child.properties.className.includes("math-display") ? (
              <>{children}</>
            ) : (
              <pre>{children}</pre>
            );
          },
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}
export function FormulaContent({
  block,
  experiment,
}: {
  block: Extract<ContentBlock, { type: "formula" }>;
  experiment?: ExperimentConfig;
}) {
  let latex: string;
  try {
    latex = formulaLatex(block, experiment);
  } catch (error) {
    return (
      <p className="learn-field-error" role="status">
        {error instanceof Error ? error.message : "公式来源无效"}
      </p>
    );
  }
  return (
    <>
      <Formula latex={latex} />
      {block.caption && <p className="learn-block-caption">{block.caption}</p>}
      {!!block.symbols?.length && (
        <dl className="learn-formula-symbols">
          {block.symbols.map((symbol, index) => (
            <div key={index}>
              <dt>
                <Formula latex={symbol.symbol} inline />
              </dt>
              <dd>
                {symbol.meaning}
                {symbol.unit && <small> · {symbol.unit}</small>}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {!!block.steps?.length && (
        <ol className="learn-formula-steps" aria-label="公式推导步骤">
          {block.steps.map((step, index) => (
            <li key={index}>
              <span>{index + 1}</span>
              <div>
                <Formula latex={step.latex} />
                <p>{step.explanation}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
export function Diagram({
  block,
}: {
  block: Extract<ContentBlock, { type: "diagram" }>;
}) {
  const Arrow = block.direction === "horizontal" ? ArrowRight : ArrowDown;
  return (
    <figure className="learn-diagram">
      <figcaption>{block.title}</figcaption>
      <ol className={`learn-diagram-nodes ${block.direction}`}>
        {block.nodes.map((node, index) => (
          <li key={index}>
            <div className="learn-diagram-node">
              <strong>{node.label || "节点"}</strong>
              {node.description && <small>{node.description}</small>}
            </div>
            {index < block.nodes.length - 1 && (
              <Arrow
                className="learn-diagram-arrow"
                size={22}
                aria-hidden="true"
              />
            )}
          </li>
        ))}
      </ol>
      {block.caption && <p className="learn-block-caption">{block.caption}</p>}
    </figure>
  );
}
export function RichLesson({
  blocks,
  experiment,
}: {
  blocks: ContentBlock[];
  experiment?: ExperimentConfig;
}) {
  return (
    <div className="learn-rich-lesson">
      {blocks.map((block) => (
        <section
          key={block.id}
          className={`learn-content-block is-${block.type}`}
        >
          {block.type === "text" ? (
            <Prose text={block.text} />
          ) : block.type === "formula" ? (
            <FormulaContent block={block} experiment={experiment} />
          ) : block.type === "diagram" ? (
            <Diagram block={block} />
          ) : block.type === "code" ? (
            <>
              <small className="learn-code-language">
                {block.language || "代码示例"}
              </small>
              <pre>
                <code>{block.code}</code>
              </pre>
            </>
          ) : (
            <aside className="learn-rich-callout">
              <strong>{block.title}</strong>
              <Prose text={block.text} />
            </aside>
          )}
        </section>
      ))}
    </div>
  );
}
