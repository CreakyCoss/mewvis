import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Command, CommandItem, CommandList } from "design-system/components/ui/command";
import { Input } from "design-system/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "design-system/components/ui/popover";
import { getProviderOptions } from "../options";

export const ProviderSelector = ({
  id,
  value,
  onValueChange,
  onPresetSelect,
}: {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  onPresetSelect: (value: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const interactedOutside = useRef(false);
  const preserveInputFocusOnOpen = useRef(false);

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          interactedOutside.current = false;
        }
      }}
    >
      <PopoverAnchor asChild>
        <div className="relative w-full">
          <Input
            ref={input}
            id={id}
            required
            className="pr-8 text-sm dark:hover:bg-input/45"
            placeholder="选择或输入供应商"
            role="combobox"
            aria-autocomplete="list"
            aria-haspopup="listbox"
            aria-expanded={open}
            value={value}
            onChange={(event) => onValueChange(event.currentTarget.value)}
            onClick={() => {
              preserveInputFocusOnOpen.current = true;
              setOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                interactedOutside.current = false;
                preserveInputFocusOnOpen.current = false;
                if (open) {
                  menu.current?.focus();
                } else {
                  setOpen(true);
                }
              }
            }}
          />
          <PopoverTrigger asChild>
            <button
              type="button"
              className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-lg text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/20"
              aria-label="选择供应商"
              title="选择供应商"
            >
              <ChevronDown className="size-4" />
            </button>
          </PopoverTrigger>
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-anchor-width)] gap-0 overflow-hidden p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          if (!preserveInputFocusOnOpen.current) menu.current?.focus();
        }}
        onInteractOutside={() => {
          interactedOutside.current = true;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (!interactedOutside.current) input.current?.focus();
          preserveInputFocusOnOpen.current = false;
        }}
      >
        <Command ref={menu} tabIndex={-1} label="供应商" defaultValue={value} loop>
          <CommandList>
            {getProviderOptions().map((option) => (
              <CommandItem
                key={option.value}
                value={option.value}
                data-checked={option.value === value}
                className="data-[checked=true]:bg-primary/8 data-[checked=true]:font-semibold [&>svg]:hidden"
                onSelect={() => {
                  onPresetSelect(option.value);
                  setOpen(false);
                }}
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <code className="min-w-0 truncate font-medium">{option.value}</code>
                  {option.value !== option.label && (
                    <span className="ml-auto shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground group-data-selected/command-item:bg-background/70 group-data-selected/command-item:text-accent-foreground">
                      {option.label}
                    </span>
                  )}
                </span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
