import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getMarkdownInputContent } from "./message";
import type { MarkdownContentProps } from "./types";

const paragraphClassName = "mb-2 last:mb-0";

type MarkdownAstNode = {
  children?: MarkdownAstNode[];
  tagName?: string;
  type?: string;
  value?: string;
};

const normalizeSeparatedEmphasisBlocks = (content: string) =>
  content
    .replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, "$1\n\n*$2*\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const isMeaningfulAstNode = (node: MarkdownAstNode) =>
  node.type !== "text" || Boolean(node.value?.trim());

const isEmphasisAstNode = (node: MarkdownAstNode) =>
  node.type === "element" && node.tagName === "em";

const isEmphasisOnlyParagraph = (node: MarkdownAstNode | undefined) => {
  const meaningfulChildren = node?.children?.filter(isMeaningfulAstNode) ?? [];

  return (
    meaningfulChildren.length === 1 &&
    isEmphasisAstNode(meaningfulChildren[0])
  );
};

const getParagraphClassName = (isDescriptionBlock: boolean) =>
  isDescriptionBlock
    ? `${paragraphClassName} tavern-immersive-description-block`
    : paragraphClassName;

const MarkdownContentComponent = (props: MarkdownContentProps) => {
  const {
    className,
    emClassName,
    inverted = false,
    separateEmphasisBlocks = false,
    variant = "chat",
  } = props;
  const content = getMarkdownInputContent(props);
  const renderedContent = separateEmphasisBlocks
    ? normalizeSeparatedEmphasisBlocks(content)
    : content;

  return (
    <div
      className={`min-w-0 overflow-hidden break-words text-sm leading-6 [overflow-wrap:anywhere] ${className ?? ""}`}
      data-markdown-variant={variant}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children, node }) => (
            <p
              className={getParagraphClassName(
                separateEmphasisBlocks &&
                isEmphasisOnlyParagraph(node as MarkdownAstNode | undefined),
              )}
            >
              {children}
            </p>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className={inverted
                ? "break-words underline underline-offset-2 [overflow-wrap:anywhere]"
                : "break-words text-primary underline underline-offset-2 [overflow-wrap:anywhere]"}
            >
              {children}
            </a>
          ),
          ul: ({ children }) => (
            <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="pl-1">{children}</li>
          ),
          em: ({ children }) => (
            <em className={emClassName}>{children}</em>
          ),
          blockquote: ({ children }) => (
            <blockquote
              className={`mb-2 border-l-2 pl-3 last:mb-0 ${
                inverted ? "border-primary-foreground/50" : "border-border text-muted-foreground"
              }`}
            >
              {children}
            </blockquote>
          ),
          code: ({ children, className }) => {
            const isBlock = Boolean(className);

            if (!isBlock) {
              return (
                <code
                  className={`break-words rounded-sm border px-1 py-0.5 font-mono text-[0.88em] [overflow-wrap:anywhere] ${
                    inverted
                      ? "border-primary-foreground/20 bg-primary-foreground/15"
                      : "border-border/60 bg-muted/60 text-foreground"
                  }`}
                >
                  {children}
                </code>
              );
            }

            return (
              <code className={`font-mono text-xs ${className ?? ""}`}>
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre
              className={`mb-2 min-w-0 max-w-full overflow-x-auto rounded-md border px-3 py-2.5 shadow-xs last:mb-0 ${
                inverted
                  ? "border-primary-foreground/20 bg-primary-foreground/10"
                  : "border-border/80 bg-muted/45"
              }`}
            >
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="mb-2 min-w-0 max-w-full overflow-x-auto last:mb-0">
              <table className="w-full border-collapse text-left text-xs">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-border bg-muted/60 px-2 py-1 font-medium">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-border px-2 py-1 align-top">
              {children}
            </td>
          ),
          h1: ({ children }) => (
            <h1 className="mb-2 text-lg font-semibold last:mb-0">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2 text-base font-semibold last:mb-0">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-2 text-sm font-semibold last:mb-0">{children}</h3>
          ),
          hr: () => (
            <hr className={inverted ? "my-3 border-primary-foreground/25" : "my-3 border-border"} />
          ),
        }}
      >
        {renderedContent}
      </ReactMarkdown>
    </div>
  );
};

export const MarkdownContent = memo(MarkdownContentComponent);
