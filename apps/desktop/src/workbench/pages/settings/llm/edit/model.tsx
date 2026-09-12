import { useState } from "react";
import { ChevronDown, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { getModelThinking, type LlmProviderConfig, type ProviderModelConfig } from "@/agent-client/runtime-model";
import type { RuntimeModelThinking } from "@/agent-client/wire";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { getProviderModelOptions, THINKING_LEVEL_PRESETS } from "../options";
import { applyModelDefaults, createModelConfig } from "./utils";

type ModelIdSelectorProps = {
  id: string;
  options: Array<{ id: string }>;
  value: string;
  onValueChange: (value: string) => void;
};

const ModelIdSelector = ({ id, options, value, onValueChange }: ModelIdSelectorProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) setQuery("");
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverAnchor asChild>
        <InputGroup className="rounded-lg bg-card/75 transition-[color,background-color,border-color,box-shadow] duration-150 ease-out hover:border-primary/30 has-[[data-slot=input-group-control]:focus-visible]:ring-ring/20">
          <InputGroupInput
            id={id}
            required
            placeholder="选择预设或输入模型 ID"
            className="focus-visible:bg-transparent"
            role="combobox"
            aria-autocomplete="list"
            aria-haspopup="listbox"
            aria-expanded={open}
            value={value}
            onChange={(event) => onValueChange(event.currentTarget.value)}
            onClick={() => handleOpenChange(true)}
          />
          <InputGroupAddon align="inline-end">
            <PopoverTrigger asChild>
              <InputGroupButton
                size="icon-xs"
                className="aria-expanded:bg-transparent aria-expanded:text-muted-foreground"
                aria-label="选择模型 ID"
                title="选择模型 ID"
                aria-expanded={open}
              >
                <ChevronDown className="size-4" />
              </InputGroupButton>
            </PopoverTrigger>
          </InputGroupAddon>
        </InputGroup>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-anchor-width)] min-w-64 gap-0 overflow-hidden p-0"
      >
        <Command>
          <CommandInput value={query} onValueChange={setQuery} placeholder="搜索模型 ID" />
          <CommandList>
            <CommandEmpty>没有匹配的模型，可直接输入自定义 ID</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.id}
                  value={option.id}
                  data-checked={option.id === value}
                  onSelect={() => {
                    onValueChange(option.id);
                    setOpen(false);
                  }}
                >
                  {option.id}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

