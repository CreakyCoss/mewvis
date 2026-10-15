import { useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import type { ModelConnection, ModelPurpose } from "@mewvis/chat-contracts";
import { getModelConnection, type LlmProviderConfig, type ProviderModelConfig } from "@/agent-client/runtime-model";
import { Button } from "design-system/components/ui/button";
import { Checkbox } from "design-system/components/ui/checkbox";
import { Input } from "design-system/components/ui/input";
import { RadioGroup, RadioGroupItem } from "design-system/components/ui/radio-group";
import { Label } from "design-system/components/ui/label";
import { editorPresets } from "../presets";
import { Choice, Field } from "./fields";

export function PurposeConnection({
  provider,
  model,
  purpose,
  onChange,
}: {
  provider: LlmProviderConfig;
  model: ProviderModelConfig;
  purpose: ModelPurpose;
  onChange: (purpose: ModelPurpose) => void;
}) {
  const connections = useRef(new Map<string, ModelConnection>());
  const modelIds = useRef(new Map<string, string>());
  const [visibleKey, setVisibleKey] = useState<string | null>(null);
  const connection = purpose.connection;
  const resolved = getModelConnection(provider, model, purpose.type);
  const id = `${model.id}-${purpose.type}`;
  const updateConnection = (patch: Partial<ModelConnection>) =>
    onChange({ ...purpose, connection: { ...connection!, ...patch } });
  return (
    <section className="space-y-3" aria-label="用途连接设置">
      <details key={purpose.type} className="rounded-lg border border-border/70 px-3 py-2.5">
        <summary className="cursor-pointer text-xs font-medium">
          连接设置
          <span className="ml-2 font-normal text-muted-foreground">
            {connection ? "此用途单独配置" : "继承 Provider"}
          </span>
        </summary>
        <div className="space-y-3 pt-3">
          <RadioGroup
            className="flex flex-wrap gap-x-5 gap-y-2"
            aria-label="连接来源"
            value={connection ? "custom" : "provider"}
            onValueChange={(source) => {
              setVisibleKey(null);
              if (source === "provider") {
                connections.current.set(purpose.type, structuredClone(connection!));
                const next = { ...purpose };
                delete next.connection;
                onChange(next);
              } else {
                const previous = connections.current.get(purpose.type);
                onChange({
                  ...purpose,
                  connection: {
                    apiEndpoint: previous?.apiEndpoint ?? provider.apiEndpoint,
                    apiKey: previous?.apiKey ?? "",
                    apiFormat:
                      purpose.adapter === "http-json"
                        ? "http-json"
                        : previous?.apiFormat && previous.apiFormat !== "http-json"
                          ? previous.apiFormat
                          : provider.apiFormat,
                  },
                });
              }
            }}
          >
            {(
              [
                { value: "provider", label: "继承 Provider" },
                { value: "custom", label: "单独配置" },
              ] as const
            ).map((option) => (
              <div key={option.value} className="flex items-center gap-2">
                <RadioGroupItem id={`${id}-${option.value}`} value={option.value} />
                <Label htmlFor={`${id}-${option.value}`} className="cursor-pointer text-xs font-normal">
                  {option.label}
                </Label>
              </div>
            ))}
          </RadioGroup>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="请求地址">
              <Input
                aria-label="用途请求地址"
                className="h-8 font-mono text-xs"
                placeholder={provider.apiEndpoint || "https://api.example.com"}
                value={connection ? connection.apiEndpoint : resolved.apiEndpoint}
                readOnly={!connection}
                onChange={(event) => updateConnection({ apiEndpoint: event.currentTarget.value.trim() })}
              />
            </Field>
            <Field
              label="API Key（可选）"
              hint={connection ? "只使用此处的凭据，留空不携带 Provider Key。" : "继承 Provider 中保存的凭据。"}
            >
              <div className="relative">
                <Input
                  aria-label="用途 API Key"
                  type={visibleKey === purpose.type ? "text" : "password"}
                  autoComplete="new-password"
                  className={`h-8 font-mono text-xs ${connection ? "pr-9" : ""}`}
                  placeholder={connection ? "输入此用途的 API Key" : provider.apiKey ? "使用 Provider Key" : "未设置"}
                  value={connection?.apiKey ?? ""}
                  readOnly={!connection}
                  onChange={(event) => updateConnection({ apiKey: event.currentTarget.value.trim() })}
                />
                {connection && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute top-0 right-0 size-8 text-muted-foreground"
                    aria-label={visibleKey === purpose.type ? "隐藏 API Key" : "显示 API Key"}
                    onClick={() => setVisibleKey(visibleKey === purpose.type ? null : purpose.type)}
                  >
                    {visibleKey === purpose.type ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </Button>
                )}
              </div>
            </Field>
            <div className="sm:col-span-2">
              <Field label={purpose.adapter === "native" ? "对话协议" : "调用方式"}>
                {purpose.adapter === "native" && connection ? (
                  <Choice
                    label="用途协议"
                    value={connection.apiFormat}
                    options={editorPresets.protocols.filter((protocol) => protocol.value !== "http-json")}
                    onChange={(apiFormat) => updateConnection({ apiFormat })}
                  />
                ) : (
                  <Input
                    className="h-8 text-xs"
                    aria-label={purpose.adapter === "native" ? "用途协议" : "用途调用方式"}
                    value={
                      purpose.adapter === "native"
                        ? `继承 Provider · ${editorPresets.getApiFormatLabel(resolved.apiFormat)}`
                        : "HTTP / JSON"
                    }
                    readOnly
                  />
                )}
              </Field>
            </div>
          </div>
        </div>
      </details>
      <div className="space-y-2 pt-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor={`${id}-request-model`} className="text-xs font-medium">
            请求模型 ID
          </Label>
          <label className="flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground">
            <Checkbox
              checked={purpose.modelId === undefined}
              onCheckedChange={(checked) => {
                const next = { ...purpose };
                if (checked) {
                  modelIds.current.set(purpose.type, purpose.modelId!);
                  delete next.modelId;
                } else next.modelId = modelIds.current.get(purpose.type) ?? model.modelId;
                onChange(next);
              }}
            />
            使用顶部模型 ID
          </label>
        </div>
        <Input
          id={`${id}-request-model`}
          aria-label="用途请求模型 ID"
          className="h-8 font-mono text-xs read-only:bg-muted/20"
          value={purpose.modelId ?? model.modelId}
          readOnly={purpose.modelId === undefined}
          placeholder="输入此用途实际调用的模型 ID"
          onChange={(event) => onChange({ ...purpose, modelId: event.currentTarget.value })}
        />
      </div>
    </section>
  );
}
