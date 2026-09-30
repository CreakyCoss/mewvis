import { useRef, useState } from "react";
import { ChevronDown, Plus, RotateCcw, Trash2 } from "lucide-react";
import type { RuntimeModelThinking } from "@/agent-client/wire";
import { Button } from "design-system/components/ui/button";
import { Command, CommandGroup, CommandItem, CommandList } from "design-system/components/ui/command";
import { Input } from "design-system/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "design-system/components/ui/input-group";
import { Label } from "design-system/components/ui/label";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "design-system/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "design-system/components/ui/radio-group";
import { cn } from "design-system/lib/utils";
import { THINKING_LEVEL_PRESETS } from "../options";

export const getThinkingLevelsError = (thinking?: RuntimeModelThinking) => {
  const values = thinking?.levels.map((level) => level.value.trim()) ?? [];
  if (values.some((value) => !value)) return "请填写空等级的等级值，或移除该等级。";
  if (new Set(values).size !== values.length) return "等级值不能重复，请修改或移除重复等级。";
  return "";
};

type ThinkingLevel = RuntimeModelThinking["levels"][number];

const ThinkingLevelRow = ({
  id,
  index,
  item,
  selected,
  duplicate,
  autoFocus,
  onChange,
  onDelete,
}: {
  id: string;
  index: number;
  item: ThinkingLevel;
  selected: boolean;
  duplicate: boolean;
  autoFocus: boolean;
  onChange: (item: ThinkingLevel) => void;
  onDelete: () => void;
}) => {
  const [presetOpen, setPresetOpen] = useState(false);
  const presetList = useRef<HTMLDivElement>(null);
  const valueInput = useRef<HTMLInputElement>(null);
  const empty = !item.value.trim();

  return (
    <div
      data-inline-edit
      className={cn(
        "group/level grid min-h-11 grid-cols-[1.75rem_minmax(0,1fr)_minmax(0,1fr)_2rem] items-center gap-1 self-start border-b border-border/60 px-1",
        selected ? "bg-primary/5" : "hover:bg-muted/20",
      )}
      onKeyDown={(event) => {
        if (!(event.target instanceof HTMLInputElement) || !event.currentTarget.contains(event.target)) return;
        if (event.nativeEvent.isComposing) return;
        if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          event.target.blur();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          event.target.blur();
        }
      }}
    >
      <RadioGroupItem
        id={`${id}-thinking-default-${index}`}
        value={`level-${index}`}
        disabled={empty || duplicate}
        aria-label={`默认等级 ${item.label || item.value || index + 1} (${item.value})`}
        className="justify-self-center"
      />
      <Input
        className="h-8 min-w-0 px-1.5 text-sm shadow-none"
        aria-label={`等级 ${index + 1} 名称`}
        title="等级名称（可选）"
        placeholder="等级名"
        value={item.label}
        onChange={(event) => onChange({ ...item, label: event.currentTarget.value })}
      />
      <Popover open={presetOpen} onOpenChange={setPresetOpen}>
        <PopoverAnchor asChild>
          <InputGroup className="h-8 rounded-md shadow-none">
            <InputGroupInput
              ref={valueInput}
              autoFocus={autoFocus}
              className="h-8 min-w-0 px-1.5 font-mono text-xs"
              aria-label={`等级 ${index + 1} 值`}
              title="选择预设或输入自定义等级值"
              placeholder="选择或输入"
              role="combobox"
              aria-haspopup="listbox"
              aria-expanded={presetOpen}
              aria-required="true"
              aria-invalid={empty || duplicate}
              aria-describedby={empty || duplicate ? `${id}-thinking-error` : undefined}
              value={item.value}
              onChange={(event) => onChange({ ...item, value: event.currentTarget.value })}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  setPresetOpen(true);
                }
              }}
            />
            <InputGroupAddon align="inline-end" className="pr-1">
              <PopoverTrigger asChild>
                <InputGroupButton size="icon-xs" aria-label={`选择等级 ${index + 1} 的预设`} title="选择预设等级">
                  <ChevronDown className="size-3.5" />
                </InputGroupButton>
              </PopoverTrigger>
            </InputGroupAddon>
          </InputGroup>
        </PopoverAnchor>
        <PopoverContent
          align="start"
          className="z-80 w-48 gap-0 overflow-hidden p-0"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            presetList.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            valueInput.current?.focus();
          }}
        >
          <Command ref={presetList} tabIndex={-1}>
            <CommandList>
              <CommandGroup heading="等级预设">
                {THINKING_LEVEL_PRESETS.map((preset) => (
                  <CommandItem
                    key={preset.value}
                    value={preset.value}
                    data-checked={preset.value === item.value}
                    onSelect={() => {
                      const previousPreset = THINKING_LEVEL_PRESETS.find((option) => option.value === item.value);
                      const usePresetLabel =
                        !item.label.trim() || item.label === item.value || item.label === previousPreset?.label;
                      onChange({ value: preset.value, label: usePresetLabel ? preset.label : item.label });
                      setPresetOpen(false);
                    }}
                  >
                    {preset.label}
                    <code className="ml-auto text-xs text-muted-foreground">{preset.value}</code>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        aria-label={`移除等级 ${index + 1}`}
        title="移除等级"
        onClick={onDelete}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
};

export const ThinkingLevelsEditor = ({
  id,
  value,
  onChange,
}: {
  id: string;
  value?: RuntimeModelThinking;
  onChange: (value: RuntimeModelThinking | null) => void;
}) => {
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const levels = value?.levels ?? [];
  const selectedIndex = levels.findIndex((item) => item.value && item.value === value?.defaultLevel);
  const error = getThinkingLevelsError(value);

  return (
    <section className="min-w-0 space-y-2 border-t border-border/70 pt-3" aria-labelledby={`${id}-thinking-heading`}>
      <div className="flex items-center justify-between gap-3">
        <h3 id={`${id}-thinking-heading`} className="text-sm font-medium">
          思考等级
        </h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5 text-sm text-muted-foreground"
          onClick={() => {
            setFocusIndex(null);
            onChange(null);
          }}
        >
          <RotateCcw className="size-3.5" />
          恢复预设
        </Button>
      </div>
      <RadioGroup
        value={selectedIndex < 0 ? "unspecified" : `level-${selectedIndex}`}
        onValueChange={(selected) => {
          const level = selected === "unspecified" ? undefined : levels[Number(selected.slice(6))];
          onChange({ levels, defaultLevel: level?.value || null });
        }}
        aria-label="默认思考等级"
        className="grid-cols-1 gap-0"
      >
        <div className="grid min-h-11 grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-1 border-y border-border/60 px-1">
          <RadioGroupItem id={`${id}-thinking-unspecified`} value="unspecified" className="justify-self-center" />
          <Label htmlFor={`${id}-thinking-unspecified`} className="cursor-pointer text-sm font-normal">
            不指定默认等级
          </Label>
        </div>
        {levels.map((item, index) => (
          <ThinkingLevelRow
            key={index}
            id={id}
            index={index}
            item={item}
            selected={selectedIndex === index}
            duplicate={levels.some(
              (other, otherIndex) => otherIndex !== index && other.value.trim() === item.value.trim(),
            )}
            autoFocus={focusIndex === index}
            onChange={(next) => {
              onChange({
                levels: levels.map((level, levelIndex) => (levelIndex === index ? next : level)),
                defaultLevel: selectedIndex === index ? next.value || null : value?.defaultLevel,
              });
            }}
            onDelete={() => {
              setFocusIndex(null);
              onChange({
                levels: levels.filter((_, levelIndex) => levelIndex !== index),
                defaultLevel: selectedIndex === index ? null : value?.defaultLevel,
              });
            }}
          />
        ))}
        <Button
          type="button"
          variant="ghost"
          className="h-11 justify-start gap-1 self-start rounded-none border-x-0 border-t-0 border-b border-border/60 px-1 text-primary"
          onClick={() => {
            setFocusIndex(levels.length);
            onChange({ levels: [...levels, { value: "", label: "" }], defaultLevel: value?.defaultLevel });
          }}
        >
          <span className="flex w-7 justify-center">
            <Plus className="size-4" />
          </span>
          添加等级
        </Button>
      </RadioGroup>
      {error && (
        <p id={`${id}-thinking-error`} className="text-xs text-destructive" role="status">
          {error}
        </p>
      )}
    </section>
  );
};
