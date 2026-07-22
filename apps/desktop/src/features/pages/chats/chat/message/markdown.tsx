import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type MessageMarkdownProps = {
  content: string;
};

const MessageMarkdownComponent = ({ content }: MessageMarkdownProps) => (
  <div className="min-w-0 overflow-hidden break-words text-sm leading-6 [overflow-wrap:anywhere]">
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        a: ({ children, href }) => (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="break-words text-primary underline underline-offset-2 [overflow-wrap:anywhere]"
          >
            {children}
          </a>
        ),
        ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
        ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
        li: ({ children }) => <li className="pl-1">{children}</li>,
        blockquote: ({ children }) => (
          <blockquote className="mb-2 border-l-2 border-border pl-3 text-muted-foreground last:mb-0">
            {children}
          </blockquote>
        ),
        code: ({ children, className }) => {
          const value = String(children);
          const isBlock = Boolean(className) || value.includes("\n");

          if (isBlock) {
            return <code className={`font-mono text-xs ${className ?? ""}`}>{children}</code>;
          }

          return (
            <code className="break-words rounded-sm border border-border/60 bg-muted/60 px-1 py-0.5 font-mono text-[0.88em] text-foreground [overflow-wrap:anywhere]">
              {children}
            </code>
          );
        },
        pre: ({ children }) => (
          <pre className="mb-2 min-w-0 max-w-full overflow-x-auto rounded-md border border-border/80 bg-muted/45 px-3 py-2.5 shadow-xs last:mb-0">
            {children}
          </pre>
        ),
        table: ({ children }) => (
          <div className="mb-2 min-w-0 max-w-full overflow-x-auto last:mb-0">
            <table className="w-full border-collapse text-left text-xs">{children}</table>
          </div>
        ),
        th: ({ children }) => <th className="border border-border bg-muted/60 px-2 py-1 font-medium">{children}</th>,
        td: ({ children }) => <td className="border border-border px-2 py-1 align-top">{children}</td>,
        h1: ({ children }) => <h1 className="mb-2 text-lg font-semibold last:mb-0">{children}</h1>,
        h2: ({ children }) => <h2 className="mb-2 text-base font-semibold last:mb-0">{children}</h2>,
        h3: ({ children }) => <h3 className="mb-2 text-sm font-semibold last:mb-0">{children}</h3>,
        h4: ({ children }) => <h4 className="mb-2 text-sm font-medium last:mb-0">{children}</h4>,
        hr: () => <hr className="my-3 border-border" />,
        img: ({ alt, src }) => (
          <img src={src} alt={alt ?? ""} loading="lazy" className="my-2 h-auto max-w-full rounded-md" />
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  </div>
);

export const MessageMarkdown = memo(MessageMarkdownComponent);
