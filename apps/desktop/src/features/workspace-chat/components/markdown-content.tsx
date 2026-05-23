import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type MarkdownContentProps = {
  content: string;
  inverted?: boolean;
};

export const MarkdownContent = ({
  content,
  inverted = false,
}: MarkdownContentProps) => {
  return (
    <div className="min-w-0 text-sm leading-6">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => (
            <p className="mb-2 last:mb-0">{children}</p>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className={inverted ? "underline underline-offset-2" : "text-primary underline underline-offset-2"}
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
                  className={`rounded px-1 py-0.5 font-mono text-[0.88em] ${
                    inverted ? "bg-primary-foreground/15" : "bg-background"
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
              className={`mb-2 max-w-full overflow-x-auto rounded-md border px-3 py-2 last:mb-0 ${
                inverted
                  ? "border-primary-foreground/20 bg-primary-foreground/10"
                  : "border-border bg-background"
              }`}
            >
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="mb-2 max-w-full overflow-x-auto last:mb-0">
              <table className="w-full border-collapse text-left text-xs">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-border bg-background px-2 py-1 font-medium">
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
        {content}
      </ReactMarkdown>
    </div>
  );
};
