import type { ModelPurpose, ModelRequest, JsonValue } from "@mewvis/chat-contracts";
import { createModelPurpose } from "@mewvis/chat-contracts/model-configuration";
import { editorPresets } from "../presets";
import { Button } from "design-system/components/ui/button";
import { Input } from "design-system/components/ui/input";
import { Choice, Field, JsonField, pretty, useEditorBuffers } from "./fields";

export function RequestEditor({
  purpose,
  onChange,
}: {
  purpose: ModelPurpose;
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
  const applyPreset = (id: string) => {
    buffers.clear(prefix);
    onChange(
      id === "custom-json"
        ? createModelPurpose(purpose.type, "http-json")
        : editorPresets.instantiateTemplate(id, purpose.type),
    );
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
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium">基础模板</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-muted-foreground"
          onClick={() => applyPreset(selectedPresetId)}
        >
          恢复当前模板
        </Button>
      </div>
      <Field label="选择模板" hint="模板保存为可编辑的副本，切换会替换当前用途的配置。">
        <Choice
          label="基础模板"
          value={selectedPresetId}
          options={[
            ...presets.map((preset) => ({ value: preset.id, label: preset.label })),
            { value: "custom-json", label: "自定义 HTTP / JSON" },
          ]}
          onChange={(id) => {
            applyPreset(id);
          }}
        />
      </Field>
      {currentPreset?.sourceUrl && (
        <a
          className="text-[11px] text-primary hover:underline"
          target="_blank"
          rel="noreferrer"
          href={currentPreset.sourceUrl}
        >
          查看接口文档
        </a>
      )}
      {purpose.adapter === "native" ? (
        <div className="rounded-xl border border-border/70 bg-muted/15 p-4 text-xs leading-6 text-muted-foreground">
          使用模型或 Provider
          的对话协议，流式返回、工具调用和附件由现有适配器处理。默认思考等级和上下文限制在「可调参数」中设置。
        </div>
      ) : (
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
          <details className="rounded-lg border border-border/70 p-3">
            <summary className="cursor-pointer text-xs font-medium">请求头</summary>
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
            <>
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
                hint={'整值 "{{params.n}}" 保留数字、布尔、对象或数组类型。字符串内插只接受标量。'}
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
            </>
          )}
          <p className="text-[11px] leading-5 text-muted-foreground">
            HTTP / JSON 模板用于请求配置。multipart、流式 SSE、WebSocket 和特殊签名需要独立适配器。
          </p>
        </>
      )}
    </div>
  );
}
