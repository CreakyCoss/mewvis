import type { RuntimeApiFormat, RuntimeModelCatalogApi, RuntimeModelThinking } from "../../protocol/wire.js";

type CatalogProviderConfig = {
  websiteUrl: string;
  models: Record<string, { thinking?: Partial<Record<RuntimeApiFormat, RuntimeModelThinking>> }>;
  apis: RuntimeModelCatalogApi[];
};

// https://api-docs.deepseek.com/guides/thinking_mode/
const deepseekThinking: RuntimeModelThinking = {
  levels: [
    { value: "off", label: "关闭" },
    { value: "low", label: "低" },
    { value: "high", label: "高" },
    { value: "max", label: "最高" },
  ],
  defaultLevel: "high",
};

// App-level provider exposure policy for the built-in model catalog.
export const MODEL_PROVIDER_CONFIG: Record<string, CatalogProviderConfig> = {
  deepseek: {
    websiteUrl: "https://www.deepseek.com",
    models: {
      "deepseek-v4-flash": { thinking: { "openai-completions": deepseekThinking } },
      "deepseek-v4-pro": { thinking: { "openai-completions": deepseekThinking } },
    },
    apis: [
      {
        apiFormat: "openai-completions",
        apiEndpoint: "https://api.deepseek.com",
      },
    ],
  },
  "minimax-cn": {
    websiteUrl: "https://www.minimax.com/",
    // These interfaces do not expose selectable effort levels; leave control to the provider.
    models: { "MiniMax-M2.7": {}, "MiniMax-M2.7-highspeed": {}, "MiniMax-M3": {} },
    apis: [
      {
        apiFormat: "anthropic-messages",
        apiEndpoint: "https://api.minimaxi.com/anthropic",
      },
      {
        apiFormat: "openai-completions",
        apiEndpoint: "https://api.minimaxi.com/v1",
      },
    ],
  },
};
