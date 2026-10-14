import type { ProviderPreset } from "../types";

export const moonshotPreset: ProviderPreset = {
  id: "moonshotai-cn",
  label: "Kimi",
  websiteUrl: "https://platform.kimi.com",
  apis: [{ apiFormat: "openai-completions", apiEndpoint: "https://api.moonshot.cn/v1" }],
};