const ThinkingLevelsEditor = ({
  id,
  value,
  onChange,
}: {
  id: string;
  value?: RuntimeModelThinking;
  onChange: (value: RuntimeModelThinking | null) => void;
}) => {
  const [editingLevel, setEditingLevel] = useState<{ value: string; label: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [level, setLevel] = useState("");
  const [label, setLabel] = useState("");
  const levels = value?.levels ?? [];
  const nextValue = level.trim();
  const isDuplicate = levels.some((item) => item.value === nextValue);
  const availablePresets = THINKING_LEVEL_PRESETS.filter(
    (item) => !levels.some((option) => option.value === item.value),
  );
  const add = (rawValue: string, displayLabel = "") => {
    const addedValue = rawValue.trim();
    if (!addedValue || levels.some((item) => item.value === addedValue)) return;
    onChange({
      levels: [
        ...levels,
        {
          value: addedValue,
          label:
            displayLabel.trim() ||
            THINKING_LEVEL_PRESETS.find((item) => item.value === addedValue)?.label ||
            addedValue,
        },
      ],
      defaultLevel: levels.length ? value?.defaultLevel : addedValue,
    });
    setLevel("");
    setLabel("");
    setAdding(false);
  };

  const finishRename = () => {
    if (!editingLevel) return;
    onChange({
      ...value,
      levels: levels.map((item) =>
        item.value === editingLevel.value ? { ...item, label: editingLevel.label.trim() || item.value } : item,
      ),
    });
    setEditingLevel(null);
  };

  return (
    <section className="min-w-0 space-y-3 border-t border-border/70 pt-5" aria-labelledby={`${id}-thinking-heading`}>
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h3 id={`${id}-thinking-heading`} className="text-sm font-medium">
            思考等级
          </h3>
          <p className="text-xs text-muted-foreground">选择一个等级作为对话默认值</p>
        </div>
        <Popover
          open={adding}
          onOpenChange={(open) => {
            setAdding(open);
            if (open) {
              setLevel("");
              setLabel("");
            }
          }}
        >
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs shadow-none">
              <Plus className="size-3.5" />
              添加等级
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="max-h-[var(--radix-popover-content-available-height)] w-80 max-w-[calc(100vw-2rem)] gap-4 overflow-y-auto"
            aria-label="添加思考等级"
          >
            {availablePresets.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">快捷添加</p>
                <div className="flex flex-wrap gap-1.5">
                  {availablePresets.map((preset) => (
                    <Button
                      key={preset.value}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs shadow-none"
                      onClick={() => add(preset.value, preset.label)}
                    >
                      {preset.label}
                      <span className="font-mono text-[11px] font-normal text-muted-foreground">{preset.value}</span>
                    </Button>
                  ))}
                </div>
              </div>
            )}
            <div
              className={cn("space-y-3", availablePresets.length > 0 && "border-t border-border/60 pt-3")}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  add(level, label);
                }
              }}
            >
              <p className="text-sm font-medium">自定义等级</p>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-thinking-value`} className="text-xs">
                  等级值
                </Label>
                <Input
                  id={`${id}-thinking-value`}
                  placeholder="输入模型支持的值"
                  value={level}
                  onChange={(event) => setLevel(event.currentTarget.value)}
                  aria-invalid={isDuplicate}
                  aria-describedby={isDuplicate ? `${id}-thinking-error` : undefined}
                />
                {isDuplicate && (
                  <p id={`${id}-thinking-error`} className="text-xs text-destructive" role="status">
                    此等级已添加
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-thinking-name`} className="text-xs">
                  显示名称 <span className="font-normal text-muted-foreground">（可选）</span>
                </Label>
                <Input
                  id={`${id}-thinking-name`}
                  placeholder="留空则使用等级值"
                  value={label}
                  onChange={(event) => setLabel(event.currentTarget.value)}
                />
              </div>
              <Button
                type="button"
                size="sm"
                className="w-full"
                onClick={() => add(level, label)}
                disabled={!nextValue || isDuplicate}
              >
                添加
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      <RadioGroup
        value={value?.defaultLevel ?? ""}
        onValueChange={(defaultLevel) => onChange({ levels, defaultLevel: defaultLevel || null })}
        aria-label="默认思考等级"
        className="gap-0 overflow-hidden rounded-lg border border-border/70"
      >
        <div
          className="grid grid-cols-[2rem_minmax(0,1fr)_minmax(0,1fr)_4rem] items-center gap-2 border-b border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
          aria-hidden="true"
        >
          <span className="text-center">默认</span>
          <span>显示名称</span>
          <span>等级值</span>
          <span className="text-right">操作</span>
        </div>
        {levels.map((item, index) => (
          <div
            key={item.value}
            className={cn(
              "grid min-h-11 grid-cols-[2rem_minmax(0,1fr)_minmax(0,1fr)_4rem] items-center gap-2 border-b border-border/60 px-3 py-1",
              value?.defaultLevel === item.value ? "bg-primary/5" : "hover:bg-muted/20",
            )}
          >
            <RadioGroupItem
              id={`${id}-thinking-default-${index}`}
              value={item.value}
              aria-label={`默认等级 ${item.label || item.value} (${item.value})`}
              className="justify-self-center"
            />
            {editingLevel?.value === item.value ? (
              <Input
                autoFocus
                data-inline-edit
                className="h-7 min-w-0 px-2 text-sm shadow-none"
                aria-label={`${item.value} 显示名称`}
                value={editingLevel.label}
                placeholder={item.value}
                onChange={(event) => setEditingLevel({ value: item.value, label: event.currentTarget.value })}
                onBlur={finishRename}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing) return;
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    setEditingLevel(null);
                  }
                }}
              />
            ) : (
              <Label
                htmlFor={`${id}-thinking-default-${index}`}
                className={cn(
                  "block min-w-0 cursor-pointer truncate font-normal",
                  value?.defaultLevel === item.value && "font-medium text-primary",
                )}
                title={item.label || item.value}
              >
                {item.label || item.value}
              </Label>
            )}
            <code className="truncate text-xs text-muted-foreground" title={item.value}>
              {item.value}
            </code>
            <div className="flex items-center justify-end">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground"
                aria-label={`编辑等级 ${item.value}`}
                title="修改显示名称"
                disabled={editingLevel?.value === item.value}
                onClick={() => setEditingLevel({ value: item.value, label: item.label })}
              >
                <Pencil className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                aria-label={`移除等级 ${item.value}`}
                title="移除等级"
                onClick={() => {
                  onChange({
                    levels: levels.filter((option) => option.value !== item.value),
                    defaultLevel: value?.defaultLevel === item.value ? null : value?.defaultLevel,
                  });
                  setEditingLevel(null);
                }}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          </div>
        ))}
        {!levels.length && (
          <p className="px-4 py-5 text-center text-xs text-muted-foreground">尚未配置等级，点击上方添加</p>
        )}
        <div className="flex min-h-10 flex-wrap items-center justify-between gap-x-3 gap-y-1 bg-muted/15 px-3 py-1.5">
          <div className="grid grid-cols-[2rem_auto] items-center gap-2">
            <RadioGroupItem id={`${id}-thinking-unspecified`} value="" className="justify-self-center" />
            <Label
              htmlFor={`${id}-thinking-unspecified`}
              className="cursor-pointer text-xs font-normal text-muted-foreground"
            >
              不指定默认等级
            </Label>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
            onClick={() => {
              setEditingLevel(null);
              onChange(null);
            }}
          >
            <RotateCcw className="size-3" />
            恢复预设
          </Button>
        </div>
      </RadioGroup>
    </section>
  );
};

