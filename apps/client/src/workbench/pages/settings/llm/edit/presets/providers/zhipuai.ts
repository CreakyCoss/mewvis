import type { ProviderPreset } from "../types";

export const zhipuaiPreset: ProviderPreset = {
  id: "zhipuai",
  label: "GLM",
  websiteUrl: "https://bigmodel.cn",
  apis: [
    {
      apiFormat: "openai-completions",
      apiEndpoint: "https://open.bigmodel.cn/api/paas/v4",
    },
  ],
  models: [
    {
      modelId: "glm-5.3-flash",
      label: "glm-5.3-flash",
      sourceUrls: ["https://docs.bigmodel.cn/cn/guide/models/vlm/glm-5.3-flash"],
      limits: {
        contextWindow: 1000000,
        maxTokens: 128000,
      },
      templates: [
        {
          id: "glm-5.3-flash-chat",
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
      modelId: "glm-5.3-flashx",
      label: "glm-5.3-flashx",
      sourceUrls: ["https://docs.bigmodel.cn/cn/guide/models/vlm/glm-5.3-flash"],
      limits: {
        contextWindow: 1000000,
        maxTokens: 128000,
      },
      templates: [
        {
          id: "glm-5.3-flashx-chat",
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
      modelId: "glm-image",
      label: "glm-image",
      sourceUrls: [
        "https://docs.bigmodel.cn/cn/guide/models/image-generation/glm-image",
        "https://docs.bigmodel.cn/api-reference/模型-api/图像生成",
      ],
      templates: [
        {
          id: "glm-image-generation",
          version: 1,
          label: "文生图",
          sourceUrl: "https://docs.bigmodel.cn/api-reference/模型-api/图像生成",
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
                  maxLength: 1000,
                },
              },
            },
            parameters: [
              {
                name: "size",
                type: "string",
                default: "1280x1280",
                overridable: true,
                schema: {
                  enum: ["1280x1280", "1568x1056", "1056x1568", "1472x1088", "1088x1472", "1728x960", "960x1728"],
                },
              },
            ],
            request: {
              method: "POST",
              path: "/api/paas/v4/images/generations",
              headers: {
                Authorization: "Bearer {{auth.apiKey}}",
                "Content-Type": "application/json",
              },
              body: {
                model: "{{model.id}}",
                prompt: "{{input.prompt}}",
                size: "{{params.size}}",
              },
            },
            response: {
              mode: "direct",
              outputs: [
                {
                  type: "image",
                  source: "url",
                  path: "/data",
                  itemPath: "/url",
                },
              ],
              errorPath: "/error/message",
            },
          },
          sampleInput: {
            prompt: "一只坐在窗台上的小猫",
          },
        },
      ],
    },
    {
      modelId: "cogvideox-3",
      label: "cogvideox-3",
      sourceUrls: [
        "https://docs.bigmodel.cn/cn/guide/models/video-generation/cogvideox-3",
        "https://docs.bigmodel.cn/api-reference/模型-api/视频生成异步",
        "https://docs.bigmodel.cn/api-reference/模型-api/查询异步结果",
      ],
      templates: [
        {
          id: "cogvideox-3-text",
          version: 1,
          label: "文生视频",
          sourceUrl: "https://docs.bigmodel.cn/api-reference/模型-api/视频生成异步",
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
                  maxLength: 512,
                },
              },
            },
            parameters: [
              {
                name: "quality",
                type: "string",
                default: "speed",
                overridable: true,
                schema: {
                  enum: ["speed", "quality"],
                },
              },
              {
                name: "size",
                type: "string",
                default: "1920x1080",
                overridable: true,
                schema: {
                  enum: ["1280x720", "1920x1080", "3840x2160"],
                },
              },
              {
                name: "fps",
                type: "integer",
                default: 30,
                overridable: true,
                schema: {
                  enum: [30, 60],
                },
              },
              {
                name: "duration",
                type: "integer",
                default: 5,
                overridable: true,
                schema: {
                  enum: [5, 10],
                },
              },
            ],
            request: {
              method: "POST",
              path: "/api/paas/v4/videos/generations",
              headers: {
                Authorization: "Bearer {{auth.apiKey}}",
                "Content-Type": "application/json",
              },
              body: {
                model: "{{model.id}}",
                prompt: "{{input.prompt}}",
                quality: "{{params.quality}}",
                size: "{{params.size}}",
                fps: "{{params.fps}}",
                duration: "{{params.duration}}",
              },
            },
            response: {
              mode: "task",
              outputs: [
                {
                  type: "video",
                  source: "url",
                  path: "/video_result",
                  itemPath: "/url",
                },
              ],
              errorPath: "/error/message",
              task: {
                idPath: "/id",
                request: {
                  method: "GET",
                  path: "/api/paas/v4/async-result/{{task.id}}",
                  headers: {
                    Authorization: "Bearer {{auth.apiKey}}",
                  },
                },
                statusPath: "/task_status",
                successValues: ["SUCCESS"],
                failureValues: ["FAIL"],
                intervalSeconds: 3,
              },
            },
          },
          sampleInput: {
            prompt: "小猫在草地上追逐小球",
          },
          isDefault: true,
        },
        {
          id: "cogvideox-3-image",
          version: 1,
          label: "图生视频",
          sourceUrl: "https://docs.bigmodel.cn/api-reference/模型-api/视频生成异步",
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
                  maxLength: 512,
                },
                image: {
                  type: "string",
                  minLength: 1,
                },
              },
            },
            parameters: [
              {
                name: "quality",
                type: "string",
                default: "speed",
                overridable: true,
                schema: {
                  enum: ["speed", "quality"],
                },
              },
              {
                name: "size",
                type: "string",
                default: "1920x1080",
                overridable: true,
                schema: {
                  enum: ["1280x720", "1920x1080", "3840x2160"],
                },
              },
              {
                name: "fps",
                type: "integer",
                default: 30,
                overridable: true,
                schema: {
                  enum: [30, 60],
                },
              },
              {
                name: "duration",
                type: "integer",
                default: 5,
                overridable: true,
                schema: {
                  enum: [5, 10],
                },
              },
            ],
            request: {
              method: "POST",
              path: "/api/paas/v4/videos/generations",
              headers: {
                Authorization: "Bearer {{auth.apiKey}}",
                "Content-Type": "application/json",
              },
              body: {
                model: "{{model.id}}",
                prompt: "{{input.prompt}}",
                quality: "{{params.quality}}",
                size: "{{params.size}}",
                fps: "{{params.fps}}",
                duration: "{{params.duration}}",
                image_url: "{{input.image}}",
              },
            },
            response: {
              mode: "task",
              outputs: [
                {
                  type: "video",
                  source: "url",
                  path: "/video_result",
                  itemPath: "/url",
                },
              ],
              errorPath: "/error/message",
              task: {
                idPath: "/id",
                request: {
                  method: "GET",
                  path: "/api/paas/v4/async-result/{{task.id}}",
                  headers: {
                    Authorization: "Bearer {{auth.apiKey}}",
                  },
                },
                statusPath: "/task_status",
                successValues: ["SUCCESS"],
                failureValues: ["FAIL"],
                intervalSeconds: 3,
              },
            },
          },
          sampleInput: {
            prompt: "小猫在草地上追逐小球",
            image: "https://example.com/first.png",
          },
        },
        {
          id: "cogvideox-3-frames",
          version: 1,
          label: "首尾帧生视频",
          sourceUrl: "https://docs.bigmodel.cn/api-reference/模型-api/视频生成异步",
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
                  maxLength: 512,
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
                name: "quality",
                type: "string",
                default: "speed",
                overridable: true,
                schema: {
                  enum: ["speed", "quality"],
                },
              },
              {
                name: "size",
                type: "string",
                default: "1920x1080",
                overridable: true,
                schema: {
                  enum: ["1280x720", "1920x1080", "3840x2160"],
                },
              },
              {
                name: "fps",
                type: "integer",
                default: 30,
                overridable: true,
                schema: {
                  enum: [30, 60],
                },
              },
              {
                name: "duration",
                type: "integer",
                default: 5,
                overridable: true,
                schema: {
                  enum: [5, 10],
                },
              },
            ],
            request: {
              method: "POST",
              path: "/api/paas/v4/videos/generations",
              headers: {
                Authorization: "Bearer {{auth.apiKey}}",
                "Content-Type": "application/json",
              },
              body: {
                model: "{{model.id}}",
                prompt: "{{input.prompt}}",
                quality: "{{params.quality}}",
                size: "{{params.size}}",
                fps: "{{params.fps}}",
                duration: "{{params.duration}}",
                image_url: ["{{input.image}}", "{{input.lastImage}}"],
              },
            },
            response: {
              mode: "task",
              outputs: [
                {
                  type: "video",
                  source: "url",
                  path: "/video_result",
                  itemPath: "/url",
                },
              ],
              errorPath: "/error/message",
              task: {
                idPath: "/id",
                request: {
                  method: "GET",
                  path: "/api/paas/v4/async-result/{{task.id}}",
                  headers: {
                    Authorization: "Bearer {{auth.apiKey}}",
                  },
                },
                statusPath: "/task_status",
                successValues: ["SUCCESS"],
                failureValues: ["FAIL"],
                intervalSeconds: 3,
              },
            },
          },
          sampleInput: {
            prompt: "小猫在草地上追逐小球",
            image: "https://example.com/first.png",
            lastImage: "https://example.com/last.png",
          },
        },
      ],
    },
  ],
};
