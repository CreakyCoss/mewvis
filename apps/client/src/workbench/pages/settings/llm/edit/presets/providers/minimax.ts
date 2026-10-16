import type { ProviderPreset } from "../types";

export const minimaxPreset: ProviderPreset = {
  id: "minimax-cn",
  label: "MiniMax",
  websiteUrl: "https://www.minimax.com",
  idPrefixes: ["minimax"],
  apis: [
    {
      apiFormat: "anthropic-messages",
      apiEndpoint: "https://api.minimaxi.com/anthropic",
    },
    {
      apiFormat: "openai-completions",
      apiEndpoint: "https://api.minimaxi.com/v1",
    },
  ],
  models: [
    {
      modelId: "MiniMax-M3",
      label: "MiniMax-M3",
      sourceUrls: [
        "https://platform.minimax.cn/docs/api-reference/text-anthropic-api",
        "https://platform.minimax.cn/docs/api-reference/text-chat-openai",
      ],
      limits: {
        contextWindow: 1000000,
        maxTokens: 524288,
      },
      templates: [
        {
          id: "minimax-m3-chat",
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
      modelId: "MiniMax-M3.1-Flash-Preview",
      label: "MiniMax-M3.1-Flash-Preview",
      sourceUrls: [
        "https://platform.minimax.cn/docs/api-reference/text-anthropic-api",
        "https://platform.minimax.cn/docs/api-reference/text-chat-openai",
      ],
      limits: {
        contextWindow: 1000000,
        maxTokens: 524288,
      },
      thinking: {
        "anthropic-messages": ["low", "medium", "high", "xhigh", "max"],
        "openai-completions": ["low", "medium", "high", "xhigh", "max"],
      },
      templates: [
        {
          id: "minimax-m3.1-flash-preview-chat",
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
      modelId: "image-01",
      label: "image-01",
      sourceUrls: [
        "https://platform.minimax.io/docs/api-reference/image-generation-t2i",
        "https://platform.minimax.io/docs/api-reference/image-generation-i2i",
      ],
      templates: [
        {
          id: "minimax-image-01",
          version: 2,
          label: "文生图",
          sourceUrl: "https://platform.minimax.io/docs/api-reference/image-generation-t2i",
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
                  maxLength: 1500,
                },
              },
            },
            parameters: [
              {
                name: "aspect_ratio",
                type: "string",
                default: "16:9",
                overridable: true,
                schema: {
                  enum: ["1:1", "16:9", "4:3", "3:2", "2:3", "3:4", "9:16", "21:9"],
                },
              },
              {
                name: "response_format",
                type: "string",
                default: "url",
                overridable: false,
                schema: {
                  enum: ["url", "base64"],
                },
              },
              {
                name: "n",
                type: "integer",
                default: 1,
                overridable: true,
                schema: {
                  minimum: 1,
                  maximum: 9,
                },
              },
              {
                name: "prompt_optimizer",
                type: "boolean",
                default: true,
                overridable: true,
              },
            ],
            request: {
              method: "POST",
              path: "/v1/image_generation",
              headers: {
                Authorization: "Bearer {{auth.apiKey}}",
                "Content-Type": "application/json",
              },
              body: {
                model: "{{model.id}}",
                prompt: "{{input.prompt}}",
                aspect_ratio: "{{params.aspect_ratio}}",
                response_format: "{{params.response_format}}",
                n: "{{params.n}}",
                prompt_optimizer: "{{params.prompt_optimizer}}",
              },
            },
            response: {
              mode: "direct",
              outputs: [
                {
                  type: "image",
                  source: "url",
                  path: "/data/image_urls",
                },
                {
                  type: "image",
                  source: "base64",
                  path: "/data/image_base64",
                },
              ],
              success: {
                path: "/base_resp/status_code",
                equals: 0,
              },
              errorPath: "/base_resp/status_msg",
            },
          },
          sampleInput: {
            prompt: "夕阳下的海边小镇",
          },
        },
        {
          id: "minimax-image-01-reference",
          version: 1,
          label: "人物参考图生成",
          sourceUrl: "https://platform.minimax.io/docs/api-reference/image-generation-i2i",
          purpose: {
            type: "image-editing",
            adapter: "http-json",
            input: ["text", "image"],
            output: ["image"],
            inputSchema: {
              type: "object",
              required: ["prompt", "image"],
              properties: {
                prompt: {
                  type: "string",
                  minLength: 1,
                  maxLength: 1500,
                },
                image: {
                  type: "string",
                  minLength: 1,
                },
              },
            },
            parameters: [
              {
                name: "aspect_ratio",
                type: "string",
                default: "16:9",
                overridable: true,
                schema: {
                  enum: ["1:1", "16:9", "4:3", "3:2", "2:3", "3:4", "9:16", "21:9"],
                },
              },
              {
                name: "response_format",
                type: "string",
                default: "url",
                overridable: false,
                schema: {
                  enum: ["url", "base64"],
                },
              },
              {
                name: "n",
                type: "integer",
                default: 1,
                overridable: true,
                schema: {
                  minimum: 1,
                  maximum: 9,
                },
              },
              {
                name: "prompt_optimizer",
                type: "boolean",
                default: true,
                overridable: true,
              },
            ],
            request: {
              method: "POST",
              path: "/v1/image_generation",
              headers: {
                Authorization: "Bearer {{auth.apiKey}}",
                "Content-Type": "application/json",
              },
              body: {
                model: "{{model.id}}",
                prompt: "{{input.prompt}}",
                aspect_ratio: "{{params.aspect_ratio}}",
                response_format: "{{params.response_format}}",
                n: "{{params.n}}",
                prompt_optimizer: "{{params.prompt_optimizer}}",
                subject_reference: [
                  {
                    type: "character",
                    image_file: "{{input.image}}",
                  },
                ],
              },
            },
            response: {
              mode: "direct",
              outputs: [
                {
                  type: "image",
                  source: "url",
                  path: "/data/image_urls",
                },
                {
                  type: "image",
                  source: "base64",
                  path: "/data/image_base64",
                },
              ],
              success: {
                path: "/base_resp/status_code",
                equals: 0,
              },
              errorPath: "/base_resp/status_msg",
            },
          },
          sampleInput: {
            prompt: "将参考人物放在海边小镇中",
            image: "https://example.com/person.png",
          },
        },
      ],
    },
    {
      modelId: "MiniMax-H3",
      label: "MiniMax-H3",
      sourceUrls: [
        "https://platform.minimax.io/docs/api-reference/video-generation-v2-create",
        "https://platform.minimax.io/docs/api-reference/video-generation-v2-query",
      ],
      templates: [
        {
          id: "minimax-video-h3",
          version: 2,
          label: "文生视频",
          sourceUrl: "https://platform.minimax.io/docs/api-reference/video-generation-v2-create",
          purpose: {
            type: "video-generation",
            adapter: "http-json",
            input: ["text"],
            output: ["video"],
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
                name: "resolution",
                type: "string",
                default: "768P",
                overridable: true,
                schema: {
                  enum: ["768P", "2K"],
                },
              },
              {
                name: "duration",
                type: "integer",
                default: 6,
                overridable: true,
                schema: {
                  minimum: 4,
                  maximum: 15,
                },
              },
              {
                name: "ratio",
                type: "string",
                default: "16:9",
                overridable: true,
                schema: {
                  enum: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
                },
              },
            ],
            request: {
              method: "POST",
              path: "/v2/video_generation",
              headers: {
                Authorization: "Bearer {{auth.apiKey}}",
                "Content-Type": "application/json",
              },
              body: {
                model: "{{model.id}}",
                content: [
                  {
                    type: "text",
                    text: "{{input.prompt}}",
                  },
                ],
                resolution: "{{params.resolution}}",
                duration: "{{params.duration}}",
                ratio: "{{params.ratio}}",
              },
            },
            response: {
              mode: "task",
              outputs: [
                {
                  type: "video",
                  source: "url",
                  path: "/task/content/url",
                },
              ],
              errorPath: "/error/message",
              task: {
                idPath: "/task_id",
                request: {
                  method: "GET",
                  path: "/v2/query/video_generation/{{task.id}}",
                  headers: {
                    Authorization: "Bearer {{auth.apiKey}}",
                  },
                },
                statusPath: "/task/status",
                successValues: ["succeeded"],
                failureValues: ["failed", "cancelled"],
                intervalSeconds: 3,
              },
            },
          },
          sampleInput: {
            prompt: "镜头缓缓掠过海边小镇",
          },
          isDefault: true,
        },
        {
          id: "minimax-video-h3-image",
          version: 1,
          label: "图生视频",
          sourceUrl: "https://platform.minimax.io/docs/api-reference/video-generation-v2-create",
          purpose: {
            type: "video-generation",
            adapter: "http-json",
            input: ["text", "image"],
            output: ["video"],
            inputSchema: {
              type: "object",
              required: ["prompt", "image"],
              properties: {
                prompt: {
                  type: "string",
                  minLength: 1,
                },
                image: {
                  type: "string",
                  minLength: 1,
                },
              },
            },
            parameters: [
              {
                name: "resolution",
                type: "string",
                default: "768P",
                overridable: true,
                schema: {
                  enum: ["768P", "2K"],
                },
              },
              {
                name: "duration",
                type: "integer",
                default: 6,
                overridable: true,
                schema: {
                  minimum: 4,
                  maximum: 15,
                },
              },
            ],
            request: {
              method: "POST",
              path: "/v2/video_generation",
              headers: {
                Authorization: "Bearer {{auth.apiKey}}",
                "Content-Type": "application/json",
              },
              body: {
                model: "{{model.id}}",
                content: [
                  {
                    type: "text",
                    text: "{{input.prompt}}",
                  },
                  {
                    type: "image_url",
                    image_url: {
                      url: "{{input.image}}",
                    },
                    role: "first_frame",
                  },
                ],
                resolution: "{{params.resolution}}",
                duration: "{{params.duration}}",
                ratio: "adaptive",
              },
            },
            response: {
              mode: "task",
              outputs: [
                {
                  type: "video",
                  source: "url",
                  path: "/task/content/url",
                },
              ],
              errorPath: "/error/message",
              task: {
                idPath: "/task_id",
                request: {
                  method: "GET",
                  path: "/v2/query/video_generation/{{task.id}}",
                  headers: {
                    Authorization: "Bearer {{auth.apiKey}}",
                  },
                },
                statusPath: "/task/status",
                successValues: ["succeeded"],
                failureValues: ["failed", "cancelled"],
                intervalSeconds: 3,
              },
            },
          },
          sampleInput: {
            prompt: "镜头缓缓掠过海边小镇",
            image: "https://example.com/first.png",
          },
        },
        {
          id: "minimax-video-h3-frames",
          version: 1,
          label: "首尾帧生视频",
          sourceUrl: "https://platform.minimax.io/docs/api-reference/video-generation-v2-create",
          purpose: {
            type: "video-generation",
            adapter: "http-json",
            input: ["text", "image"],
            output: ["video"],
            inputSchema: {
              type: "object",
              required: ["prompt", "image", "lastImage"],
              properties: {
                prompt: {
                  type: "string",
                  minLength: 1,
                },
                image: {
                  type: "string",
                  minLength: 1,
                },
                lastImage: {
                  type: "string",
                  minLength: 1,
                },
              },
            },
            parameters: [
              {
                name: "resolution",
                type: "string",
                default: "768P",
                overridable: true,
                schema: {
                  enum: ["768P", "2K"],
                },
              },
              {
                name: "duration",
                type: "integer",
                default: 6,
                overridable: true,
                schema: {
                  minimum: 4,
                  maximum: 15,
                },
              },
            ],
            request: {
              method: "POST",
              path: "/v2/video_generation",
              headers: {
                Authorization: "Bearer {{auth.apiKey}}",
                "Content-Type": "application/json",
              },
              body: {
                model: "{{model.id}}",
                content: [
                  {
                    type: "text",
                    text: "{{input.prompt}}",
                  },
                  {
                    type: "image_url",
                    image_url: {
                      url: "{{input.image}}",
                    },
                    role: "first_frame",
                  },
                  {
                    type: "image_url",
                    image_url: {
                      url: "{{input.lastImage}}",
                    },
                    role: "last_frame",
                  },
                ],
                resolution: "{{params.resolution}}",
                duration: "{{params.duration}}",
                ratio: "adaptive",
              },
            },
            response: {
              mode: "task",
              outputs: [
                {
                  type: "video",
                  source: "url",
                  path: "/task/content/url",
                },
              ],
              errorPath: "/error/message",
              task: {
                idPath: "/task_id",
                request: {
                  method: "GET",
                  path: "/v2/query/video_generation/{{task.id}}",
                  headers: {
                    Authorization: "Bearer {{auth.apiKey}}",
                  },
                },
                statusPath: "/task/status",
                successValues: ["succeeded"],
                failureValues: ["failed", "cancelled"],
                intervalSeconds: 3,
              },
            },
          },
          sampleInput: {
            prompt: "镜头缓缓掠过海边小镇",
            image: "https://example.com/first.png",
            lastImage: "https://example.com/last.png",
          },
        },
      ],
    },
    {
      modelId: "MiniMax-H3-Max",
      label: "MiniMax-H3-Max",
      sourceUrls: [
        "https://platform.minimax.io/docs/api-reference/video-generation-v2-create",
        "https://platform.minimax.io/docs/api-reference/video-generation-v2-query",
      ],
      templates: [
        {
          id: "minimax-video-h3-max",
          version: 1,
          label: "文生视频",
          sourceUrl: "https://platform.minimax.io/docs/api-reference/video-generation-v2-create",
          purpose: {
            type: "video-generation",
            adapter: "http-json",
            input: ["text"],
            output: ["video"],
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
                name: "resolution",
                type: "string",
                default: "768P",
                overridable: true,
                schema: {
                  enum: ["480P", "768P"],
                },
              },
              {
                name: "duration",
                type: "integer",
                default: 6,
                overridable: true,
                schema: {
                  minimum: 5,
                  maximum: 15,
                },
              },
              {
                name: "ratio",
                type: "string",
                default: "16:9",
                overridable: true,
                schema: {
                  enum: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
                },
              },
            ],
            request: {
              method: "POST",
              path: "/v2/video_generation",
              headers: {
                Authorization: "Bearer {{auth.apiKey}}",
                "Content-Type": "application/json",
              },
              body: {
                model: "{{model.id}}",
                content: [
                  {
                    type: "text",
                    text: "{{input.prompt}}",
                  },
                ],
                resolution: "{{params.resolution}}",
                duration: "{{params.duration}}",
                ratio: "{{params.ratio}}",
              },
            },
            response: {
              mode: "task",
              outputs: [
                {
                  type: "video",
                  source: "url",
                  path: "/task/content/url",
                },
              ],
              errorPath: "/error/message",
              task: {
                idPath: "/task_id",
                request: {
                  method: "GET",
                  path: "/v2/query/video_generation/{{task.id}}",
                  headers: {
                    Authorization: "Bearer {{auth.apiKey}}",
                  },
                },
                statusPath: "/task/status",
                successValues: ["succeeded"],
                failureValues: ["failed", "cancelled"],
                intervalSeconds: 3,
              },
            },
          },
          sampleInput: {
            prompt: "镜头缓缓掠过海边小镇",
          },
          isDefault: true,
        },
        {
          id: "minimax-video-h3-max-image",
          version: 1,
          label: "图生视频",
          sourceUrl: "https://platform.minimax.io/docs/api-reference/video-generation-v2-create",
          purpose: {
            type: "video-generation",
            adapter: "http-json",
            input: ["text", "image"],
            output: ["video"],
            inputSchema: {
              type: "object",
              required: ["prompt", "image"],
              properties: {
                prompt: {
                  type: "string",
                  minLength: 1,
                },
                image: {
                  type: "string",
                  minLength: 1,
                },
              },
            },
            parameters: [
              {
                name: "resolution",
                type: "string",
                default: "768P",
                overridable: true,
                schema: {
                  enum: ["480P", "768P"],
                },
              },
              {
                name: "duration",
                type: "integer",
                default: 6,
                overridable: true,
                schema: {
                  minimum: 5,
                  maximum: 15,
                },
              },
            ],
            request: {
              method: "POST",
              path: "/v2/video_generation",
              headers: {
                Authorization: "Bearer {{auth.apiKey}}",
                "Content-Type": "application/json",
              },
              body: {
                model: "{{model.id}}",
                content: [
                  {
                    type: "text",
                    text: "{{input.prompt}}",
                  },
                  {
                    type: "image_url",
                    image_url: {
                      url: "{{input.image}}",
                    },
                    role: "first_frame",
                  },
                ],
                resolution: "{{params.resolution}}",
                duration: "{{params.duration}}",
                ratio: "adaptive",
              },
            },
            response: {
              mode: "task",
              outputs: [
                {
                  type: "video",
                  source: "url",
                  path: "/task/content/url",
                },
              ],
              errorPath: "/error/message",
              task: {
                idPath: "/task_id",
                request: {
                  method: "GET",
                  path: "/v2/query/video_generation/{{task.id}}",
                  headers: {
                    Authorization: "Bearer {{auth.apiKey}}",
                  },
                },
                statusPath: "/task/status",
                successValues: ["succeeded"],
                failureValues: ["failed", "cancelled"],
                intervalSeconds: 3,
              },
            },
          },
          sampleInput: {
            prompt: "镜头缓缓掠过海边小镇",
            image: "https://example.com/first.png",
          },
        },
        {
          id: "minimax-video-h3-max-frames",
          version: 1,
          label: "首尾帧生视频",
          sourceUrl: "https://platform.minimax.io/docs/api-reference/video-generation-v2-create",
          purpose: {
            type: "video-generation",
            adapter: "http-json",
            input: ["text", "image"],
            output: ["video"],
            inputSchema: {
              type: "object",
              required: ["prompt", "image", "lastImage"],
              properties: {
                prompt: {
                  type: "string",
                  minLength: 1,
                },
                image: {
                  type: "string",
                  minLength: 1,
                },
                lastImage: {
                  type: "string",
                  minLength: 1,
                },
              },
            },
            parameters: [
              {
                name: "resolution",
                type: "string",
                default: "768P",
                overridable: true,
                schema: {
                  enum: ["480P", "768P"],
                },
              },
              {
                name: "duration",
                type: "integer",
                default: 6,
                overridable: true,
                schema: {
                  minimum: 5,
                  maximum: 15,
                },
              },
            ],
            request: {
              method: "POST",
              path: "/v2/video_generation",
              headers: {
                Authorization: "Bearer {{auth.apiKey}}",
                "Content-Type": "application/json",
              },
              body: {
                model: "{{model.id}}",
                content: [
                  {
                    type: "text",
                    text: "{{input.prompt}}",
                  },
                  {
                    type: "image_url",
                    image_url: {
                      url: "{{input.image}}",
                    },
                    role: "first_frame",
                  },
                  {
                    type: "image_url",
                    image_url: {
                      url: "{{input.lastImage}}",
                    },
                    role: "last_frame",
                  },
                ],
                resolution: "{{params.resolution}}",
                duration: "{{params.duration}}",
                ratio: "adaptive",
              },
            },
            response: {
              mode: "task",
              outputs: [
                {
                  type: "video",
                  source: "url",
                  path: "/task/content/url",
                },
              ],
              errorPath: "/error/message",
              task: {
                idPath: "/task_id",
                request: {
                  method: "GET",
                  path: "/v2/query/video_generation/{{task.id}}",
                  headers: {
                    Authorization: "Bearer {{auth.apiKey}}",
                  },
                },
                statusPath: "/task/status",
                successValues: ["succeeded"],
                failureValues: ["failed", "cancelled"],
                intervalSeconds: 3,
              },
            },
          },
          sampleInput: {
            prompt: "镜头缓缓掠过海边小镇",
            image: "https://example.com/first.png",
            lastImage: "https://example.com/last.png",
          },
        },
      ],
    },
  ],
};
