import { Plus, Trash2 } from "lucide-react";
import type { ModelPurpose, ModelResponse, ModelOutputRule, JsonValue, ModelRequest } from "@mewvis/chat-contracts";
import { Button } from "design-system/components/ui/button";
import { Input } from "design-system/components/ui/input";
import { Choice, Field, JsonField, ParameterValue, useEditorBuffers } from "./fields";
import { MODEL_MODALITY_OPTIONS } from "../../options";

const taskDefaults = (): NonNullable<ModelResponse["task"]> => ({
  idPath: "/task_id",
  request: { method: "GET", path: "/tasks/{{task.id}}", headers: { Authorization: "Bearer {{auth.apiKey}}" } },
  statusPath: "/status",
  successValues: ["succeeded"],
  failureValues: ["failed"],
  intervalSeconds: 3,
});

export function ResponseEditor({
  purpose,
  onChange,
}: {
  purpose: ModelPurpose;
  onChange: (value: ModelPurpose) => void;
}) {
  const buffers = useEditorBuffers();
  if (purpose.adapter === "native")
    return (
      <p className="rounded-xl border border-border/70 bg-muted/15 p-4 text-xs leading-6 text-muted-foreground">
        对话返回由选定协议的原生适配器处理，支持流式消息、思考和工具调用。
      </p>
    );
  const response = purpose.response!;
  const prefix = `${purpose.type}-response-`;
  const update = (patch: Partial<ModelResponse>) => onChange({ ...purpose, response: { ...response, ...patch } });
  const updateTask = (patch: Partial<NonNullable<ModelResponse["task"]>>) =>
    update({ task: { ...response.task!, ...patch } });
  const updateRule = (index: number, patch: Partial<ModelOutputRule>) =>
    update({ outputs: response.outputs.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)) });
  const textInput = (label: string, value: string, onChange: (value: string) => void, placeholder?: string) => (
    <Field label={label}>
      <Input
        aria-label={label}
        className="h-8 font-mono text-xs"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </Field>
  );
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="返回方式">
          <Choice
            label="返回方式"
            value={response.mode}
            options={[
              { value: "direct", label: "直接返回结果" },
              { value: "task", label: "异步任务 · 查询结果" },
            ]}
            onChange={(mode) => {
              buffers.clear(prefix);
              const next = { ...response, mode };
              if (mode === "task") next.task = taskDefaults();
              else delete next.task;
              onChange({ ...purpose, response: next });
            }}
          />
        </Field>
        {textInput(
          "错误信息路径",
          response.errorPath ?? "",
          (value) => {
            const next = { ...response };
            if (value) next.errorPath = value;
            else delete next.errorPath;
            onChange({ ...purpose, response: next });
          },
          "/error/message",
        )}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium">输出提取规则</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs shadow-none"
          onClick={() =>
            update({
              outputs: [
                ...response.outputs,
                { type: purpose.output[0], source: purpose.output[0] === "text" ? "text" : "url", path: "/data" },
              ],
            })
          }
        >
          <Plus className="size-3.5" />
          添加输出
        </Button>
      </div>
      <div className="space-y-3">
        {response.outputs.map((rule, index) => (
          <div key={index} className="space-y-3 rounded-lg border border-border/70 p-3">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2rem] items-end gap-3">
              <Field label="输出类型">
                <Choice
                  label={`输出 ${index + 1} 类型`}
                  value={rule.type}
                  options={MODEL_MODALITY_OPTIONS.filter((option) => purpose.output.includes(option.value))}
                  onChange={(type) => updateRule(index, { type })}
                />
              </Field>
              <Field label="结果来源">
                <Choice
                  label={`输出 ${index + 1} 来源`}
                  value={rule.source}
                  options={[
                    { value: "url", label: "URL" },
                    { value: "base64", label: "Base64" },
                    { value: "text", label: "文字" },
                    { value: "json", label: "JSON" },
                  ]}
                  onChange={(source) => updateRule(index, { source })}
                />
              </Field>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground hover:text-destructive"
                disabled={response.outputs.length === 1}
                aria-label={`删除输出规则 ${index + 1}`}
                onClick={() => update({ outputs: response.outputs.filter((_, i) => i !== index) })}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {textInput(`结果路径 ${index + 1}`, rule.path, (path) => updateRule(index, { path }), "/data")}
              {textInput(
                `数组元素路径 ${index + 1}`,
                rule.itemPath ?? "",
                (value) => {
                  const next = { ...rule };
                  if (value) next.itemPath = value;
                  else delete next.itemPath;
                  update({ outputs: response.outputs.map((item, i) => (i === index ? next : item)) });
                },
                "留空表示直接使用结果",
              )}
            </div>
            {textInput(
              `文件 MIME 类型 ${index + 1}（可选）`,
              rule.mimeType ?? "",
              (value) => {
                const next = { ...rule };
                if (value) next.mimeType = value;
                else delete next.mimeType;
                update({ outputs: response.outputs.map((item, i) => (i === index ? next : item)) });
              },
              "例如 image/png",
            )}
          </div>
        ))}
      </div>
      <details className="rounded-lg border border-border/70 p-3">
        <summary className="cursor-pointer text-xs font-medium">业务状态校验（可选）</summary>
        <div className="grid gap-3 pt-3 sm:grid-cols-2">
          {textInput(
            "业务状态路径",
            response.success?.path ?? "",
            (path) => {
              const next = { ...response };
              if (path) next.success = { path, equals: response.success?.equals ?? 0 };
              else {
                delete next.success;
                buffers.clear(`${prefix}success`);
              }
              onChange({ ...purpose, response: next });
            },
            "/base_resp/status_code",
          )}
          {response.success && (
            <Field label="成功值 · JSON">
              <ParameterValue
                id={`${prefix}success`}
                label="业务状态成功值"
                type="json"
                value={response.success.equals}
                onChange={(equals) => update({ success: { ...response.success!, equals: equals ?? null } })}
              />
            </Field>
          )}
        </div>
      </details>
      {response.mode === "task" && response.task && (
        <section className="space-y-3 rounded-lg border border-border/70 p-3">
          <h3 className="text-xs font-medium">任务查询</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {textInput("创建结果中的任务 ID 路径", response.task.idPath, (idPath) => updateTask({ idPath }))}
            {textInput("查询结果中的状态路径", response.task.statusPath, (statusPath) => updateTask({ statusPath }))}
          </div>
          <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3">
            <Field label="查询方式">
              <Choice
                label="任务查询方式"
                value={response.task.request.method}
                options={[
                  { value: "GET", label: "GET" },
                  { value: "POST", label: "POST" },
                ]}
                onChange={(method) => {
                  const request = { ...response.task!.request, method };
                  if (method === "GET") {
                    delete request.body;
                    buffers.clear(`${prefix}query-body`);
                  }
                  updateTask({ request });
                }}
              />
            </Field>
            {textInput("查询路径 / 完整 URL", response.task.request.path, (path) =>
              updateTask({ request: { ...response.task!.request, path } }),
            )}
          </div>
          <details>
            <summary className="cursor-pointer text-xs text-muted-foreground">查询请求头和请求体</summary>
            <div className="space-y-3 pt-3">
              <JsonField
                id={`${prefix}query-headers`}
                label="查询请求头"
                value={response.task.request.headers}
                objectOnly
                rows={3}
                onChange={(headers) =>
                  updateTask({ request: { ...response.task!.request, headers: headers as Record<string, string> } })
                }
              />
              {response.task.request.method !== "GET" && (
                <JsonField
                  id={`${prefix}query-body`}
                  label="查询请求体"
                  value={response.task.request.body}
                  optional
                  rows={3}
                  onChange={(body) => {
                    const request: ModelRequest = { ...response.task!.request };
                    if (body === undefined) delete request.body;
                    else request.body = body;
                    updateTask({ request });
                  }}
                />
              )}
            </div>
          </details>
          <div className="grid gap-3 sm:grid-cols-2">
            <JsonField
              id={`${prefix}done`}
              label="成功状态 · JSON 数组"
              rows={2}
              value={response.task.successValues}
              onChange={(value) => updateTask({ successValues: value as JsonValue[] })}
            />
            <JsonField
              id={`${prefix}failed`}
              label="失败状态 · JSON 数组"
              rows={2}
              value={response.task.failureValues}
              onChange={(value) => updateTask({ failureValues: value as JsonValue[] })}
            />
          </div>
          <Field label="查询间隔（秒）">
            <Input
              aria-label="任务查询间隔"
              className="h-8 w-28 text-xs"
              type="number"
              min={1}
              max={3600}
              value={response.task.intervalSeconds}
              onChange={(event) => updateTask({ intervalSeconds: Number(event.currentTarget.value) })}
            />
          </Field>
        </section>
      )}
      <p className="text-[11px] leading-5 text-muted-foreground">
        路径使用 JSON Pointer；空路径表示整个值。结果为数组时会逐项提取，多条规则可同时返回不同类型。
      </p>
    </div>
  );
}
