import type { ProviderPreset } from "../types";

export const moonshotPreset: ProviderPreset = {
  id: "moonshotai-cn",
  label: "Kimi",
  websiteUrl: "https://platform.kimi.com",
  apis: [
    {
      apiFormat: "openai-completions",
      apiEndpoint: "https://api.moonshot.cn/v1",
    },
  ],
  models: [
    {
      modelId: "kimi-k3",
      label: "kimi-k3",
      sourceUrls: [
        "https://platform.kimi.com/docs/guide/kimi-k3-quickstart",
        "https://platform.kimi.com/docs/guide/use-kimi-vision-model",
      ],
      limits: {
        contextWindow: 1048576,
        maxTokens: 1048576,
      },
      thinking: {
        "openai-completions": ["low", "high", "max"],
      },
      templates: [
        {
          id: "kimi-k3-chat",
          version: 1,
          label: "对话",
          purpose: {
            type: "chat",
            adapter: "native",
            input: ["text", "image", "video"],
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
      modelId: "kimi-k2.6",
      label: "kimi-k2.6",
      sourceUrls: [
        "https://platform.kimi.com/docs/guide/kimi-k2-6-quickstart",
        "https://platform.kimi.com/docs/guide/use-kimi-vision-model",
      ],
      limits: {
        contextWindow: 262144,
      },
      templates: [
        {
          id: "kimi-k2.6-chat",
          version: 1,
          label: "对话",
          purpose: {
            type: "chat",
            adapter: "native",
            input: ["text", "image", "video"],
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
