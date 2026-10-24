import type { ModelPurpose, ModelRequest, JsonValue } from "@mewvis/chat-contracts";
import { BookOpen, CircleHelp, RotateCcw } from "lucide-react";
import type { LlmProviderConfig, ProviderModelConfig } from "@/agent-client/runtime-model";
import { applyPurposeTemplate } from "./configuration";
import { editorPresets } from "../presets";
import { Button } from "design-system/components/ui/button";
import { Input } from "design-system/components/ui/input";
import { Label } from "design-system/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "design-system/components/ui/tooltip";
import { Choice, Field, JsonField, pretty, useEditorBuffers } from "./fields";
import { PurposeConnection } from "./connection";

export function RequestEditor({
  purpose,
  provider,
  model,
  onChange,
}: {
  purpose: ModelPurpose;
  provider: LlmProviderConfig;
  model: ProviderModelConfig;
  onChange: (value: ModelPurpose) => void;
}) {
  const buffers = useEditorBuffers();
  const prefix = `${purpose.type}-`;
  const presets = editorPresets.listTemplates(purpose.type);
  const currentPreset = editorPresets.getTemplate(purpose.preset?.id);
  const selectedPresetId =
    currentPreset?.id ??
    (purpose.adapter === "native" ? editorPresets.suggestTemplate(purpose.type, "", "")?.id : undefined) ??
    "custom-json";
  const request = purpose.request;
  const foreignSupplier = Boolean(
    currentPreset?.providerId && currentPreset.providerId !== editorPresets.getProvider(provider.provider)?.id,
  );
  const requestModelId = `${model.id}-${purpose.type}-request-model`;
  const applyPreset = (id: string) => {
    buffers.clear(prefix);
    onChange(applyPurposeTemplate(provider, model, purpose, id));
  };
  const update = (patch: Partial<ModelRequest>) => onChange({ ...purpose, request: { ...request!, ...patch } });
  const variables = [
    "model.id",
    "input",
    ...Object.keys(typeof purpose.inputSchema === "object" ? (purpose.inputSchema.properties ?? {}) : {}).map(
      (key) => `input.${key}`,
    ),
    ...purpose.parameters.map((param) => `params.${param.name}`),
  ];
  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-5 [&_label]:font-normal">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <span className="text-xs">请求模板</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="size-6 text-muted-foreground"
                    aria-label="请求模板说明"
                  >
                    <CircleHelp className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="z-90">
                  {purpose.adapter === "native"
                    ? "模板填充请求模型与用途配置。对话协议处理流式返回、工具调用和附件，默认思考等级与上下文限制在可调参数中设置。"
                    : "HTTP / JSON 模板填充请求、参数和返回配置。地址和 Key 留空沿用 Provider，跨供应商模板需填写对应连接；multipart、流式 SSE、WebSocket 和特殊签名需要独立适配器。"}
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              {currentPreset?.sourceUrl && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button asChild variant="ghost" size="icon-sm" className="size-7 text-muted-foreground">
                      <a target="_blank" rel="noreferrer" href={currentPreset.sourceUrl} aria-label="接口文档">
                        <BookOpen className="size-3.5" />
                      </a>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="z-90">接口文档</TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="size-7 text-muted-foreground"
                    aria-label="恢复当前模板"
                    onClick={() => applyPreset(selectedPresetId)}
                  >
                    <RotateCcw className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="z-90">
                  恢复模板的请求、参数和返回配置，保留连接与请求模型 ID。
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
          <Choice
            label="请求模板"
            value={selectedPresetId}
            options={[
              ...presets.map((preset) => ({ value: preset.id, label: preset.label })),
              { value: "custom-json", label: "自定义 HTTP / JSON" },
            ]}
            onChange={(id) => {
              applyPreset(id);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={requestModelId} className="text-xs">
            请求模型 ID
            {foreignSupplier && (
              <span className="text-destructive" aria-hidden="true">
                *
              </span>
            )}
          </Label>
          <Input
            id={requestModelId}
            aria-label="用途请求模型 ID"
            aria-required={foreignSupplier}
            aria-describedby={`${requestModelId}-hint`}
            className="h-8 font-mono text-xs"
            value={purpose.modelId ?? ""}
            placeholder={foreignSupplier ? "填写请求模型 ID" : `沿用上方模型：${model.modelId || "未设置"}`}
            onChange={(event) => {
              const next = { ...purpose };
              const value = event.currentTarget.value.trim();
              if (value) next.modelId = value;
              else delete next.modelId;
              onChange(next);
            }}
          />
          <span id={`${requestModelId}-hint`} className="sr-only">
            {foreignSupplier
              ? "使用当前模板所属供应商的模型 ID。"
              : "留空使用上方模型 ID，需要不同型号或别名时再填写。"}
          </span>
        </div>
        <PurposeConnection
          key={`${purpose.type}-${purpose.preset?.id}`}
          provider={provider}
          purpose={purpose}
          onChange={onChange}
        />
        {purpose.adapter !== "native" && (
          <>
            <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3">
              <Field label="请求方式">
                <Choice
                  label="请求方式"
                  value={request!.method}
                  options={["GET", "POST", "PUT", "PATCH", "DELETE"].map((value) => ({
                    value: value as ModelRequest["method"],
                    label: value,
                  }))}
                  onChange={(method) => {
                    buffers.clear(`${prefix}body`);
                    const next = { ...request!, method };
                    if (method === "GET") delete next.body;
                    onChange({ ...purpose, request: next });
                  }}
                />
              </Field>
              <Field label="请求路径 / 完整 URL">
                <Input
                  aria-label="请求路径或完整 URL"
                  className="h-8 font-mono text-xs"
                  value={request!.path}
                  onChange={(event) => update({ path: event.currentTarget.value })}
                />
              </Field>
            </div>
            <details>
              <summary className="cursor-pointer text-xs">请求头</summary>
              <div className="pt-3">
                <JsonField
                  id={`${prefix}headers`}
                  label="请求头 JSON"
                  value={request!.headers}
                  objectOnly
                  rows={4}
                  onChange={(value) => update({ headers: value as Record<string, string> })}
                  hint="Key 可通过 {{auth.apiKey}} 引用；预览自动遮盖凭据。"
                />
              </div>
            </details>
            {request!.method !== "GET" && (
              <details>
                <summary className="cursor-pointer text-xs">请求体</summary>
                <div className="space-y-3 pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">JSON 请求体</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        const raw = buffers.values[`${prefix}body`]?.raw ?? pretty(request!.body);
                        try {
                          buffers.set(`${prefix}body`, { raw: pretty(JSON.parse(raw)), error: "" });
                        } catch {}
                      }}
                    >
                      格式化
                    </Button>
                  </div>
                  <JsonField
                    id={`${prefix}body`}
                    label="请求体"
                    value={request!.body}
                    rows={10}
                    optional
                    onChange={(body: JsonValue | undefined) => {
                      const next = { ...request!, body };
                      if (body === undefined) delete next.body;
                      onChange({ ...purpose, request: next });
                    }}
                    hint={
                      '整值 "{{params.n}}" 保留原始类型；"{{input.image?}}" 缺失时省略字段。可选对象用 $optional / $value 包裹。字符串内插只接受标量。'
                    }
                  />
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground">可用变量</span>
                    {variables.map((variable) => (
                      <Button
                        type="button"
                        key={variable}
                        variant="outline"
                        className="h-6 rounded-md px-2 font-mono text-[10px] shadow-none"
                        onClick={() => {
                          const textarea = document.getElementById(`${prefix}body`) as HTMLTextAreaElement | null;
                          if (!textarea) return;
                          const raw = buffers.values[`${prefix}body`]?.raw ?? pretty(request!.body);
                          const insertion = `{{${variable}}}`;
                          const start = textarea.selectionStart;
                          const next = raw.slice(0, start) + insertion + raw.slice(textarea.selectionEnd);
                          try {
                            update({ body: JSON.parse(next) });
                            buffers.set(`${prefix}body`, { raw: next, error: "" });
                          } catch {
                            buffers.set(`${prefix}body`, { raw: next, error: "请求体请填写有效 JSON" });
                          }
                          textarea.focus();
                          requestAnimationFrame(() =>
                            textarea.setSelectionRange(start + insertion.length, start + insertion.length),
                          );
                        }}
                      >
                        {variable}
                      </Button>
                    ))}
                  </div>
                </div>
              </details>
            )}
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
