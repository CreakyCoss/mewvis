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
  zhipuai: {
    websiteUrl: "https://bigmodel.cn",
    models: {
      "glm-5.3": {},
      "glm-5.3-flash": {},
      "glm-5.3-flashx": {},
      "glm-4.7-flash": {},
    },
    // https://docs.bigmodel.cn/cn/guide/develop/openai/introduction
    apis: [
      {
        apiFormat: "openai-completions",
        apiEndpoint: "https://open.bigmodel.cn/api/paas/v4",
      },
    ],
  },
  "moonshotai-cn": {
    websiteUrl: "https://platform.kimi.com",
    models: {
      "kimi-k3": {},
      "kimi-k2.7-code": {},
      "kimi-k2.7-code-highspeed": {},
      "kimi-k2.6": {},
    },
    // https://platform.kimi.com/docs/get-api-key
    apis: [
      {
        apiFormat: "openai-completions",
        apiEndpoint: "https://api.moonshot.cn/v1",
      },
    ],
  },
  xiaomi: {
    websiteUrl: "https://platform.xiaomimimo.com",
    models: {
      "mimo-v2.6-pro": {},
      "mimo-v2.6-flash": {},
      "mimo-v2.6-pro-ultraspeed": {},
      "mimo-v2.5-pro": {},
      "mimo-v2.5": {},
    },
    // https://mimo.mi.com/docs/en-US/quick-start/summary/first-api-call
    apis: [
      {
        apiFormat: "openai-completions",
        apiEndpoint: "https://api.xiaomimimo.com/v1",
      },
    ],
  },
};
