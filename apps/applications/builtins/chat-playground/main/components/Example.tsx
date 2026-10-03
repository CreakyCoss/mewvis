import { useId, useState, type ReactNode } from "react";
import {
  Check,
  ChevronRight,
  Code2,
  Copy,
  type LucideIcon,
} from "lucide-react";
import { writeClipboardText } from "@mewvis/app-sdk/browser";

export const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export function Feedback({
  error,
  message,
}: {
  error?: string;
  message?: string;
}) {
  return (
    <>
      {error && (
        <p className="showcase-feedback is-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="showcase-feedback" role="status">
          <Check aria-hidden="true" />
          {message}
        </p>
      )}
    </>
  );
}

export function CodeExample({
  code,
  title = "查看接入代码",
  open = false,
}: {
  code: string;
  title?: string;
  open?: boolean;
}) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const copy = async () => {
    setMessage("");
    setError("");
    try {
      await writeClipboardText(code);
      setMessage("已复制代码");
    } catch (error) {
      setError(errorText(error));
    }
  };
  return (
    <details className="showcase-code" open={open || undefined}>
      <summary>
        <Code2 aria-hidden="true" />
        {title}
        <ChevronRight className="showcase-disclosure" aria-hidden="true" />
      </summary>
      <div className="showcase-code-body">
        <button
          type="button"
          className="showcase-copy"
          onClick={() => void copy()}
        >
          <Copy aria-hidden="true" />
          复制代码
        </button>
        <pre>
          <code>{code}</code>
        </pre>
        <Feedback error={error} message={message} />
      </div>
    </details>
  );
}

export function PageHeading({
  title,
  description,
  eyebrow,
}: {
  title: string;
  description: string;
  eyebrow?: string;
}) {
  return (
    <header className="showcase-heading">
      {eyebrow && <p className="showcase-eyebrow">{eyebrow}</p>}
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  );
}

export function ExampleRow({
  icon: Icon,
  title,
  description,
  tag,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  tag?: string;
  onClick(): void;
}) {
  return (
    <button type="button" className="showcase-example-row" onClick={onClick}>
      <span className="showcase-example-icon">
        <Icon aria-hidden="true" />
      </span>
      <span className="showcase-example-copy">
        <strong>{title}</strong>
        <span>{description}</span>
      </span>
      {tag && <span className="showcase-row-tag">{tag}</span>}
      <ChevronRight aria-hidden="true" />
    </button>
  );
}

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className="showcase-section" aria-labelledby={id}>
      <div className="showcase-section-heading">
        <h2 id={id}>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {children}
    </section>
  );
}
