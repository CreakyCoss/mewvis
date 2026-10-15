import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { ChevronLeft, ChevronRight, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import type { ModelPurpose, ModelConfiguration, JsonSchema } from "@mewvis/chat-contracts";
import { getModelConfigurationError } from "@mewvis/chat-contracts/model-configuration";
import {
  getModelThinking,
  getModelCapabilities,
  getModelLimitsError,
  type LlmProviderConfig,
  type ProviderModelConfig,
} from "@/agent-client/runtime-model";
import { Button } from "design-system/components/ui/button";
import { Checkbox } from "design-system/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "design-system/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "design-system/components/ui/dialog";
import { Input } from "design-system/components/ui/input";
import { Label } from "design-system/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "design-system/components/ui/popover";
import { MODEL_MODALITY_OPTIONS, MODEL_OPERATION_OPTIONS } from "../options";
import { getThinkingLevelsError } from "./thinking-levels";
import { applyModelDefaults, createModelConfig } from "./utils";
import { initialModelConfiguration, suggestPurpose } from "./model/configuration";
import { EditorBuffers, JsonField, useEditorBuffers } from "./model/fields";
import { RequestEditor } from "./model/request";
import { ParametersEditor } from "./model/parameters";
import { ResponseEditor } from "./model/response";
import { CallPreview } from "./model/preview";
import { ChatParameters } from "./model/chat";
import { PurposeConnection } from "./model/connection";
import { ConfirmDelete } from "./confirm-delete";
import { editorPresets } from "./presets";

type ModelEditDialogProps = {
  provider: LlmProviderConfig;
  model?: ProviderModelConfig;
  onConfirm: (model: ProviderModelConfig) => void;
  onClose: () => void;
  onCloseAutoFocus?: (event: Event) => void;
  onDelete?: () => void;
};

function ModelEditor({
  provider,
  draft,
  setDraft,
}: {
  provider: LlmProviderConfig;
  draft: ProviderModelConfig;
  setDraft: Dispatch<SetStateAction<ProviderModelConfig>>;
}) {
  const configuration = draft.configuration!;
  const [selectedType, setSelectedType] = useState(configuration.purposes[0]?.type ?? "chat");
  const [addOpen, setAddOpen] = useState(false);
  const [capabilitiesOpen, setCapabilitiesOpen] = useState(false);
  const [tab, setTab] = useState("request");
  const navigation = useRef<HTMLDivElement>(null);
  const buffers = useEditorBuffers();
  const selected = configuration.purposes.find((purpose) => purpose.type === selectedType) ?? configuration.purposes[0];
  const updateConfiguration = (patch: Partial<ModelConfiguration>) =>
    setDraft((current) => ({ ...current, configuration: { ...current.configuration!, ...patch } }));
  const updatePurpose = (next: ModelPurpose) =>
    updateConfiguration({
      purposes: configuration.purposes.map((purpose) => (purpose.type === selected.type ? next : purpose)),
    });
  const labels = (values: string[]) =>
    values.map((value) => MODEL_MODALITY_OPTIONS.find((option) => option.value === value)?.label ?? value).join("、") ||
    "未设置";
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${draft.id}-model-id`} className="text-xs">
            模型 ID
          </Label>
          <Input
            id={`${draft.id}-model-id`}
            required
            className="h-8 font-mono"
            placeholder="输入模型 ID，也可在供应商页面获取模型"
            value={draft.modelId}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setDraft((current) => applyModelDefaults(current, provider.provider, value));
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${draft.id}-model-name`} className="text-xs">
            显示名称 <span className="font-normal text-muted-foreground">（可选）</span>
          </Label>
          <Input
            id={`${draft.id}-model-name`}
            className="h-8"
            value={draft.modelName}
            placeholder="留空则使用模型 ID"
            onChange={(event) => {
              const modelName = event.currentTarget.value;
              setDraft((current) => ({ ...current, modelName }));
            }}
          />
        </div>
      </div>
      <div className="mt-4 flex min-w-0 items-center gap-1 border-b border-border/70 pb-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 text-muted-foreground"
          aria-label="向左查看用途"
          onClick={() => navigation.current?.scrollBy({ left: -220, behavior: "smooth" })}
        >
          <ChevronLeft className="size-3.5" />
        </Button>
        <div
          ref={navigation}
          className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="模型用途"
        >
          {configuration.purposes.map((purpose) => (
            <Button
              type="button"
              key={purpose.type}
              variant={selected?.type === purpose.type ? "secondary" : "ghost"}
              className={`h-8 shrink-0 rounded-lg px-3 text-xs ${selected?.type === purpose.type ? "bg-primary/8 text-primary" : "text-muted-foreground"}`}
              aria-pressed={selected?.type === purpose.type}
              onClick={() => setSelectedType(purpose.type)}
            >
              {MODEL_OPERATION_OPTIONS.find((option) => option.value === purpose.type)?.label}
            </Button>
          ))}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 text-muted-foreground"
          aria-label="向右查看用途"
          onClick={() => navigation.current?.scrollBy({ left: 220, behavior: "smooth" })}
        >
          <ChevronRight className="size-3.5" />
        </Button>
        <Popover open={addOpen} onOpenChange={setAddOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="ml-1 h-8 shrink-0 px-2 text-xs shadow-none">
              <Plus className="size-3.5" />
              添加用途
            </Button>
          </PopoverTrigger>
          <PopoverContent className="z-80 w-44 gap-0 p-1" align="end">
            <p className="px-2 py-2 text-[11px] text-muted-foreground">选择用途类型</p>
            {MODEL_OPERATION_OPTIONS.map((option) => (
              <Button
                type="button"
                key={option.value}
                variant="ghost"
                className="h-8 w-full justify-start px-2 text-xs"
                disabled={configuration.purposes.some((purpose) => purpose.type === option.value)}
                onClick={() => {
                  updateConfiguration({
                    purposes: [...configuration.purposes, suggestPurpose(provider, draft, option.value)],
                  });
                  setSelectedType(option.value);
                  setAddOpen(false);
                }}
              >
                {option.label}
              </Button>
            ))}
          </PopoverContent>
        </Popover>
      </div>
      {selected ? (
        <div className="pt-3">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 text-[11px] leading-5 text-muted-foreground">
              输入：{labels(selected.input)}
              <span className="mx-2 text-border">/</span>输出：{labels(selected.output)}
            </p>
            <div className="flex shrink-0 items-center gap-3">
              <Button
                type="button"
                variant="ghost"
                className="h-7 px-0 text-[11px] text-primary hover:bg-transparent"
                aria-expanded={capabilitiesOpen}
                onClick={() => setCapabilitiesOpen((open) => !open)}
              >
                编辑能力
              </Button>
              <ConfirmDelete
                title={`删除“${MODEL_OPERATION_OPTIONS.find((option) => option.value === selected.type)?.label}”用途？`}
                description="此用途的连接、请求模板、参数和返回处理配置将一并移除。"
                onConfirm={() => {
                  buffers.clear(`${selected.type}-`);
                  const purposes = configuration.purposes.filter((purpose) => purpose.type !== selected.type);
                  updateConfiguration({ purposes });
                  setSelectedType(purposes[0].type);
                }}
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label="删除当前用途"
                  disabled={configuration.purposes.length <= 1}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </ConfirmDelete>
            </div>
          </div>
          {capabilitiesOpen && (
            <div className="mt-2 space-y-3 rounded-lg border border-border/70 p-3">
              {(["input", "output"] as const).map((key) => (
                <div key={key} className="flex flex-wrap items-center gap-x-5 gap-y-2">
                  <span className="w-8 text-xs text-muted-foreground">{key === "input" ? "输入" : "输出"}</span>
                  {MODEL_MODALITY_OPTIONS.map((option) => (
                    <label key={option.value} className="flex items-center gap-2 text-xs">
                      <Checkbox
                        checked={selected[key].includes(option.value)}
                        onCheckedChange={(checked) =>
                          updatePurpose({
                            ...selected,
                            [key]: checked
                              ? [...selected[key], option.value]
                              : selected[key].filter((value) => value !== option.value),
                          })
                        }
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              ))}
              {selected.type === "chat" && (
                <div className="flex gap-5">
                  {(
                    [
                      { key: "reasoning", label: "思考" },
                      { key: "toolCalling", label: "工具调用" },
                    ] as const
                  ).map((option) => (
                    <label key={option.key} className="flex items-center gap-2 text-xs">
                      <Checkbox
                        checked={selected[option.key] ?? false}
                        onCheckedChange={(checked) => updatePurpose({ ...selected, [option.key]: checked === true })}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              )}
              {selected.adapter === "http-json" && (
                <JsonField
                  id={`${selected.type}-input-schema`}
                  label="应用输入要求 · JSON Schema（可选）"
                  optional
                  value={selected.inputSchema}
                  rows={5}
                  onChange={(inputSchema) => {
                    const next = { ...selected };
                    if (inputSchema === undefined) delete next.inputSchema;
                    else next.inputSchema = inputSchema as JsonSchema;
                    updatePurpose(next);
                  }}
                />
              )}
            </div>
          )}
          <Tabs value={tab} onValueChange={setTab} className="gap-0">
            <TabsList
              variant="line"
              className="h-9 w-full justify-start gap-4 overflow-x-auto border-b border-border/70 p-0 [scrollbar-width:none]"
              aria-label="用途配置分类"
            >
              {[
                { value: "request", label: "请求配置" },
                { value: "parameters", label: "可调参数" },
                { value: "response", label: "返回处理" },
                { value: "preview", label: "调用预览" },
              ].map((item) => (
                <TabsTrigger key={item.value} value={item.value} className="h-8 flex-none rounded-none px-0 text-xs">
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="request" className="space-y-5 pt-4">
              <PurposeConnection provider={provider} model={draft} purpose={selected} onChange={updatePurpose} />
              <div className="border-t border-border/70 pt-4">
                <RequestEditor
                  key={selected.type}
                  purpose={selected}
                  defaultApiFormat={provider.apiFormat}
                  onChange={updatePurpose}
                />
              </div>
            </TabsContent>
            <TabsContent value="parameters" className="pt-4">
              {selected.adapter === "native" ? (
                <ChatParameters provider={provider} model={draft} onChange={setDraft} />
              ) : (
                <ParametersEditor purpose={selected} onChange={updatePurpose} />
              )}
            </TabsContent>
            <TabsContent value="response" className="pt-4">
              <ResponseEditor purpose={selected} onChange={updatePurpose} />
            </TabsContent>
            <TabsContent value="preview" className="pt-4">
              <CallPreview
                key={`${selected.type}-${selected.preset?.id}`}
                purpose={selected}
                provider={provider}
                model={draft}
              />
            </TabsContent>
          </Tabs>
        </div>
      ) : (
        <p className="py-8 text-center text-xs text-muted-foreground">添加用途后配置输入输出和请求。</p>
      )}
    </>
  );
}

export const ModelEditDialog = ({
  provider,
  model,
  onConfirm,
  onClose,
  onCloseAutoFocus,
  onDelete,
}: ModelEditDialogProps) => {
  const [draft, setDraft] = useState<ProviderModelConfig>(() => {
    const current = model ? structuredClone(model) : createModelConfig(provider);
    return { ...current, configuration: initialModelConfiguration(provider, current) };
  });
  const [jsonError, setJsonError] = useState("");
  const hasChat = getModelCapabilities(provider, draft).available.operations.includes("chat");
  const error =
    jsonError ||
    getModelConfigurationError(draft.configuration) ||
    (hasChat ? getModelLimitsError(provider, draft) || getThinkingLevelsError(getModelThinking(provider, draft)) : "");
  const canConfirm = !!draft.modelId.trim() && !error;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        overlayClassName="z-60 bg-overlay/30 supports-backdrop-filter:backdrop-blur-sm"
        className="!flex z-70 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-[820px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[820px] [&_input]:text-xs [&_[data-slot=input-group]]:h-8"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogHeader className="shrink-0 border-b border-border/70 px-5 py-3.5 pr-14 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-primary/10 bg-primary/6 text-primary">
              <SlidersHorizontal className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 space-y-1">
              <DialogTitle className="text-base font-semibold">{model ? "编辑模型" : "新增模型"}</DialogTitle>
              <DialogDescription className="truncate text-xs">{provider.name} · 连接与调用配置</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canConfirm) return;
            const modelId = draft.modelId.trim();
            onConfirm({
              ...draft,
              modelId,
              modelName: draft.modelName.trim() || modelId,
              limits: hasChat
                ? { ...editorPresets.createModelDefaults(provider).limits, ...draft.limits }
                : draft.limits,
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
            <EditorBuffers onError={setJsonError}>
              <ModelEditor provider={provider} draft={draft} setDraft={setDraft} />
            </EditorBuffers>
          </div>
          <div className="shrink-0 border-t border-border/70 bg-muted/10 px-5 py-3.5 sm:px-6">
            {error && (
              <p className="mb-3 text-xs text-destructive" role="alert">
                {error}
              </p>
            )}
            <DialogFooter className="flex-row items-center justify-between sm:justify-between">
              <div className="min-w-0">
                {model && onDelete ? (
                  <ConfirmDelete
                    title={`删除“${model.modelName || model.modelId}”？`}
                    description="此模型及其全部用途配置将从供应商中移除，更改随供应商配置保存。"
                    onConfirm={onDelete}
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-0 text-xs text-muted-foreground hover:bg-transparent hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                      删除模型
                    </Button>
                  </ConfirmDelete>
                ) : (
                  <span className="hidden text-[11px] text-muted-foreground sm:block">更改随供应商配置保存</span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button type="button" variant="outline" className="h-8 min-w-18 text-xs shadow-none" onClick={onClose}>
                  取消
                </Button>
                <Button type="submit" className="h-8 min-w-24 text-xs shadow-none" disabled={!canConfirm}>
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
