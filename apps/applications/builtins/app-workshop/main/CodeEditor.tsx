import { useRef } from "react";

function highlighted(source: string) {
  return source
    .split(
      /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\/\/[^\n]*|\b(?:import|from|export|default|function|const|let|return|if|else|async|await|new|true|false|null|useState|useEffect)\b|\b\d+\b)/g,
    )
    .map((part, index) => {
      const kind = /^['"]/.test(part)
        ? "string"
        : part.startsWith("//")
          ? "comment"
          : /^\d+$/.test(part)
            ? "number"
            : /^(?:import|from|export|default|function|const|let|return|if|else|async|await|new|true|false|null|useState|useEffect)$/.test(
                  part,
                )
              ? "keyword"
              : "plain";
      return (
        <span className={`wk-code-${kind}`} key={index}>
          {part}
        </span>
      );
    });
}
export function CodeEditor({
  value,
  path,
  onChange,
  save,
  build,
  disabled,
}: {
  value: string;
  path: string;
  onChange(value: string): void;
  save(): void;
  build(): void;
  disabled: boolean;
}) {
  const text = useRef<HTMLTextAreaElement>(null);
  const highlight = useRef<HTMLPreElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const sync = () => {
    const input = text.current!;
    if (highlight.current)
      highlight.current.style.transform = `translate(${-input.scrollLeft}px, ${-input.scrollTop}px)`;
    if (gutter.current)
      gutter.current.style.transform = `translateY(${-input.scrollTop}px)`;
  };
  return (
    <div className="wk-code-editor">
      <div className="wk-line-gutter" aria-hidden="true">
        <div ref={gutter}>
          {value.split("\n").map((_, index) => (
            <div key={index}>{index + 1}</div>
          ))}
        </div>
      </div>
      <div className="wk-code-input-area">
        <div className="wk-highlight-viewport" aria-hidden="true">
          <pre ref={highlight}>
            {highlighted(value)}
            {"\n"}
          </pre>
        </div>
        <textarea
          ref={text}
          aria-label={`编辑 ${path}`}
          aria-description="Tab 插入缩进，Shift+Tab 离开编辑器；⌘或 Ctrl+S 保存源码，⌘或 Ctrl+Enter 构建。"
          value={value}
          disabled={disabled}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          wrap="off"
          onScroll={sync}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (
              (event.metaKey || event.ctrlKey) &&
              event.key.toLowerCase() === "s"
            ) {
              event.preventDefault();
              save();
            }
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              build();
            }
            if (
              event.key === "Tab" &&
              !event.shiftKey &&
              !event.altKey &&
              !event.ctrlKey
            ) {
              event.preventDefault();
              const input = event.currentTarget;
              const start = input.selectionStart;
              onChange(
                value.slice(0, start) + "  " + value.slice(input.selectionEnd),
              );
              requestAnimationFrame(() => {
                text.current?.setSelectionRange(start + 2, start + 2);
              });
            }
          }}
        />
      </div>
    </div>
  );
}
