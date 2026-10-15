import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import type { ModelConnection, ModelPurpose } from "@mewvis/chat-contracts";
import type { LlmProviderConfig, ProviderModelConfig } from "@/agent-client/runtime-model";
import { Button } from "design-system/components/ui/button";
import { Checkbox } from "design-system/components/ui/checkbox";
import { Input } from "design-system/components/ui/input";
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
  const [visibleKey, setVisibleKey] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const connection = purpose.connection;
  const connectionEditable =
    editing[purpose.type] ?? (Boolean(Object.keys(connection ?? {}).length) || purpose.modelId !== undefined);
  const updateConnection = (key: keyof ModelConnection, value: string) => {
    const next = { ...purpose };
    const overrides = { ...connection };
    if (value.trim()) Object.assign(overrides, { [key]: value.trim() });
    else delete overrides[key];
    if (Object.keys(overrides).length) next.connection = overrides;
    else delete next.connection;
    onChange(next);
  };
  return (
    <section className="space-y-3" aria-label="用途连接设置">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-medium">连接设置</h3>
        <label className="flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground">
          <Checkbox
            checked={!connectionEditable}
            onCheckedChange={(checked) => {
              setEditing((current) => ({ ...current, [purpose.type]: checked !== true }));
              setVisibleKey(null);
              if (checked === true) {
                const next = { ...purpose };
                delete next.connection;
                delete next.modelId;
                onChange(next);
              }
            }}
          />
          继承 Provider
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="请求地址">
          <Input
            aria-label="用途请求地址"
            className="h-8 font-mono text-xs"
            placeholder={provider.apiEndpoint || "https://api.example.com"}
            value={connection?.apiEndpoint ?? ""}
            disabled={!connectionEditable}
            onChange={(event) => updateConnection("apiEndpoint", event.currentTarget.value)}
          />
        </Field>
        <Field label="API Key">
          <div className="relative">
            <Input
              aria-label="用途 API Key"
              type={visibleKey === purpose.type ? "text" : "password"}
              autoComplete="new-password"
              className="h-8 pr-9 font-mono text-xs"
              placeholder="API Key"
              value={connection?.apiKey ?? ""}
              disabled={!connectionEditable}
              onChange={(event) => updateConnection("apiKey", event.currentTarget.value)}
            />
            {connection?.apiKey && (
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
        <Field label={purpose.adapter === "native" ? "对话协议" : "调用方式"}>
          {purpose.adapter === "native" && connectionEditable ? (
            <Choice
              label="用途协议"
              value={connection?.apiFormat ?? ""}
              options={[
                { value: "", label: `${editorPresets.getApiFormatLabel(provider.apiFormat)}（默认）` },
                ...editorPresets.protocols.filter((protocol) => protocol.value !== "http-json"),
              ]}
              onChange={(value) => updateConnection("apiFormat", value)}
            />
          ) : (
            <Input
              className="h-8 text-xs"
              aria-label={purpose.adapter === "native" ? "用途协议" : "用途调用方式"}
              value={purpose.adapter === "native" ? editorPresets.getApiFormatLabel(provider.apiFormat) : "HTTP / JSON"}
              disabled={!connectionEditable}
              readOnly
            />
          )}
        </Field>
        <div className="space-y-1.5">
          <Label htmlFor={`${model.id}-${purpose.type}-request-model`} className="text-xs">
            请求模型 ID
          </Label>
          <Input
            id={`${model.id}-${purpose.type}-request-model`}
            aria-label="用途请求模型 ID"
            className="h-8 font-mono text-xs"
            value={purpose.modelId ?? ""}
            placeholder={model.modelId}
            disabled={!connectionEditable}
            onChange={(event) => {
              const next = { ...purpose };
              const value = event.currentTarget.value.trim();
              if (value) next.modelId = value;
              else delete next.modelId;
              onChange(next);
            }}
          />
        </div>
      </div>
    </section>
  );
}
