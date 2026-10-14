import type { ProviderPreset } from "../types";

export const openaiPreset: ProviderPreset = {
  id: "openai",
  label: "OpenAI",
  websiteUrl: "https://platform.openai.com",
  apis: [
    { apiFormat: "openai-responses", apiEndpoint: "https://api.openai.com/v1" },
    { apiFormat: "openai-completions", apiEndpoint: "https://api.openai.com/v1" },
  ],
  thinking: {
    "openai-responses": ["low", "medium", "high", "xhigh", "max"],
    "openai-completions": ["low", "medium", "high", "xhigh", "max"],
  },
  templates: [
    {
      id: "openai-image",
      label: "OpenAI · GPT Image",
      sourceUrl: "https://developers.openai.com/api/docs/guides/image-generation",
      sampleInput: {
        prompt: "A quiet seaside town at sunset",
      },
      purpose: {
        type: "image-generation",
        adapter: "http-json",
        input: ["text"],
        output: ["image"],
        inputSchema: {
          type: "object",
          required: ["prompt"],
          properties: {
            prompt: {
              type: "string",
              minLength: 1,
            },
          },
        },
        parameters: [
          {
            name: "size",
            type: "string",
            default: "auto",
            overridable: true,
            schema: {
              enum: ["auto", "1024x1024", "1536x1024", "1024x1536"],
            },
          },
          {
            name: "quality",
            type: "string",
            default: "auto",
            overridable: true,
            schema: {
              enum: ["auto", "low", "medium", "high"],
            },
          },
          {
            name: "output_format",
            type: "string",
            default: "png",
            overridable: true,
            schema: {
              enum: ["png", "jpeg", "webp"],
            },
          },
        ],
        request: {
          method: "POST",
          path: "/v1/images/generations",
          headers: {
            Authorization: "Bearer {{auth.apiKey}}",
            "Content-Type": "application/json",
          },
          body: {
            model: "{{model.id}}",
            prompt: "{{input.prompt}}",
            size: "{{params.size}}",
            quality: "{{params.quality}}",
            output_format: "{{params.output_format}}",
          },
        },
        response: {
          mode: "direct",
          outputs: [
            {
              type: "image",
              source: "base64",
              path: "/data",
              itemPath: "/b64_json",
            },
          ],
          errorPath: "/error/message",
        },
      },
      version: 1,
      match: {
        modelPrefixes: ["gpt-image-"],
      },
    },
  ],
};
