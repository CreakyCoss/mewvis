import { Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import type { ModelPurpose, ModelResponse, ModelOutputRule, JsonValue, ModelRequest } from "@mewvis/chat-contracts";
import { Button } from "design-system/components/ui/button";
import { Input } from "design-system/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "design-system/components/ui/popover";
import { ConfirmDelete } from "../confirm-delete";
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
      <p className="py-2 text-xs leading-6 text-muted-foreground">
        对话协议自动处理流式消息、思考和工具调用，无需配置提取规则。
      </p>
    );
  const response = purpose.response!;
  const prefix = `${purpose.type}-response-`;
  const update = (patch: Partial<ModelResponse>) => onChange({ ...purpose, response: { ...response, ...patch } });
  const updateTask = (patch: Partial<NonNullable<ModelResponse["task"]>>) =>
    update({ task: { ...response.task!, ...patch } });
  const updateRule = (index: number, patch: Partial<ModelOutputRule>) =>
    update({ outputs: response.outputs.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)) });
  const optionalRuleField = (index: number, key: "itemPath" | "mimeType", value: string) => {
    const next = { ...response.outputs[index] };
    if (value) next[key] = value;
    else delete next[key];
    update({ outputs: response.outputs.map((rule, i) => (i === index ? next : rule)) });
  };
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
    <div className="space-y-5">
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
        {response.mode === "task" && response.task && (
          <Field label="查询间隔（秒）">
            <Input
              aria-label="任务查询间隔"
              className="h-8 text-xs"
              type="number"
              min={1}
              max={3600}
              value={response.task.intervalSeconds}
              onChange={(event) => updateTask({ intervalSeconds: Number(event.currentTarget.value) })}
            />
          </Field>
        )}
      </div>
      {response.mode === "task" && response.task && (
        <section className="space-y-3 border-t border-border/60 pt-4" aria-label="任务查询">
          <h3 className="text-xs font-medium">任务查询</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {textInput("任务 ID 路径", response.task.idPath, (idPath) => updateTask({ idPath }), "/task_id")}
            {textInput("任务状态路径", response.task.statusPath, (statusPath) => updateTask({ statusPath }), "/status")}
          </div>
          <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-3">
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
          <div className="grid gap-3 sm:grid-cols-2">
            {(["successValues", "failureValues"] as const).map((key) => (
              <Field key={key} label={key === "successValues" ? "成功状态" : "失败状态"}>
                <ParameterValue
                  id={`${prefix}${key === "successValues" ? "done" : "failed"}`}
                  label={key === "successValues" ? "成功状态 · JSON 数组" : "失败状态 · JSON 数组"}
                  type="json"
                  value={response.task![key]}
                  onChange={(value) => updateTask({ [key]: (value ?? []) as JsonValue[] })}
                />
              </Field>
            ))}
          </div>
          <details>
            <summary className="cursor-pointer text-[11px] text-muted-foreground">查询请求头和请求体</summary>
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
          <details>
            <summary className="cursor-pointer text-[11px] text-muted-foreground">
              完成后获取产物{response.task.resultRequest ? " · 已配置" : "（可选）"}
            </summary>
            <div className="space-y-3 pt-3">
              <p className="text-[11px] leading-5 text-muted-foreground">
                任务完成后再请求一次 JSON。可用 {"{{result.file_id}}"} 引用成功查询的返回值，输出规则从此请求的返回中提取。
              </p>
              {response.task.resultRequest ? (
                <>
                  <JsonField
                    id={`${prefix}result-request`}
                    label="产物获取请求"
                    value={response.task.resultRequest}
                    objectOnly
                    rows={6}
                    onChange={(value) => updateTask({ resultRequest: value as unknown as ModelRequest })}
                  />
                  <ConfirmDelete
                    title="删除产物获取请求？"
                    description="任务完成后将直接从查询结果中提取输出。"
                    onConfirm={() => {
                      const task = { ...response.task! };
                      delete task.resultRequest;
                      buffers.clear(`${prefix}result-request`);
                      update({ task });
                    }}
                  >
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive">
                      <Trash2 className="size-3.5" />删除请求
                    </Button>
                  </ConfirmDelete>
                </>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => updateTask({ resultRequest: {
                    method: "GET",
                    path: "/files/{{result.id}}",
                    headers: { Authorization: "Bearer {{auth.apiKey}}" },
                  } })}
                >
                  <Plus className="size-3.5" />添加请求
                </Button>
              )}
            </div>
          </details>
        </section>
      )}
      <section className="space-y-2" aria-label="输出提取规则">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xs font-medium">输出提取规则</h3>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground"
            onClick={() =>
              update({
                outputs: [
                  ...response.outputs,
                  {
                    type: purpose.output[0],
                    source: purpose.output[0] === "text" ? "text" : "url",
                    path: "/data",
                  },
                ],
              })
            }
          >
            <Plus className="size-3.5" />
            添加输出
          </Button>
        </div>
        <div className="border-y border-border/60">
          <div className="hidden grid-cols-[5rem_6rem_minmax(0,1fr)_1.75rem_1.75rem] gap-2 border-b border-border/50 py-2 text-[11px] text-muted-foreground sm:grid">
            <span>类型</span>
            <span>来源</span>
            <span>结果路径</span>
            <span />
            <span />
          </div>
          {response.outputs.map((rule, index) => (
            <div
              key={index}
              className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_1.75rem_1.75rem] items-end gap-2 border-b border-border/50 py-3 last:border-b-0 sm:grid-cols-[5rem_6rem_minmax(0,1fr)_1.75rem_1.75rem] sm:items-center sm:py-2.5"
            >
              <div className="min-w-0 space-y-1">
                <span className="text-[11px] text-muted-foreground sm:hidden">类型</span>
                {purpose.output.length === 1 && purpose.output.includes(rule.type) ? (
                  <span className="flex h-8 items-center text-xs">
                    {MODEL_MODALITY_OPTIONS.find((option) => option.value === rule.type)?.label}
                  </span>
                ) : (
                  <Choice
                    label={`输出 ${index + 1} 类型`}
                    value={rule.type}
                    options={MODEL_MODALITY_OPTIONS.filter(
                      (option) => purpose.output.includes(option.value) || option.value === rule.type,
                    ).map((option) => ({
                      ...option,
                      label: purpose.output.includes(option.value) ? option.label : `${option.label}（未启用）`,
                    }))}
                    onChange={(type) => updateRule(index, { type })}
                  />
                )}
              </div>
              <div className="min-w-0 space-y-1">
                <span className="text-[11px] text-muted-foreground sm:hidden">来源</span>
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
              </div>
              <div className="col-span-4 row-start-2 min-w-0 space-y-1 sm:col-span-1 sm:row-start-auto">
                <span className="text-[11px] text-muted-foreground sm:hidden">结果路径</span>
                <Input
                  aria-label={`结果路径 ${index + 1}`}
                  className="h-8 font-mono text-xs"
                  placeholder="/data/0/url"
                  value={rule.path}
                  onChange={(event) => updateRule(index, { path: event.currentTarget.value })}
                />
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="col-start-3 row-start-1 size-7 text-muted-foreground sm:col-start-auto sm:row-start-auto"
                    aria-label={`输出规则 ${index + 1}高级设置`}
                  >
                    <SlidersHorizontal className="size-3.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  side="bottom"
                  align="end"
                  sideOffset={6}
                  collisionPadding={16}
                  className="z-80 w-72 max-w-[calc(100vw-2rem)] gap-3 rounded-lg p-3"
                  aria-label={`输出规则 ${index + 1}高级设置`}
                >
                  <h4 className="text-xs font-medium">提取设置</h4>
                  {textInput(
                    `数组元素路径 ${index + 1}`,
                    rule.itemPath ?? "",
                    (value) => optionalRuleField(index, "itemPath", value),
                    "/url",
                  )}
                  {textInput(
                    `文件 MIME 类型 ${index + 1}`,
                    rule.mimeType ?? "",
                    (value) => optionalRuleField(index, "mimeType", value),
                    "image/png",
                  )}
                </PopoverContent>
              </Popover>
              <ConfirmDelete
                title={`删除输出规则 ${index + 1}？`}
                description="此规则将从当前用途的返回处理中移除。"
                onConfirm={() => update({ outputs: response.outputs.filter((_, i) => i !== index) })}
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="col-start-4 row-start-1 size-7 text-muted-foreground hover:text-destructive sm:col-start-auto sm:row-start-auto"
                  disabled={response.outputs.length === 1}
                  aria-label={`删除输出规则 ${index + 1}`}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </ConfirmDelete>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">路径使用 JSON Pointer，例如 /data/0/url。</p>
      </section>
      <details className="border-t border-border/60 pt-3">
        <summary className="cursor-pointer text-xs font-medium">业务状态与错误</summary>
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
      </details>
    </div>
  );
}
