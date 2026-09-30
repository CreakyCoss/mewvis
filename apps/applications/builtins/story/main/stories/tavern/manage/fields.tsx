import type { ReactNode } from "react";
import { CircleHelp } from "lucide-react";
import {
  NativeSelect,
  NativeSelectOption,
} from "design-system/components/ui/native-select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "design-system/components/ui/tooltip";
import { cn } from "design-system/lib/utils";
const SettingsHint = ({
  label,
  description,
}: {
  label: string;
  description: string;
}) => (
  <TooltipProvider delayDuration={200}>
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`${label}说明`}
          className="-my-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <CircleHelp className="size-3.5" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" align="start" collisionPadding={12}>
        {description}
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);
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
      <div className="flex items-center gap-1.5">
        <h3 className="text-base font-semibold leading-6">{title}</h3>
        {description && <SettingsHint label={title} description={description} />}
      </div>
      {action}
    </div>
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
    <div className="flex items-center gap-1.5 text-sm leading-5">
      <label htmlFor={htmlFor} className="font-medium">
        {label}
      </label>
      {description && (
        <SettingsHint label={label} description={description} />
      )}
    </div>
    {children}
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
