import type { ProviderPreset } from "../types";

export const xiaomiPreset: ProviderPreset = {
  id: "xiaomi",
  label: "MiMo",
  websiteUrl: "https://platform.xiaomimimo.com",
  apis: [{ apiFormat: "openai-completions", apiEndpoint: "https://api.xiaomimimo.com/v1" }],
};
