import { Ajv } from "ajv";
import { Input } from "design-system/components/ui/input";
import { Textarea } from "design-system/components/ui/textarea";
import type { ExtensionSchema } from "@/api/extensions";

export type FieldDraft = Record<string, string>;
const raw = "$json";
// Open-ended or composed schemas need a JSON editor so saving never drops unknown keys.
const formFields = (schema: ExtensionSchema) =>
  schema.additionalProperties === false &&
  !["$ref", "allOf", "anyOf", "oneOf", "if", "patternProperties"].some((key) => key in schema)
    ? schema.properties
    : undefined;
export function schemaDraft(schema: ExtensionSchema, values: Record<string, unknown> = {}): FieldDraft {
  const fields = formFields(schema);
  if (!fields) return { [raw]: JSON.stringify(values, null, 2) };
  return Object.fromEntries(
    Object.entries(fields).map(([key, field]) => {
      const value = Object.prototype.hasOwnProperty.call(values, key) ? values[key] : field.default;
      return [key, value === undefined ? "" : field.type === "string" ? String(value) : JSON.stringify(value)];
    }),
  );
}
export function schemaValues(schema: ExtensionSchema, draft: FieldDraft): Record<string, unknown> {
  let value: Record<string, unknown>;
  const fields = formFields(schema);
  if (!fields) value = JSON.parse(draft[raw] || "{}");
  else {
    value = Object.fromEntries(
      Object.entries(fields).flatMap(([key, field]) => {
        const input = draft[key] ?? "";
        if (input === "" && !schema.required?.includes(key)) return [];
        try {
          return [[key, field.type === "string" ? input : JSON.parse(input)]];
        } catch {
          throw new Error(`请填写有效的${field.title ?? key}`);
        }
      }),
    );
  }
  const validate = new Ajv({ allErrors: true, strict: false }).compile(schema);
  if (!validate(value)) {
    const error = validate.errors?.[0];
    const key = String(error?.params.missingProperty ?? error?.instancePath.split("/").pop() ?? "");
    throw new Error(`${schema.properties?.[key]?.title ?? (key || "参数")}：${error?.message ?? "填写内容不符合要求"}`);
  }
  return value;
}
export function SchemaFields({
  schema,
  draft,
  onChange,
  disabled = false,
}: {
  schema: ExtensionSchema;
  draft: FieldDraft;
  onChange: (draft: FieldDraft) => void;
  disabled?: boolean;
}) {
  const fields = formFields(schema);
  if (!fields)
    return (
      <label className="grid gap-2 text-sm">
        参数（JSON 对象）
        <Textarea
          aria-label="参数 JSON"
          className="min-h-32 font-mono"
          value={draft[raw] ?? "{}"}
          disabled={disabled}
          onChange={(event) => onChange({ [raw]: event.target.value })}
        />
      </label>
    );
  if (!Object.keys(fields).length) return <p className="text-sm text-muted-foreground">无需填写参数。</p>;
  return (
    <div className="space-y-4">
      {Object.entries(fields).map(([key, field]) => {
        const label = field.title ?? key;
        const required = schema.required?.includes(key);
        const set = (value: string) => onChange({ ...draft, [key]: value });
        const choices = field.enum ?? (field.type === "boolean" ? [true, false] : undefined);
        return (
          <label key={key} className="grid gap-1.5 text-sm">
            <span>
              {label}
              {required ? <span className="ml-1 text-destructive">*</span> : null}
            </span>
            {choices ? (
              <select
                aria-label={label}
                disabled={disabled}
                required={required}
                value={draft[key] ?? ""}
                className="h-9 rounded-md border border-input bg-background px-3"
                onChange={(e) => set(e.target.value)}
              >
                <option value="">请选择</option>
                {choices.map((choice) => (
                  <option
                    key={JSON.stringify(choice)}
                    value={field.type === "string" ? String(choice) : JSON.stringify(choice)}
                  >
                    {choice === true ? "是" : choice === false ? "否" : String(choice)}
                  </option>
                ))}
              </select>
            ) : ["string", "number", "integer"].includes(field.type ?? "") ? (
              <Input
                aria-label={label}
                disabled={disabled}
                required={required}
                value={draft[key] ?? ""}
                type={field.type === "string" ? "text" : "number"}
                step={field.type === "integer" ? 1 : "any"}
                onChange={(e) => set(e.target.value)}
              />
            ) : (
              <Textarea
                aria-label={label}
                disabled={disabled}
                required={required}
                className="font-mono"
                placeholder="JSON"
                value={draft[key] ?? ""}
                onChange={(e) => set(e.target.value)}
              />
            )}
            {field.description ? <span className="text-xs text-muted-foreground">{field.description}</span> : null}
          </label>
        );
      })}
    </div>
  );
}
