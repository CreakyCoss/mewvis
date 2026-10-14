import type { ProviderPreset } from "../types";

export const deepseekPreset: ProviderPreset = {
  id: "deepseek",
  label: "DeepSeek",
  websiteUrl: "https://www.deepseek.com",
  apis: [{ apiFormat: "openai-completions", apiEndpoint: "https://api.deepseek.com" }],
  thinking: { "openai-completions": ["off", "low", "high", "max"] },
};
