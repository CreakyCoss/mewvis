import {
  NativeSelect,
  NativeSelectOption,
} from "design-system/components/ui/native-select";
import { type StoryValue, type StoryVariable } from "../model";
export function ValueInput({
  type,
  value,
  change,
  label,
}: {
  type: StoryVariable["type"];
  value: StoryValue;
  change(value: StoryValue): void;
  label: string;
}) {
  if (type === "boolean")
    return (
      <NativeSelect
        aria-label={label}
        value={String(value)}
        onChange={(event) => change(event.target.value === "true")}
        size="sm"
      >
        <NativeSelectOption value="false">否</NativeSelectOption>
        <NativeSelectOption value="true">是</NativeSelectOption>
      </NativeSelect>
    );
  return (
    <input
      aria-label={label}
      type={type === "number" ? "number" : "text"}
      min={type === "number" ? -1_000_000 : undefined}
      max={type === "number" ? 1_000_000 : undefined}
      maxLength={1000}
      value={String(value)}
      onChange={(e) =>
        change(
          type === "number"
            ? Math.max(
                -1_000_000,
                Math.min(1_000_000, Math.trunc(Number(e.target.value) || 0)),
              )
            : e.target.value,
        )
      }
    />
  );
}
