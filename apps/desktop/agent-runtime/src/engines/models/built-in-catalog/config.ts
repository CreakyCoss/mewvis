import type { RuntimeModelCatalogApi } from "../../protocol/model.js";

type CatalogProviderConfig = {
  websiteUrl: string;
  models?: string[];
  apis: RuntimeModelCatalogApi[];
};

// App-level provider exposure policy for the built-in model catalog.
export const MODEL_PROVIDER_CONFIG: Record<string, CatalogProviderConfig> = {
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
