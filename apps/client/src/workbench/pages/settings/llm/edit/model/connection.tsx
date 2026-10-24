import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import type { ModelConnection, ModelPurpose } from "@mewvis/chat-contracts";
import type { LlmProviderConfig } from "@/agent-client/runtime-model";
import { Button } from "design-system/components/ui/button";
import { Input } from "design-system/components/ui/input";
import { editorPresets } from "../presets";
import { Choice, Field } from "./fields";

export function PurposeConnection({
  provider,
  purpose,
  onChange,
}: {
  provider: LlmProviderConfig;
  purpose: ModelPurpose;
  onChange: (purpose: ModelPurpose) => void;
}) {
  const [visibleKey, setVisibleKey] = useState(false);
  const connection = purpose.connection;
  const owner = editorPresets.getTemplate(purpose.preset?.id)?.providerId;
  const foreignSupplier =
    owner && owner !== editorPresets.getProvider(provider.provider)?.id ? editorPresets.getProvider(owner) : undefined;
  const apiKeyPlaceholder = foreignSupplier
    ? `填写 ${foreignSupplier.label} API Key`
    : connection?.apiKey === ""
      ? "未配置 API Key"
      : provider.apiKey.trim()
        ? "沿用 Provider Key（已配置）"
        : "Provider 未配置 API Key";
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
    <section className="grid gap-3 sm:grid-cols-2" aria-label="用途连接设置">
      <Field
        label="请求地址"
        labelAction={
          foreignSupplier && (
            <span className="text-xs text-destructive" aria-hidden="true">
              *
            </span>
          )
        }
      >
        <Input
          aria-label="用途请求地址"
          className="h-8 font-mono text-xs"
          placeholder={foreignSupplier ? "填写请求地址" : provider.apiEndpoint || "https://api.example.com"}
          value={connection?.apiEndpoint ?? ""}
          aria-required={Boolean(foreignSupplier)}
          onChange={(event) => updateConnection("apiEndpoint", event.currentTarget.value)}
        />
      </Field>
      <Field
        label="API Key"
        labelAction={
          foreignSupplier && (
            <span className="text-xs text-destructive" aria-hidden="true">
              *
            </span>
          )
        }
      >
        <div className="relative">
          <Input
            aria-label="用途 API Key"
            type={visibleKey ? "text" : "password"}
            autoComplete="new-password"
            className="h-8 pr-9 font-mono text-xs"
            placeholder={apiKeyPlaceholder}
            value={connection?.apiKey ?? ""}
            aria-required={Boolean(foreignSupplier)}
            onChange={(event) => updateConnection("apiKey", event.currentTarget.value)}
          />
          {connection?.apiKey && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute top-0 right-0 size-8 text-muted-foreground"
              aria-label={visibleKey ? "隐藏 API Key" : "显示 API Key"}
              onClick={() => setVisibleKey(!visibleKey)}
            >
              {visibleKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            </Button>
          )}
        </div>
      </Field>
      {purpose.adapter === "native" && (
        <Field label="对话协议">
          <Choice
            label="用途协议"
            value={connection?.apiFormat ?? ""}
            options={[
              { value: "", label: `沿用 Provider（${editorPresets.getApiFormatLabel(provider.apiFormat)}）` },
              ...editorPresets.protocols.filter((protocol) => protocol.value !== "http-json"),
            ]}
            onChange={(value) => updateConnection("apiFormat", value)}
          />
        </Field>
      )}
    </section>
  );
}
