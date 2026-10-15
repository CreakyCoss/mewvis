import { useState } from "react";
import type { JsonValue, ModelPurpose } from "@mewvis/chat-contracts";
import { parseModelResponse, previewModelRequest } from "@mewvis/chat-contracts/model-configuration";
import { editorPresets } from "../presets";
import {
  createRuntimeModelInput,
  getModelConnection,
  type LlmProviderConfig,
  type ProviderModelConfig,
} from "@/agent-client/runtime-model";
import { Textarea } from "design-system/components/ui/textarea";
import { Button } from "design-system/components/ui/button";
import { Input } from "design-system/components/ui/input";
import { Choice, Field, pretty } from "./fields";

export function CallPreview({
  purpose,
  provider,
  model,
}: {
  purpose: ModelPurpose;
  provider: LlmProviderConfig;
  model: ProviderModelConfig;
}) {
  const preset = editorPresets.getTemplate(purpose.preset?.id);
  const [input, setInput] = useState(() => pretty(preset?.sampleInput ?? editorPresets.sampleInput));
  const [overrides, setOverrides] = useState("{}");
  const [sample, setSample] = useState("{}");
  const [phase, setPhase] = useState<"initial" | "result">("initial");
  const [taskId, setTaskId] = useState("example-task-id");
  const [result, setResult] = useState("");
  const [responseError, setResponseError] = useState("");
  const connection = getModelConnection(provider, model, purpose.type);
  let preview = "";
  let error = "";
  try {
    const native = purpose.adapter === "native" ? createRuntimeModelInput(provider, model) : null;
    if (native?.apiEndpoint) {
      const url = new URL(native.apiEndpoint);
      for (const key of [...url.searchParams.keys()])
        if (/key|token|secret|password/i.test(key)) url.searchParams.set(key, "••••••••");
      native.apiEndpoint = url.toString();
    }
    preview = pretty(
      native
        ? { ...native, apiKey: "••••••••", headers: undefined, configuration: undefined }
        : previewModelRequest(purpose, {
            modelId: purpose.modelId?.trim() || model.modelId,
            apiEndpoint: connection.apiEndpoint ?? "",
            input: JSON.parse(input) as JsonValue,
            overrides: JSON.parse(overrides),
            phase,
            taskId,
          }),
    );
  } catch (e) {
    error = e instanceof Error ? e.message : "预览配置无效";
  }
  return (
    <div className="space-y-4">
      <p className="rounded-lg border border-primary/15 bg-primary/5 px-3 py-2 text-[11px] leading-5 text-muted-foreground">
        预览只在本地组合数据，凭据已遮盖。输入和返回样例不会保存，也不会发出 API 请求。
      </p>
      {purpose.adapter === "http-json" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="应用输入 · JSON">
            <Textarea
              aria-label="预览应用输入"
              className="min-h-32 font-mono text-xs leading-5"
              spellCheck={false}
              value={input}
              onChange={(event) => setInput(event.currentTarget.value)}
            />
          </Field>
          <Field label="调用参数覆盖 · JSON">
            <Textarea
              aria-label="预览调用参数覆盖"
              className="min-h-32 font-mono text-xs leading-5"
              spellCheck={false}
              value={overrides}
              onChange={(event) => setOverrides(event.currentTarget.value)}
            />
          </Field>
        </div>
      )}
      {purpose.response?.mode === "task" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="任务阶段">
            <Choice
              label="任务预览阶段"
              value={phase}
              options={[
                { value: "initial", label: "创建任务" },
                { value: "result", label: "查询任务" },
              ]}
              onChange={setPhase}
            />
          </Field>
          {phase === "result" && (
            <Field label="任务 ID">
              <Input
                aria-label="预览任务 ID"
                className="h-8 font-mono text-xs"
                value={taskId}
                onChange={(event) => setTaskId(event.currentTarget.value)}
              />
            </Field>
          )}
        </div>
      )}
      <Field label={purpose.adapter === "native" ? "对话运行时配置" : "组合后的请求"}>
        <pre className="max-h-80 overflow-auto rounded-lg border border-border/70 bg-muted/20 p-3 font-mono text-[11px] leading-5 whitespace-pre-wrap break-all">
          {error || preview}
        </pre>
      </Field>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      {purpose.adapter === "http-json" && (
        <section className="space-y-3 border-t border-border/70 pt-4">
          <h3 className="text-xs font-medium">返回样例解析</h3>
          <Textarea
            aria-label="返回 JSON 样例"
            className="min-h-28 font-mono text-xs leading-5"
            spellCheck={false}
            value={sample}
            onChange={(event) => setSample(event.currentTarget.value)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs shadow-none"
            onClick={() => {
              try {
                setResult(pretty(parseModelResponse(purpose, JSON.parse(sample), phase)));
                setResponseError("");
              } catch (e) {
                setResult("");
                setResponseError(e instanceof Error ? e.message : "返回样例无效");
              }
            }}
          >
            解析样例
          </Button>
          {responseError && (
            <p className="text-xs text-destructive" role="alert">
              {responseError}
            </p>
          )}
          {result && (
            <pre className="max-h-60 overflow-auto rounded-lg border border-border/70 bg-muted/20 p-3 font-mono text-[11px] leading-5 whitespace-pre-wrap break-all">
              {result}
            </pre>
          )}
        </section>
      )}
    </div>
  );
}
