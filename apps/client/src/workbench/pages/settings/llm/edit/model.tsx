import { useState } from "react";
import { ChevronDown, SlidersHorizontal, Trash2 } from "lucide-react";
import {
  getModelThinking,
  getModelCapabilities,
  getModelLimits,
  getModelLimitsError,
  type LlmProviderConfig,
  type ProviderModelConfig,
} from "@/agent-client/runtime-model";
import { Button } from "design-system/components/ui/button";
import { Switch } from "design-system/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "design-system/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "design-system/components/ui/select";
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
import { ModelCapabilitiesEditor } from "./capabilities";

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
  const [settingsTab, setSettingsTab] = useState("general");
  const thinking = getModelThinking(provider, draft);
  const capabilities = getModelCapabilities(provider, draft);
  const limitsError = getModelLimitsError(provider, draft);
  const thinkingError = getThinkingLevelsError(thinking);
  const defaults = getModelLimits(provider, { ...draft, limits: null });
  const canConfirm = !!draft.modelId.trim() && !thinkingError && !limitsError;
  const levels = thinking?.levels ?? [];
  const selectedLevel = levels.findIndex((level) => level.value === thinking?.defaultLevel);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        overlayClassName="z-60 bg-overlay/30 supports-backdrop-filter:backdrop-blur-sm"
        className="!flex z-70 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-[700px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[700px]"
        onCloseAutoFocus={onCloseAutoFocus}
        onEscapeKeyDown={(event) => {
          if (event.target instanceof HTMLElement && event.target.closest("[data-inline-edit]")) event.preventDefault();
        }}
      >
        <DialogHeader className="shrink-0 border-b border-border/70 px-5 py-3.5 pr-14 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-primary/10 bg-primary/6 text-primary">
              <SlidersHorizontal className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 space-y-1">
              <DialogTitle className="text-base font-semibold">{model ? "编辑模型" : "新增模型"}</DialogTitle>
              <DialogDescription className="truncate text-xs">{provider.name} · 模型能力与默认参数</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
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
          <div className="min-h-0 overflow-y-auto px-5 pt-4 pb-4 sm:px-6">
            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="min-w-0 space-y-2">
                <Label htmlFor={`${draft.id}-model-id`} className="text-xs">
                  模型 ID
                </Label>
                <ModelIdSelector
                  id={`${draft.id}-model-id`}
                  options={getProviderModelOptions(provider.provider)}
                  value={draft.modelId}
                  onValueChange={(value) =>
                    setDraft((current) => applyModelDefaults(current, provider.provider, value))
                  }
                />
              </div>
              <div className="min-w-0 space-y-2">
                <Label htmlFor={`${draft.id}-model-name`} className="text-xs">
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
            </div>
            <Tabs value={settingsTab} onValueChange={setSettingsTab} className="gap-0">
              <TabsList
                variant="line"
                aria-label="模型设置分类"
                className="h-10 w-full justify-start gap-6 border-b border-border/70 p-0"
              >
                <TabsTrigger value="general" className="h-9 flex-none rounded-none px-0 text-xs">
                  常用设置
                </TabsTrigger>
                <TabsTrigger value="advanced" className="h-9 flex-none rounded-none px-0 text-xs">
                  高级配置
                  {thinkingError && <span className="size-1.5 rounded-full bg-destructive" aria-label="存在无效配置" />}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="general" className="space-y-4 pt-4">
                <ModelCapabilitiesEditor
                  provider={provider}
                  model={draft}
                  onChange={(capabilities) => setDraft((current) => ({ ...current, capabilities }))}
                />
                {(capabilities.available.operations.includes("chat") || limitsError) && (
                  <section
                    className="space-y-3 border-t border-border/70 pt-4"
                    aria-labelledby={`${draft.id}-parameters-heading`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h3 id={`${draft.id}-parameters-heading`} className="text-sm font-medium">
                        默认参数
                      </h3>
                      {draft.limits && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-auto p-0 text-xs font-normal text-muted-foreground"
                          onClick={() => setDraft((current) => ({ ...current, limits: null }))}
                        >
                          重置限制
                        </Button>
                      )}
                    </div>
                    <div
                      className={`grid grid-cols-2 gap-4 ${capabilities.available.reasoning ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}
                    >
                      {capabilities.available.reasoning && (
                        <div className="col-span-2 space-y-2 sm:col-span-1">
                          <Label htmlFor={`${draft.id}-default-thinking`} className="text-xs">
                            默认思考等级
                          </Label>
                          {levels.length ? (
                            <Select
                              value={selectedLevel < 0 ? "provider-default" : `level-${selectedLevel}`}
                              onValueChange={(value) => {
                                const level = value === "provider-default" ? undefined : levels[Number(value.slice(6))];
                                setDraft((current) => ({
                                  ...current,
                                  thinking: { levels, defaultLevel: level?.value || null },
                                }));
                              }}
                            >
                              <SelectTrigger id={`${draft.id}-default-thinking`} className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent position="popper" className="z-80">
                                <SelectItem value="provider-default">服务默认</SelectItem>
                                {levels.map((level, index) => (
                                  <SelectItem key={index} value={`level-${index}`}>
                                    {level.label || level.value}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <p className="flex h-9 items-center rounded-lg border border-border/70 bg-muted/20 px-3 text-sm text-muted-foreground">
                              服务默认
                            </p>
                          )}
                        </div>
                      )}
                      {(
                        [
                          { key: "contextWindow", label: "上下文窗口" },
                          { key: "maxTokens", label: "最大输出" },
                        ] as const
                      ).map((option) => (
                        <div key={option.key} className="space-y-2">
                          <Label htmlFor={`${draft.id}-${option.key}`} className="text-xs">
                            {option.label} <span className="font-normal text-muted-foreground">· tokens</span>
                          </Label>
                          <Input
                            id={`${draft.id}-${option.key}`}
                            type="number"
                            className="[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            min={1}
                            max={2147483647}
                            step={1}
                            aria-invalid={!!limitsError}
                            aria-describedby={limitsError ? `${draft.id}-configuration-error` : undefined}
                            value={draft.limits?.[option.key] ?? ""}
                            placeholder={`默认 ${defaults[option.key].toLocaleString()}`}
                            onChange={(event) => {
                              const value = event.currentTarget.value;
                              setDraft((current) => {
                                const limits = { ...current.limits };
                                if (value) limits[option.key] = Number(value);
                                else delete limits[option.key];
                                return { ...current, limits: Object.keys(limits).length ? limits : null };
                              });
                            }}
                          />
                        </div>
                      ))}
                    </div>
                    <p className="text-xs leading-5 text-muted-foreground">
                      留空使用模型预设。
                      {capabilities.available.reasoning && "思考等级可在高级配置中编辑。"}
                    </p>
                  </section>
                )}
              </TabsContent>
              <TabsContent value="advanced" className="space-y-4 pt-4">
                {capabilities.available.reasoning ? (
                  <ThinkingLevelsEditor
                    key={draft.modelId}
                    id={draft.id}
                    value={thinking}
                    onChange={(thinking) => setDraft((current) => ({ ...current, thinking }))}
                  />
                ) : (
                  <p className="rounded-xl border border-border/70 bg-muted/15 px-4 py-3 text-xs leading-5 text-muted-foreground">
                    当前未启用思考能力，可在常用设置中调整模型能力。
                  </p>
                )}
                <section
                  className="rounded-xl border border-border/70 p-4"
                  aria-labelledby={`${draft.id}-compatibility-heading`}
                >
                  <h3 id={`${draft.id}-compatibility-heading`} className="mb-4 text-sm font-medium">
                    兼容设置
                  </h3>
                  <div className="flex items-center justify-between gap-4">
                    <Label htmlFor={`${draft.id}-context`} className="min-w-0 cursor-pointer space-y-1 font-normal">
                      <span className="block text-sm">1M 请求标记</span>
                      <span className="block text-xs leading-5 text-muted-foreground">
                        为模型 ID 添加 [1m] 后缀，仅适用于支持此标记的服务。
                      </span>
                    </Label>
                    <Switch
                      id={`${draft.id}-context`}
                      checked={draft.isOneMillionContext}
                      onCheckedChange={(checked) =>
                        setDraft((current) => ({ ...current, isOneMillionContext: checked }))
                      }
                    />
                  </div>
                </section>
              </TabsContent>
            </Tabs>
            {(limitsError || thinkingError) && (
              <p id={`${draft.id}-configuration-error`} role="alert" className="mt-4 text-xs text-destructive">
                {limitsError || thinkingError}
              </p>
            )}
          </div>
          <div className="shrink-0 border-t border-border/70 bg-muted/10 px-5 py-3.5 sm:px-6">
            <DialogFooter className="flex-row items-center justify-between sm:justify-between">
              <div className="min-w-0">
                {model && onDelete ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 px-0 text-muted-foreground hover:bg-transparent hover:text-destructive"
                    onClick={onDelete}
                  >
                    <Trash2 className="size-3.5" />
                    删除模型
                  </Button>
                ) : (
                  <span className="hidden text-xs text-muted-foreground sm:block">更改随供应商配置保存</span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button type="button" variant="outline" className="h-9 min-w-18 shadow-none" onClick={onClose}>
                  取消
                </Button>
                <Button type="submit" className="h-9 min-w-24 shadow-none" disabled={!canConfirm}>
                  {model ? "确认更改" : "添加模型"}
                </Button>
              </div>
            </DialogFooter>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
