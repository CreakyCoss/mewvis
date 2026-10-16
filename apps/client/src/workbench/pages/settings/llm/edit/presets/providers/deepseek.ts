import type { ProviderPreset } from "../types";

export const deepseekPreset: ProviderPreset = {
  id: "deepseek",
  label: "DeepSeek",
  websiteUrl: "https://www.deepseek.com",
  apis: [
    {
      apiFormat: "openai-completions",
      apiEndpoint: "https://api.deepseek.com",
    },
  ],
  models: [
    {
      modelId: "deepseek-flash",
      label: "deepseek-flash",
      sourceUrls: [
        "https://api-docs.deepseek.com/quick_start/pricing/",
        "https://api-docs.deepseek.com/guides/thinking_mode",
      ],
      limits: {
        contextWindow: 1048576,
        maxTokens: 393216,
      },
      thinking: {
        "openai-completions": ["off", "low", "high", "max"],
      },
      templates: [
        {
          id: "deepseek-flash-chat",
          version: 1,
          label: "对话",
          purpose: {
            type: "chat",
            adapter: "native",
            input: ["text", "image"],
            output: ["text"],
            reasoning: true,
            toolCalling: true,
            parameters: [],
          },
          sampleInput: {
            prompt: "你好",
          },
        },
      ],
    },
    {
      modelId: "deepseek-v4-pro",
      label: "deepseek-v4-pro",
      sourceUrls: [
        "https://api-docs.deepseek.com/quick_start/pricing/",
        "https://api-docs.deepseek.com/guides/thinking_mode",
      ],
      limits: {
        contextWindow: 1048576,
        maxTokens: 393216,
      },
      thinking: {
        "openai-completions": ["off", "low", "high", "max"],
      },
      templates: [
        {
          id: "deepseek-v4-pro-chat",
          version: 1,
          label: "对话",
          purpose: {
            type: "chat",
            adapter: "native",
            input: ["text"],
            output: ["text"],
            reasoning: true,
            toolCalling: true,
            parameters: [],
          },
          sampleInput: {
            prompt: "你好",
          },
        },
      ],
    },
  ],
};
