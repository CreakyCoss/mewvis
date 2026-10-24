import { useCallback, useRef, useState, type KeyboardEventHandler } from "react";
import { ChevronDown, Loader2, RefreshCw } from "lucide-react";
import { Button } from "design-system/components/ui/button";
import { Command, CommandItem, CommandList } from "design-system/components/ui/command";
import { Input } from "design-system/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "design-system/components/ui/popover";
import type { ModelDiscoveryState } from "./use-model-discovery";

export function ModelIdSelector({
  id,
  value,
  discovery,
  onValueChange,
  onSelect,
  onBlur,
  onKeyDown,
  onReload,
}: {
  id: string;
  value: string;
  discovery: ModelDiscoveryState;
  onValueChange: (value: string) => void;
  onSelect: (value: string) => void;
  onBlur: () => void;
  onKeyDown: KeyboardEventHandler<HTMLInputElement>;
  onReload: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const preserveInputFocus = useRef(false);
  const interactedOutside = useRef(false);
  const [listId, setListId] = useState<string>();
  const bindList = useCallback((element: HTMLDivElement | null) => setListId(element?.id), []);
  const search = query.trim().toLowerCase();
  const models = discovery.models.filter(
    (model) => model.modelId.toLowerCase().includes(search) || model.modelName.toLowerCase().includes(search),
  );

  const openMenu = (keepInputFocus: boolean) => {
    preserveInputFocus.current = keepInputFocus;
    interactedOutside.current = false;
    setOpen(true);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div ref={anchor} className="relative">
          <Input
            ref={input}
            id={id}
            required
            className="h-8 pr-8 font-mono"
            placeholder="选择或输入模型 ID"
            role="combobox"
            aria-autocomplete="list"
            aria-haspopup="listbox"
            aria-controls={open ? listId : undefined}
            aria-expanded={open}
            value={value}
            onChange={(event) => {
              const next = event.currentTarget.value;
              onValueChange(next);
              setQuery(next);
              openMenu(true);
            }}
            onClick={() => {
              setQuery("");
              openMenu(true);
            }}
            onBlur={onBlur}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                if (open) menu.current?.focus();
                else {
                  setQuery("");
                  openMenu(false);
                }
              } else if (open && event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                setOpen(false);
              } else if (open && event.key === "Enter") {
                event.preventDefault();
                setOpen(false);
                onKeyDown(event);
              } else onKeyDown(event);
            }}
          />
          <PopoverTrigger asChild>
            <button
              type="button"
              className="absolute inset-y-0 right-0 flex w-8 items-center justify-center rounded-r-lg text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/20"
              aria-label="选择模型 ID"
              onClick={() => {
                setQuery("");
                preserveInputFocus.current = false;
                interactedOutside.current = false;
              }}
            >
              {discovery.isLoading ? (
                <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" />
              ) : (
                <ChevronDown className="size-3.5" />
              )}
            </button>
          </PopoverTrigger>
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="z-80 w-[var(--radix-popover-trigger-width)] gap-0 overflow-hidden p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          if (!preserveInputFocus.current) menu.current?.focus();
        }}
        onInteractOutside={(event) => {
          if (event.target instanceof Node && anchor.current?.contains(event.target)) event.preventDefault();
          else interactedOutside.current = true;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (!interactedOutside.current) input.current?.focus();
        }}
      >
        <div className="flex items-center justify-between border-b border-border/60 px-3 py-1.5">
          <span className="text-[11px] text-muted-foreground">选择模型，也可直接输入 ID</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="重新获取模型"
            title="重新获取模型"
            disabled={discovery.isLoading}
            onClick={onReload}
          >
            <RefreshCw className="size-3" />
          </Button>
        </div>
        {discovery.isLoading && (
          <p role="status" className="px-3 py-3 text-xs text-muted-foreground">
            正在获取模型…
          </p>
        )}
        {discovery.error && (
          <p role="alert" className="px-3 py-3 text-xs text-destructive">
            {discovery.error}，仍可手动输入模型 ID。
          </p>
        )}
        <Command ref={menu} tabIndex={-1} label="可选模型" shouldFilter={false} loop>
          <CommandList ref={bindList} label="可选模型">
            {models.map((model) => (
              <CommandItem
                key={model.modelId}
                value={model.modelId}
                data-checked={model.modelId === value}
                className="text-xs"
                onSelect={() => {
                  onSelect(model.modelId);
                  setOpen(false);
                }}
              >
                <span className="min-w-0">
                  <span className="block truncate font-mono">{model.modelId}</span>
                  {model.modelName !== model.modelId && (
                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{model.modelName}</span>
                  )}
                </span>
              </CommandItem>
            ))}
            {!discovery.isLoading && !discovery.error && models.length === 0 && (
              <p role="status" className="px-3 py-4 text-xs text-muted-foreground">
                {discovery.models.length
                  ? "没有匹配的模型，可继续输入自定义 ID。"
                  : "暂无可选模型，可直接输入模型 ID。"}
              </p>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
