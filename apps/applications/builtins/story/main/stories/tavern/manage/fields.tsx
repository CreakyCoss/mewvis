import type { ReactNode } from "react";
import {
  NativeSelect,
  NativeSelectOption,
} from "design-system/components/ui/native-select";
import { cn } from "design-system/lib/utils";
export const SettingsGroup = ({
  title,
  children,
  description,
  action,
}: {
  title: string;
  children: ReactNode;
  description?: string;
  action?: ReactNode;
}) => (
  <section className="space-y-[var(--tavern-group-gap,1rem)]">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-base font-semibold leading-6">{title}</h3>
      {action}
    </div>
    {description && (
      <p className="text-xs leading-5 text-muted-foreground">{description}</p>
    )}
    {children}
  </section>
);
export const SettingsField = ({
  label,
  htmlFor,
  children,
  description,
  className,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
  description?: string;
  className?: string;
}) => (
  <div
    className={cn(
      "min-w-0 space-y-[var(--tavern-field-gap,0.5rem)]",
      className,
    )}
  >
    <label htmlFor={htmlFor} className="block text-sm font-medium">
      {label}
    </label>
    {children}
    {description && (
      <p className="text-xs leading-5 text-muted-foreground">{description}</p>
    )}
  </div>
);
export const SettingsSelect = ({
  id,
  value,
  options,
  onChange,
}: {
  id: string;
  value: string;
  options: ReadonlyArray<{ id: string; label: string }>;
  onChange: (value: string) => void;
}) => (
  <NativeSelect
    id={id}
    value={value}
    className="w-full [&_select]:h-[var(--tavern-control-height,2.5rem)]"
    onChange={(event) => onChange(event.target.value)}
  >
    {options.map((option) => (
      <NativeSelectOption key={option.id} value={option.id}>
        {option.label}
      </NativeSelectOption>
    ))}
  </NativeSelect>
);
