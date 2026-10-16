import type { ProviderPreset } from "../types";

export const openaiPreset: ProviderPreset = {
  id: "openai",
  label: "OpenAI",
  websiteUrl: "https://platform.openai.com",
  apis: [
    {
      apiFormat: "openai-responses",
      apiEndpoint: "https://api.openai.com/v1",
    },
    {
      apiFormat: "openai-completions",
      apiEndpoint: "https://api.openai.com/v1",
    },
  ],
  models: [
    {
      modelId: "gpt-5.5",
      label: "gpt-5.5",
      sourceUrls: ["https://developers.openai.com/api/docs/models/gpt-5.5"],
      limits: {
        contextWindow: 1050000,
        maxTokens: 128000,
      },
      thinking: {
        "openai-responses": ["off", "low", "medium", "high", "xhigh"],
        "openai-completions": ["off", "low", "medium", "high", "xhigh"],
      },
      templates: [
        {
          id: "gpt-5.5-chat",
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
      modelId: "gpt-image-2.5-sunburst",
      label: "gpt-image-2.5-sunburst",
      sourceUrls: ["https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst"],
      templates: [
        {
          id: "openai-gpt-image-2.5-sunburst",
          version: 1,
          label: "文生图",
          sourceUrl: "https://developers.openai.com/api/reference/resources/images/methods/generate",
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
                  maxLength: 32000,
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
                  enum: ["auto", "low", "medium", "high", "xhigh", "max"],
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
          sampleInput: {
            prompt: "夕阳下的海边小镇",
          },
        },
        {
          id: "openai-gpt-image-2.5-sunburst-edit",
          version: 1,
          label: "图片编辑",
          sourceUrl: "https://developers.openai.com/api/reference/resources/images/methods/edit",
          purpose: {
            type: "image-editing",
            adapter: "http-json",
            input: ["text", "image"],
            output: ["image"],
            inputSchema: {
              type: "object",
              required: ["prompt", "images"],
              properties: {
                prompt: {
                  type: "string",
                  minLength: 1,
                  maxLength: 32000,
                },
                images: {
                  type: "array",
                  minItems: 1,
                  maxItems: 16,
                  items: {
                    type: "object",
                    required: ["image_url"],
                    properties: {
                      image_url: {
                        type: "string",
                        minLength: 1,
                      },
                    },
                  },
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
                  enum: ["auto", "low", "medium", "high", "xhigh", "max"],
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
              path: "/v1/images/edits",
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
                images: "{{input.images}}",
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
          sampleInput: {
            prompt: "夕阳下的海边小镇",
            images: [
              {
                image_url: "https://example.com/reference.png",
              },
            ],
          },
        },
      ],
    },
    {
      modelId: "gpt-image-2.5-flare",
      label: "gpt-image-2.5-flare",
      sourceUrls: ["https://developers.openai.com/api/docs/models/gpt-image-2.5-flare"],
      templates: [
        {
          id: "openai-gpt-image-2.5-flare",
          version: 1,
          label: "文生图",
          sourceUrl: "https://developers.openai.com/api/reference/resources/images/methods/generate",
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
                  maxLength: 32000,
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
                  enum: ["auto", "low", "medium", "high", "xhigh", "max"],
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
          sampleInput: {
            prompt: "夕阳下的海边小镇",
          },
        },
        {
          id: "openai-gpt-image-2.5-flare-edit",
          version: 1,
          label: "图片编辑",
          sourceUrl: "https://developers.openai.com/api/reference/resources/images/methods/edit",
          purpose: {
            type: "image-editing",
            adapter: "http-json",
            input: ["text", "image"],
            output: ["image"],
            inputSchema: {
              type: "object",
              required: ["prompt", "images"],
              properties: {
                prompt: {
                  type: "string",
                  minLength: 1,
                  maxLength: 32000,
                },
                images: {
                  type: "array",
                  minItems: 1,
                  maxItems: 16,
                  items: {
                    type: "object",
                    required: ["image_url"],
                    properties: {
                      image_url: {
                        type: "string",
                        minLength: 1,
                      },
                    },
                  },
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
                  enum: ["auto", "low", "medium", "high", "xhigh", "max"],
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
              path: "/v1/images/edits",
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
                images: "{{input.images}}",
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
          sampleInput: {
            prompt: "夕阳下的海边小镇",
            images: [
              {
                image_url: "https://example.com/reference.png",
              },
            ],
          },
        },
      ],
    },
  ],
};
