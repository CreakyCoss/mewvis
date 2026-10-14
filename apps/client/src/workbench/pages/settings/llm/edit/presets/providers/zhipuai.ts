import type { ProviderPreset } from "../types";

export const zhipuaiPreset: ProviderPreset = {
  id: "zhipuai",
  label: "GLM",
  websiteUrl: "https://bigmodel.cn",
  apis: [{ apiFormat: "openai-completions", apiEndpoint: "https://open.bigmodel.cn/api/paas/v4" }],
};
