import { useMemo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowDown, ArrowRight } from "lucide-react";
import { type ContentBlock, renderFormula } from "./richContent";

export function Formula({ latex }: { latex: string }) {
  const rendered = useMemo(() => {
    try {
      return { html: renderFormula(latex), error: false };
    } catch {
      return { html: "", error: true };
    }
  }, [latex]);
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
        remarkPlugins={[remarkGfm]}
        skipHtml
        disallowedElements={["img"]}
        components={{
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
export function RichLesson({ blocks }: { blocks: ContentBlock[] }) {
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
            <>
              <Formula latex={block.latex} />
              {block.caption && (
                <p className="learn-block-caption">{block.caption}</p>
              )}
            </>
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
