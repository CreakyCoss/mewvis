import type { ApiFormat, ProviderRuntimeConfig } from "./types.js";

export const API_FORMAT_ENDPOINT_SUFFIX: Partial<Record<ApiFormat, string>> = {
  "anthropic-messages": "/anthropic",
  "openai-codex-responses": "/v1",
  "openai-completions": "/v1",
  "openai-responses": "/v1",
};

// The raw provider api from models.dev is reference metadata only; runtime exports use this config.
export const PROVIDER_RUNTIME_CONFIG: Record<string, ProviderRuntimeConfig> = {
  deepseek: {
    websiteUrl: "https://www.deepseek.com",
    models: [
      "deepseek-v4-flash",
      "deepseek-v4-pro",
    ],
    apis: [
      {
        apiFormat: "openai-completions",
        apiEndpoint: "https://api.deepseek.com",
      },
    ],
  },
  "minimax-cn": {
    websiteUrl: "https://www.minimax.com/",
    models: [
      "MiniMax-M2.7",
      "MiniMax-M2.7-highspeed",
      "MiniMax-M3",
    ],
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
