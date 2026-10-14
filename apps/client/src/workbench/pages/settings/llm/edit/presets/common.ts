import type { CommonPreset } from "./types";

/** Shared editor information and defaults; supplier files only define their differences. */
export const commonPreset: CommonPreset = {
  defaultProvider: "openai",
  protocols: [
    { value: "openai-completions", label: "OpenAI Compatible" },
    { value: "openai-responses", label: "OpenAI Responses" },
    { value: "anthropic-messages", label: "Anthropic Messages" },
    { value: "google-generative-ai", label: "Google Generative AI" },
    { value: "azure-openai-responses", label: "Azure OpenAI Responses" },
    { value: "openai-codex-responses", label: "OpenAI Codex Responses" },
    { value: "openrouter", label: "OpenRouter", apiEndpoint: "https://openrouter.ai/api/v1" },
    { value: "http-json", label: "HTTP / JSON 模板" },
  ],
  modalities: [
    { value: "text", label: "文字" },
    { value: "image", label: "图片" },
    { value: "audio", label: "音频" },
    { value: "video", label: "视频" },
  ],
  operations: [
    { value: "chat", label: "对话" },
    { value: "image-generation", label: "图像生成" },
    { value: "image-editing", label: "图像编辑" },
    { value: "video-generation", label: "视频生成" },
    { value: "speech", label: "语音合成" },
    { value: "transcription", label: "语音转写" },
    { value: "realtime", label: "实时对话" },
  ],
  thinkingLevels: [
    { value: "off", label: "关闭" },
    { value: "minimal", label: "极低" },
    { value: "low", label: "低" },
    { value: "medium", label: "中" },
    { value: "high", label: "高" },
    { value: "xhigh", label: "极高" },
    { value: "max", label: "最高" },
  ],
  modelDefaults: {
    capabilities: {
      operations: ["chat"],
      input: ["text"],
      output: ["text"],
      reasoning: true,
      toolCalling: true,
    },
    limits: { contextWindow: 128000, maxTokens: 16384 },
  },
  sampleInput: { prompt: "在海边的小镇，夕阳照亮街道。" },
  templates: [
    {
      id: "native-chat",
      label: "原生对话协议",
      purpose: {
        type: "chat",
        adapter: "native",
        input: ["text"],
        output: ["text"],
        reasoning: true,
        toolCalling: true,
        parameters: [],
      },
      sampleInput: { prompt: "你好" },
      version: 1,
      isDefault: true,
    },
  ],
};
