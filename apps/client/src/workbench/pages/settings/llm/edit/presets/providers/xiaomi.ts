import type { ProviderPreset } from "../types";

export const xiaomiPreset: ProviderPreset = {
  id: "xiaomi",
  label: "MiMo",
  websiteUrl: "https://platform.xiaomimimo.com",
  apis: [
    {
      apiFormat: "openai-completions",
      apiEndpoint: "https://api.xiaomimimo.com/v1",
    },
  ],
  models: [
    {
      modelId: "mimo-v2.5",
      label: "mimo-v2.5",
      sourceUrls: ["https://mimo.mi.com/models/zh-CN/mimo-v2.5"],
      limits: {
        contextWindow: 1000000,
        maxTokens: 131072,
      },
      templates: [
        {
          id: "mimo-v2.5-chat",
          version: 1,
          label: "对话",
          purpose: {
            type: "chat",
            adapter: "native",
            input: ["text", "image", "video", "audio"],
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
