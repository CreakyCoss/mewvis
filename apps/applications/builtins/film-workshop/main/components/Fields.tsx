import { cloneElement, isValidElement, useId, type ReactNode } from "react";
import { Clapperboard } from "lucide-react";

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="film-field">
      <label htmlFor={id}>{label}</label>
      {isValidElement<Record<string, unknown>>(children)
        ? cloneElement(children, {
            id,
            "aria-describedby": hint ? `${id}-hint` : undefined,
          })
        : children}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
export function EmptyState({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children?: ReactNode;
}) {
  return (
    <div className="film-empty">
      <Clapperboard size={32} aria-hidden />
      <h3>{title}</h3>
      <p>{text}</p>
      {children}
    </div>
  );
}
