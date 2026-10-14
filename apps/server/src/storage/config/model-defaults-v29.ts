// Frozen compatibility data for upgrading configurations created before schema v30.
// This is not a live model catalog and must not be used by editing or execution.
import type { DatabaseSync } from "node:sqlite";
import type {
  RuntimeModelCapabilities,
  RuntimeModelLimits,
  RuntimeModelThinking,
} from "@mewvis/chat-contracts";

type PreviousDefaults = {
  limits: RuntimeModelLimits;
  capabilities: RuntimeModelCapabilities;
  capabilitiesByApi: Record<string, RuntimeModelCapabilities>;
  thinkingByApi: Record<string, RuntimeModelThinking>;
};
const previousChat = (
  input: RuntimeModelCapabilities["input"],
  reasoning: boolean,
): RuntimeModelCapabilities => ({
  operations: ["chat"],
  input,
  output: ["text"],
  reasoning,
  toolCalling: true,
});
const previousThinking1: RuntimeModelThinking = {
  levels: [
    { value: "off", label: "关闭" },
    { value: "low", label: "低" },
    { value: "high", label: "高" },
    { value: "max", label: "最高" },
  ],
  defaultLevel: "high",
};
const previousThinking2: RuntimeModelThinking = {
  levels: [
    { value: "low", label: "低" },
    { value: "medium", label: "中" },
    { value: "high", label: "高" },
    { value: "xhigh", label: "极高" },
    { value: "max", label: "最高" },
  ],
  defaultLevel: "high",
};

const defaultsV29: Record<string, PreviousDefaults> = {
  "deepseek:deepseek-flash": {
    limits: { contextWindow: 1000000, maxTokens: 393216 },
    capabilities: previousChat(["text", "image"], true),
    capabilitiesByApi: {
      "openai-completions": previousChat(["text", "image"], true),
    },
    thinkingByApi: { "openai-completions": previousThinking1 },
  },
  "deepseek:deepseek-v4-pro": {
    limits: { contextWindow: 1000000, maxTokens: 393216 },
    capabilities: previousChat(["text"], true),
    capabilitiesByApi: { "openai-completions": previousChat(["text"], true) },
    thinkingByApi: { "openai-completions": previousThinking1 },
  },
  "minimax-cn:MiniMax-M3": {
    limits: { contextWindow: 1000000, maxTokens: 512000 },
    capabilities: previousChat(["text", "image"], true),
    capabilitiesByApi: {
      "anthropic-messages": previousChat(["text", "image", "video"], true),
      "openai-completions": previousChat(["text", "image", "video"], true),
    },
    thinkingByApi: {},
  },
  "minimax-cn:MiniMax-M2.7": {
    limits: { contextWindow: 204800, maxTokens: 131072 },
    capabilities: previousChat(["text"], true),
    capabilitiesByApi: {},
    thinkingByApi: {},
  },
  "minimax-cn:MiniMax-M2.7-highspeed": {
    limits: { contextWindow: 204800, maxTokens: 131072 },
    capabilities: previousChat(["text"], true),
    capabilitiesByApi: {},
    thinkingByApi: {},
  },
  "moonshotai-cn:kimi-k3": {
    limits: { contextWindow: 1048576, maxTokens: 1048576 },
    capabilities: previousChat(["text", "image"], true),
    capabilitiesByApi: {},
    thinkingByApi: {},
  },
  "moonshotai-cn:kimi-k2.7-code": {
    limits: { contextWindow: 262144, maxTokens: 262144 },
    capabilities: previousChat(["text", "image"], true),
    capabilitiesByApi: {},
    thinkingByApi: {},
  },
  "moonshotai-cn:kimi-k2.7-code-highspeed": {
    limits: { contextWindow: 262144, maxTokens: 262144 },
    capabilities: previousChat(["text", "image"], true),
    capabilitiesByApi: {},
    thinkingByApi: {},
  },
  "moonshotai-cn:kimi-k2.6": {
    limits: { contextWindow: 262144, maxTokens: 262144 },
    capabilities: previousChat(["text", "image"], true),
    capabilitiesByApi: {},
    thinkingByApi: {},
  },
  "openai:gpt-6-astra": {
    limits: { contextWindow: 1050000, maxTokens: 128000 },
    capabilities: previousChat(["text", "image"], true),
    capabilitiesByApi: {
      "openai-responses": previousChat(["text", "image"], true),
      "openai-completions": previousChat(["text", "image"], true),
    },
    thinkingByApi: {
      "openai-responses": previousThinking2,
      "openai-completions": previousThinking2,
    },
  },
  "openai:gpt-6.1-sol": {
    limits: { contextWindow: 1050000, maxTokens: 128000 },
    capabilities: previousChat(["text", "image"], true),
    capabilitiesByApi: {},
    thinkingByApi: {},
  },
  "openai:gpt-6-luna": {
    limits: { contextWindow: 1050000, maxTokens: 128000 },
    capabilities: previousChat(["text", "image"], true),
    capabilitiesByApi: {},
    thinkingByApi: {},
  },
  "openai:gpt-5.6-sol": {
    limits: { contextWindow: 1050000, maxTokens: 128000 },
    capabilities: previousChat(["text", "image"], true),
    capabilitiesByApi: {},
    thinkingByApi: {},
  },
  "xiaomi:mimo-v2.6-pro": {
    limits: { contextWindow: 1048576, maxTokens: 131072 },
    capabilities: previousChat(["text", "image"], true),
    capabilitiesByApi: {},
    thinkingByApi: {},
  },
  "xiaomi:mimo-v2.6-flash": {
    limits: { contextWindow: 1048576, maxTokens: 131072 },
    capabilities: previousChat(["text", "image"], true),
    capabilitiesByApi: {},
    thinkingByApi: {},
  },
  "xiaomi:mimo-v2.6-pro-ultraspeed": {
    limits: { contextWindow: 1048576, maxTokens: 131072 },
    capabilities: previousChat(["text", "image"], true),
    capabilitiesByApi: {},
    thinkingByApi: {},
  },
  "xiaomi:mimo-v2.5-pro": {
    limits: { contextWindow: 1048576, maxTokens: 131072 },
    capabilities: previousChat(["text"], true),
    capabilitiesByApi: {},
    thinkingByApi: {},
  },
  "xiaomi:mimo-v2.5": {
    limits: { contextWindow: 1048576, maxTokens: 131072 },
    capabilities: previousChat(["text", "image"], true),
    capabilitiesByApi: {},
    thinkingByApi: {},
  },
  "zhipuai:glm-5.3": {
    limits: { contextWindow: 1000000, maxTokens: 131072 },
    capabilities: previousChat(["text"], true),
    capabilitiesByApi: {},
    thinkingByApi: {},
  },
  "zhipuai:glm-5.3-flash": {
    limits: { contextWindow: 1000000, maxTokens: 131072 },
    capabilities: previousChat(["text", "image"], true),
    capabilitiesByApi: {},
    thinkingByApi: {},
  },
  "zhipuai:glm-5.3-flashx": {
    limits: { contextWindow: 1000000, maxTokens: 131072 },
    capabilities: previousChat(["text", "image"], true),
    capabilitiesByApi: {},
    thinkingByApi: {},
  },
  "zhipuai:glm-4.7-flash": {
    limits: { contextWindow: 200000, maxTokens: 131072 },
    capabilities: previousChat(["text"], true),
    capabilitiesByApi: {},
    thinkingByApi: {},
  },
};