type ModelEditDialogProps = {
  provider: LlmProviderConfig;
  model?: ProviderModelConfig;
  onConfirm: (model: ProviderModelConfig) => void;
  onClose: () => void;
  onDelete?: () => void;
};

export const ModelEditDialog = ({ provider, model, onConfirm, onClose, onDelete }: ModelEditDialogProps) => {
  const [draft, setDraft] = useState(() => (model ? structuredClone(model) : createModelConfig()));

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="!flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[560px]"
        onEscapeKeyDown={(event) => {
          if (event.target instanceof HTMLElement && event.target.closest("[data-inline-edit]")) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader className="shrink-0 border-b border-border/70 px-6 py-5 pr-14">
          <DialogTitle className="text-lg font-semibold">{model ? "编辑模型" : "新增模型"}</DialogTitle>
          <DialogDescription className="truncate">{provider.name} · 配置模型信息与思考等级</DialogDescription>
        </DialogHeader>
        <form
          className="flex min-h-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            const modelId = draft.modelId.trim();
            if (!modelId) return;
            onConfirm({ ...draft, modelId, modelName: draft.modelName.trim() || modelId });
          }}
        >
          <div className="min-h-0 space-y-5 overflow-y-auto px-6 py-5">
            <div className="space-y-2">
              <Label htmlFor={`${draft.id}-model-id`}>模型 ID</Label>
              <ModelIdSelector
                id={`${draft.id}-model-id`}
                options={getProviderModelOptions(provider.provider)}
                value={draft.modelId}
                onValueChange={(value) => setDraft((current) => applyModelDefaults(current, provider.provider, value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${draft.id}-model-name`}>
                显示名称 <span className="font-normal text-muted-foreground">（可选）</span>
              </Label>
              <Input
                id={`${draft.id}-model-name`}
                value={draft.modelName}
                placeholder="留空则使用模型 ID"
                onChange={(event) => {
                  const modelName = event.currentTarget.value;
                  setDraft((current) => ({ ...current, modelName }));
                }}
              />
            </div>
            <div className="divide-y divide-border/60 rounded-lg border border-border/70 px-3.5">
              <div className="flex items-center justify-between gap-4 py-3">
                <div className="space-y-1">
                  <Label htmlFor={`${draft.id}-enabled`}>启用模型</Label>
                  <p className="text-xs text-muted-foreground">在对话的模型列表中显示</p>
                </div>
                <Switch
                  id={`${draft.id}-enabled`}
                  checked={draft.isEnabled}
                  onCheckedChange={(isEnabled) => setDraft((current) => ({ ...current, isEnabled }))}
                />
              </div>
              <div className="flex items-center justify-between gap-4 py-3">
                <Label htmlFor={`${draft.id}-context`}>1M 上下文</Label>
                <Switch
                  id={`${draft.id}-context`}
                  checked={draft.isOneMillionContext}
                  onCheckedChange={(isOneMillionContext) =>
                    setDraft((current) => ({ ...current, isOneMillionContext }))
                  }
                />
              </div>
            </div>
            <ThinkingLevelsEditor
              id={draft.id}
              value={getModelThinking(provider, draft)}
              onChange={(thinking) => setDraft((current) => ({ ...current, thinking }))}
            />
          </div>
          <div className="shrink-0 border-t border-border/70 bg-muted/20 px-6 py-4">
            <DialogFooter className="flex-row items-center justify-between sm:justify-between">
              <div>
                {model && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    disabled={!onDelete}
                    title={onDelete ? "删除模型" : "至少保留一个模型"}
                    onClick={onDelete}
                  >
                    <Trash2 className="size-4" />
                    删除模型
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" onClick={onClose}>
                  取消
                </Button>
                <Button type="submit" disabled={!draft.modelId.trim()}>
                  {model ? "完成" : "添加模型"}
                </Button>
              </div>
            </DialogFooter>
            <p className="mt-3 text-right text-xs text-muted-foreground">保存 Provider 配置后生效</p>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
