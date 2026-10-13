import type {
  RuntimeModelCatalogApi,
  RuntimeModelThinking,
  RuntimeModelSummary,
  RuntimeModelCapabilities,
} from "../../protocol/wire.js";

type CatalogProviderConfig = {
  websiteUrl: string;
  models: Record<
    string,
    Partial<
      Pick<
        RuntimeModelSummary,
        "thinking" | "capabilities" | "input" | "capabilitySourceUrl"
      >
    >
  >;
  apis: RuntimeModelCatalogApi[];
};

const chatCapabilities = (
  input: RuntimeModelCapabilities["input"],
): RuntimeModelCapabilities => ({
  operations: ["chat"],
  input,
  output: ["text"],
  reasoning: true,
  toolCalling: true,
});

const openaiThinking: RuntimeModelThinking = {
  levels: [
    { value: "low", label: "低" },
    { value: "medium", label: "中" },
    { value: "high", label: "高" },
    { value: "xhigh", label: "极高" },
    { value: "max", label: "最高" },
  ],
  defaultLevel: "high",
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
  openai: {
    websiteUrl: "https://platform.openai.com",
    models: {
      "gpt-6-astra": {
        thinking: {
          "openai-responses": openaiThinking,
          "openai-completions": openaiThinking,
        },
        input: ["text", "image"],
        capabilities: {
          "openai-responses": chatCapabilities(["text", "image"]),
          "openai-completions": chatCapabilities(["text", "image"]),
        },
        capabilitySourceUrl:
          "https://developers.openai.com/api/docs/models/gpt-6-astra",
      },
      "gpt-6.1-sol": {},
      "gpt-6-luna": {},
      "gpt-5.6-sol": {},
    },
    apis: [
      {
        apiFormat: "openai-responses",
        apiEndpoint: "https://api.openai.com/v1",
      },
      {
        apiFormat: "openai-completions",
        apiEndpoint: "https://api.openai.com/v1",
      },
    ],
  },
  deepseek: {
    websiteUrl: "https://www.deepseek.com",
    models: {
      "deepseek-flash": {
        input: ["text", "image"],
        thinking: { "openai-completions": deepseekThinking },
        capabilities: {
          "openai-completions": chatCapabilities(["text", "image"]),
        },
        capabilitySourceUrl: "https://api-docs.deepseek.com/guides/vision/",
      },
      "deepseek-v4-pro": {
        input: ["text"],
        thinking: { "openai-completions": deepseekThinking },
        capabilities: { "openai-completions": chatCapabilities(["text"]) },
        capabilitySourceUrl:
          "https://api-docs.deepseek.com/quick_start/pricing/",
      },
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
    models: {
      "MiniMax-M3": {
        input: ["text", "image"],
        capabilities: {
          "anthropic-messages": chatCapabilities(["text", "image", "video"]),
          "openai-completions": chatCapabilities(["text", "image", "video"]),
        },
        capabilitySourceUrl:
          "https://platform.minimax.io/docs/api-reference/text-openai-api",
      },
      "MiniMax-M2.7": { input: ["text"] },
      "MiniMax-M2.7-highspeed": { input: ["text"] },
    },
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