export function materializePreviousModelDefaults(db: DatabaseSync) {
  const rows = db
    .prepare(
      `SELECT m.id, p.provider, p.api_format AS apiFormat, m.model_id AS modelId, m.configuration_json AS configuration, m.capabilities_json AS capabilities, m.limits_json AS limits, m.thinking_json AS thinking FROM provider_models m JOIN llm_providers p ON p.id = m.provider_id`,
    )
    .all();
  const update = db.prepare(
    "UPDATE provider_models SET capabilities_json = ?, limits_json = ?, thinking_json = ? WHERE id = ?",
  );
  for (const row of rows) {
    const defaults = defaultsV29[`${row.provider}:${row.modelId}`];
    if (!defaults) continue;
    const configuration =
      row.configuration == null ? null : JSON.parse(String(row.configuration));
    const format = configuration?.connection?.apiFormat ?? row.apiFormat;
    const capabilities =
      row.capabilities == null
        ? (defaults.capabilitiesByApi[String(format)] ?? defaults.capabilities)
        : JSON.parse(String(row.capabilities));
    const limits = {
      ...defaults.limits,
      ...(row.limits == null ? {} : JSON.parse(String(row.limits))),
    };
    const thinking =
      row.thinking == null
        ? (defaults.thinkingByApi[String(format)] ?? null)
        : JSON.parse(String(row.thinking));
    update.run(
      JSON.stringify(capabilities),
      JSON.stringify(limits),
      thinking == null ? null : JSON.stringify(thinking),
      row.id,
    );
  }
}
