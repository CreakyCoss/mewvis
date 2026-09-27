import { useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { Button } from "design-system/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "design-system/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "design-system/components/ui/popover";

export function AgentCategorySelector({
  id,
  value,
  options,
  onChange,
}: {
  id: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const categories = [...new Set([...options, "自定义", value].map((item) => item.trim()).filter(Boolean))];
  const name = query.trim();
  const search = name.toLocaleLowerCase();
  const visible = categories.filter((category) => category.toLocaleLowerCase().includes(search));
  const canCreate = Boolean(name) && !categories.some((category) => category.toLocaleLowerCase() === search);
  const select = (category: string) => {
    onChange(category);
    setOpen(false);
  };
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          className="w-full justify-between gap-2 px-3 font-normal"
        >
          <span className="truncate">{value || "选择分类"}</span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] min-w-60 gap-0 overflow-hidden p-0"
      >
        <Command shouldFilter={false}>
          <CommandInput
            aria-label="搜索或新建分类"
            placeholder="搜索或新建分类"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>暂无分类</CommandEmpty>
            {visible.length > 0 && (
              <CommandGroup heading="已有分类">
                {visible.map((category) => (
                  <CommandItem
                    key={category}
                    value={category}
                    data-checked={value === category}
                    onSelect={() => select(category)}
                  >
                    <span className="truncate">{category}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {canCreate && (
              <CommandGroup className="border-t border-border/60">
                <CommandItem value={`create:${name}`} onSelect={() => select(name)}>
                  <Plus className="size-4" />
                  <span className="truncate">新建“{name}”</span>
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
