import { useState } from "react";
import { ChevronDown, Trash2 } from "lucide-react";
import { getModelThinking, type LlmProviderConfig, type ProviderModelConfig } from "@/agent-client/runtime-model";
import { Button } from "design-system/components/ui/button";
import { Checkbox } from "design-system/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "design-system/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "design-system/components/ui/dialog";
import { Input } from "design-system/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "design-system/components/ui/input-group";
import { Label } from "design-system/components/ui/label";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "design-system/components/ui/popover";
import { getProviderModelOptions } from "../options";
import { getThinkingLevelsError, ThinkingLevelsEditor } from "./thinking-levels";
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
        className="z-80 w-[var(--radix-popover-anchor-width)] min-w-64 gap-0 overflow-hidden p-0"
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

type ModelEditDialogProps = {
  provider: LlmProviderConfig;
  model?: ProviderModelConfig;
  onConfirm: (model: ProviderModelConfig) => void;
  onClose: () => void;
  onCloseAutoFocus?: (event: Event) => void;
  onDelete?: () => void;
};

export const ModelEditDialog = ({
  provider,
  model,
  onConfirm,
  onClose,
  onCloseAutoFocus,
  onDelete,
}: ModelEditDialogProps) => {
  const [draft, setDraft] = useState(() => (model ? structuredClone(model) : createModelConfig()));
  const thinking = getModelThinking(provider, draft);
  const canConfirm = !!draft.modelId.trim() && !getThinkingLevelsError(thinking);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        overlayClassName="z-60 bg-overlay/20 supports-backdrop-filter:backdrop-blur-none"
        className="!flex z-70 max-h-[calc(100dvh_-_2rem)] w-[calc(100vw_-_2rem)] max-w-[660px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[660px]"
        onCloseAutoFocus={onCloseAutoFocus}
        onEscapeKeyDown={(event) => {
          if (event.target instanceof HTMLElement && event.target.closest("[data-inline-edit]")) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader className="shrink-0 gap-1 border-b border-border/70 px-5 py-3 pr-14">
          <DialogTitle className="text-lg leading-tight font-semibold">{model ? "编辑模型" : "新增模型"}</DialogTitle>
          <DialogDescription className="truncate text-xs">{provider.name}</DialogDescription>
        </DialogHeader>
        <form
          className="flex min-h-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            const modelId = draft.modelId.trim();
            if (!canConfirm) return;
            onConfirm({
              ...draft,
              modelId,
              modelName: draft.modelName.trim() || modelId,
              thinking: draft.thinking
                ? {
                    levels: draft.thinking.levels.map((level) => ({
                      value: level.value.trim(),
                      label: level.label.trim() || level.value.trim(),
                    })),
                    defaultLevel: draft.thinking.defaultLevel?.trim() || null,
                  }
                : draft.thinking,
            });
          }}
        >
          <div className="min-h-0 space-y-3 overflow-y-auto px-5 py-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor={`${draft.id}-model-id`}>模型 ID</Label>
                <ModelIdSelector
                  id={`${draft.id}-model-id`}
                  options={getProviderModelOptions(provider.provider)}
                  value={draft.modelId}
                  onValueChange={(value) =>
                    setDraft((current) => applyModelDefaults(current, provider.provider, value))
                  }
                />
              </div>
              <div className="min-w-0 space-y-1.5">
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
              <div className="flex h-9 items-center gap-1.5 self-end">
                <Checkbox
                  id={`${draft.id}-context`}
                  checked={draft.isOneMillionContext}
                  onCheckedChange={(checked) =>
                    setDraft((current) => ({ ...current, isOneMillionContext: checked === true }))
                  }
                />
                <Label htmlFor={`${draft.id}-context`} className="cursor-pointer">
                  1M
                </Label>
              </div>
            </div>
            <ThinkingLevelsEditor
              key={draft.modelId}
              id={draft.id}
              value={thinking}
              onChange={(thinking) => setDraft((current) => ({ ...current, thinking }))}
            />
          </div>
          <div className="shrink-0 border-t border-border/70 bg-muted/20 px-5 py-3">
            <DialogFooter className="flex-row items-center justify-between sm:justify-between">
              <div>
                {model && (
                  <Button
                    type="button"
                    variant="ghost"
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
                <Button type="button" variant="outline" className="min-w-20 px-4 shadow-none" onClick={onClose}>
                  取消
                </Button>
                <Button type="submit" className="min-w-20 px-4 shadow-none" disabled={!canConfirm}>
                  {model ? "完成" : "添加模型"}
                </Button>
              </div>
            </DialogFooter>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
