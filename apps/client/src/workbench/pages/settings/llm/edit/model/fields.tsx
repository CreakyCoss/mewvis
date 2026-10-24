import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { JsonValue } from "@mewvis/chat-contracts";
import { Input } from "design-system/components/ui/input";
import { Textarea } from "design-system/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "design-system/components/ui/native-select";
import { Label } from "design-system/components/ui/label";

type Buffer = { raw: string; error: string };
const Buffers = createContext<{
  values: Record<string, Buffer>;
  set: (id: string, value: Buffer) => void;
  clear: (prefix: string, exact?: boolean) => void;
  removeRow: (prefix: string, index: number) => void;
}>(null!);

export function EditorBuffers({ children, onError }: { children: ReactNode; onError: (error: string) => void }) {
  const [values, setValues] = useState<Record<string, Buffer>>({});
  const error = Object.values(values).find((value) => value.error)?.error ?? "";
  useEffect(() => onError(error), [error, onError]);
  return (
    <Buffers.Provider
      value={{
        values,
        set: (id, value) => setValues((current) => ({ ...current, [id]: value })),
        clear: (prefix, exact = false) =>
          setValues((current) =>
            Object.fromEntries(
              Object.entries(current).filter(([id]) => (exact ? id !== prefix : !id.startsWith(prefix))),
            ),
          ),
        removeRow: (prefix, index) =>
          setValues((current) =>
            Object.fromEntries(
              Object.entries(current).flatMap(([id, value]) => {
                if (!id.startsWith(prefix)) return [[id, value]];
                const suffix = id.slice(prefix.length);
                if (suffix === "schema") return value.error ? [[id, value]] : [];
                if (!/^\d+$/.test(suffix)) return [[id, value]];
                const row = Number(suffix);
                return row === index ? [] : [[row > index ? `${prefix}${row - 1}` : id, value]];
              }),
            ),
          ),
      }}
    >
      {children}
    </Buffers.Provider>
  );
}
export const useEditorBuffers = () => useContext(Buffers);
export const pretty = (value: unknown) => JSON.stringify(value, null, 2) ?? "";

export function Field({
  label,
  children,
  hint,
  labelAction,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  labelAction?: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      {labelAction ? (
        <div className="flex items-center gap-2">
          <Label className="text-xs font-medium">{label}</Label>
          {labelAction}
        </div>
      ) : (
        <Label className="text-xs font-medium">{label}</Label>
      )}
      {children}
      {hint && <p className="text-[11px] leading-5 text-muted-foreground">{hint}</p>}
    </div>
  );
}
export function Choice<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
  label: string;
}) {
  return (
    <NativeSelect
      className="w-full [&_select]:text-xs"
      size="sm"
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value as T)}
    >
      {options.map((option) => (
        <NativeSelectOption key={option.value} value={option.value}>
          {option.label}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}
export function JsonField({
  id,
  label,
  value,
  onChange,
  rows = 8,
  objectOnly = false,
  optional = false,
  hint,
}: {
  id: string;
  label: string;
  value: unknown;
  onChange: (value: JsonValue | undefined) => void;
  rows?: number;
  objectOnly?: boolean;
  optional?: boolean;
  hint?: string;
}) {
  const buffers = useEditorBuffers();
  const buffer = buffers.values[id];
  const raw = buffer?.raw ?? pretty(value);
  const change = (raw: string) => {
    try {
      const parsed = optional && !raw.trim() ? undefined : (JSON.parse(raw) as JsonValue);
      if (objectOnly && parsed !== undefined && (!parsed || typeof parsed !== "object" || Array.isArray(parsed)))
        throw new Error();
      onChange(parsed);
      buffers.set(id, { raw, error: "" });
    } catch {
      buffers.set(id, { raw, error: `${label}请填写${objectOnly ? " JSON 对象" : "有效 JSON"}` });
    }
  };
  return (
    <Field label={label} hint={hint}>
      <Textarea
        id={id}
        aria-label={label}
        spellCheck={false}
        rows={rows}
        className="min-h-0 resize-y rounded-lg bg-muted/15 font-mono text-xs leading-6 shadow-none"
        value={raw}
        aria-invalid={!!buffer?.error}
        onChange={(event) => change(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.stopPropagation();
        }}
      />
      {buffer?.error && (
        <p className="text-[11px] text-destructive" role="alert">
          {buffer.error}
        </p>
      )}
    </Field>
  );
}
export function ParameterValue({
  id,
  value,
  type,
  onChange,
  label,
}: {
  id: string;
  value: JsonValue | undefined;
  type: string;
  onChange: (value: JsonValue | undefined) => void;
  label: string;
}) {
  const buffers = useEditorBuffers();
  const raw =
    buffers.values[id]?.raw ??
    (type === "string" ? String(value ?? "") : value === undefined ? "" : JSON.stringify(value));
  return (
    <Input
      aria-label={label}
      className="h-8 min-w-0 px-2 font-mono text-xs shadow-none"
      placeholder={type === "string" ? "默认值" : "JSON 值"}
      value={raw}
      aria-invalid={!!buffers.values[id]?.error}
      onChange={(event) => {
        const next = event.currentTarget.value;
        try {
          onChange(type === "string" ? next : !next.trim() ? undefined : JSON.parse(next));
          buffers.set(id, { raw: next, error: "" });
        } catch {
          buffers.set(id, { raw: next, error: `${label}必须是有效 JSON` });
        }
      }}
    />
  );
}
