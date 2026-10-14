import { getModelThinking, type LlmProviderConfig, type ProviderModelConfig } from "@/agent-client/runtime-model";
import { Input } from "design-system/components/ui/input";
import { Switch } from "design-system/components/ui/switch";
import { Button } from "design-system/components/ui/button";
import { ThinkingLevelsEditor } from "../thinking-levels";
import { Choice, Field } from "./fields";
import { editorPresets } from "../presets";

export function ChatParameters({
  provider,
  model,
  onChange,
}: {
  provider: LlmProviderConfig;
  model: ProviderModelConfig;
  onChange: (value: ProviderModelConfig) => void;
}) {
  const thinking = getModelThinking(provider, model);
  const format = model.configuration?.connection.apiFormat;
  const editorDefaults = editorPresets.createModelDefaults({
    ...provider,
    apiFormat: format && format !== "http-json" ? format : provider.apiFormat,
  });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-medium">对话默认参数</h3>
        {model.limits && (
          <Button
            type="button"
            variant="ghost"
            className="h-7 text-xs text-muted-foreground"
            onClick={() => onChange({ ...model, limits: editorDefaults.limits })}
          >
            恢复基础限制
          </Button>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {(["contextWindow", "maxTokens"] as const).map((key) => (
          <Field key={key} label={key === "contextWindow" ? "上下文窗口 · tokens" : "最大输出 · tokens"}>
            <Input
              aria-label={key === "contextWindow" ? "上下文窗口" : "最大输出"}
              className="h-8 text-xs"
              type="number"
              min={1}
              max={2147483647}
              value={model.limits?.[key] ?? ""}
              placeholder={`默认 ${editorDefaults.limits[key].toLocaleString()}`}
              onChange={(event) => {
                const next = { ...model.limits };
                if (event.currentTarget.value) next[key] = Number(event.currentTarget.value);
                else delete next[key];
                onChange({ ...model, limits: Object.keys(next).length ? next : null });
              }}
            />
          </Field>
        ))}
      </div>
      {thinking && (
        <Field label="默认思考等级">
          <Choice
            label="默认思考等级"
            value={
              thinking.levels.some((level) => level.value === thinking.defaultLevel)
                ? thinking.defaultLevel!
                : "inherit"
            }
            options={[
              { value: "inherit", label: "服务默认" },
              ...thinking.levels.map((level) => ({ value: level.value, label: level.label || level.value })),
            ]}
            onChange={(value) =>
              onChange({
                ...model,
                thinking: { levels: thinking.levels, defaultLevel: value === "inherit" ? null : value },
              })
            }
          />
        </Field>
      )}
      <details className="rounded-lg border border-border/70 p-3">
        <summary className="cursor-pointer text-xs font-medium">思考等级与兼容设置</summary>
        <div className="space-y-4 pt-3">
          {model.configuration?.purposes.find((purpose) => purpose.type === "chat")?.reasoning && (
            <ThinkingLevelsEditor
              id={model.id}
              value={thinking}
              onChange={(thinking) => onChange({ ...model, thinking: thinking ?? editorDefaults.thinking })}
            />
          )}
          <label className="flex items-center justify-between gap-4 text-xs">
            <span>
              1M 请求标记{" "}
              <span className="block pt-1 text-[11px] text-muted-foreground">
                给模型 ID 添加 [1m] 后缀，仅用于支持此标记的服务。
              </span>
            </span>
            <Switch
              checked={model.isOneMillionContext}
              onCheckedChange={(isOneMillionContext) => onChange({ ...model, isOneMillionContext })}
            />
          </label>
        </div>
      </details>
    </div>
  );
}
