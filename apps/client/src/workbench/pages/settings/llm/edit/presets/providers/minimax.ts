import type { ModelPreset, ProviderPreset } from "../types";

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
      modelId: "MiniMax-Hailuo-2.3",
      label: "MiniMax-Hailuo-2.3",
      sourceUrls: [
        "https://platform.minimax.io/docs/api-reference/video-generation-t2v",
        "https://platform.minimax.io/docs/api-reference/video-generation-i2v",
        "https://platform.minimax.io/docs/api-reference/video-generation-query",
        "https://platform.minimax.io/docs/api-reference/file-management-retrieve",
      ],
      templates: [{
        id: "minimax-video-hailuo-2.3",
        version: 2,
        label: "视频生成（文生 / 图生）",
        sourceUrl: "https://platform.minimax.io/docs/api-reference/video-generation-t2v",
        isDefault: true,
        purpose: {
          type: "video-generation",
          adapter: "http-json",
          input: ["text", "image"],
          output: ["video"],
          inputSchema: {
            type: "object",
            required: ["prompt"],
            properties: {
              prompt: { type: "string", minLength: 1, maxLength: 2000 },
              image: {
                type: "string",
                minLength: 1,
                description: "可选首帧图片，支持公开 URL 或 JPG/JPEG/PNG/WebP 的 Data URL；不提供时使用文生视频。",
              },
            },
          },
          parameters: [
            {
              name: "duration",
              type: "integer",
              default: 6,
              overridable: true,
              schema: { enum: [6, 10], description: "视频秒数；10 秒仅支持 768P，1080P 仅支持 6 秒。" },
            },
            {
              name: "resolution",
              type: "string",
              default: "768P",
              overridable: true,
              schema: { enum: ["768P", "1080P"], description: "1080P 仅支持 6 秒；10 秒请选择 768P。" },
            },
            { name: "prompt_optimizer", type: "boolean", default: true, overridable: true },
            { name: "fast_pretreatment", type: "boolean", default: false, overridable: true,
              schema: { description: "仅在 prompt_optimizer 启用时生效。" } },
          ],
          request: {
            method: "POST",
            path: "/v1/video_generation",
            headers: {
              Authorization: "Bearer {{auth.apiKey}}",
              "Content-Type": "application/json",
            },
            body: {
              model: "{{model.id}}",
              prompt: "{{input.prompt}}",
              first_frame_image: "{{input.image?}}",
              duration: "{{params.duration}}",
              resolution: "{{params.resolution}}",
              prompt_optimizer: "{{params.prompt_optimizer}}",
              fast_pretreatment: "{{params.fast_pretreatment}}",
            },
          },
          response: {
            mode: "task",
            success: { path: "/base_resp/status_code", equals: 0 },
            errorPath: "/base_resp/status_msg",
            task: {
              idPath: "/task_id",
              request: {
                method: "GET",
                path: "/v1/query/video_generation?task_id={{task.id}}",
                headers: { Authorization: "Bearer {{auth.apiKey}}" },
              },
              statusPath: "/status",
              successValues: ["Success"],
              failureValues: ["Fail"],
              intervalSeconds: 10,
              resultRequest: {
                method: "GET",
                path: "/v1/files/retrieve?file_id={{result.file_id}}",
                headers: { Authorization: "Bearer {{auth.apiKey}}" },
              },
            },
            outputs: [{ type: "video", source: "url", path: "/file/download_url", mimeType: "video/mp4" }],
          },
        },
        sampleInput: {
          prompt: "镜头缓缓掠过海边小镇",
        },
      }],
    },
    ...[
      { modelId: "MiniMax-H3", templateId: "minimax-video-h3", version: 3, resolutions: ["768P", "2K"], minDuration: 4 },
      { modelId: "MiniMax-H3-Max", templateId: "minimax-video-h3-max", version: 2, resolutions: ["480P", "768P"], minDuration: 5 },
    ].map(({ modelId, templateId, version, resolutions, minDuration }): ModelPreset => ({
      modelId,
      label: modelId,
      sourceUrls: [
        "https://platform.minimax.io/docs/api-reference/video-generation-v2-create",
        "https://platform.minimax.io/docs/api-reference/video-generation-v2-query",
      ],
      templates: [{
        id: templateId,
        version,
        label: "视频生成（文生 / 图生 / 首尾帧）",
        sourceUrl: "https://platform.minimax.io/docs/api-reference/video-generation-v2-create",
        isDefault: true,
        purpose: {
          type: "video-generation",
          adapter: "http-json",
          input: ["text", "image"],
          output: ["video"],
          inputSchema: {
            type: "object",
            required: ["prompt"],
            properties: {
              prompt: { type: "string", minLength: 1 },
              image: { type: "string", minLength: 1, description: "可选首帧图片 URL 或 Data URL。" },
              lastImage: { type: "string", minLength: 1, description: "可选尾帧图片 URL 或 Data URL，可单独提供。" },
            },
          },
          parameters: [
            {
              name: "resolution", type: "string", default: "768P", overridable: true,
              schema: { enum: resolutions },
            },
            {
              name: "duration", type: "integer", default: 6, overridable: true,
              schema: { minimum: minDuration, maximum: 15 },
            },
            {
              name: "ratio", type: "string", default: "16:9", overridable: true,
              schema: {
                enum: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
                description: "仅文生视频有效；传入首帧或尾帧时，服务端按图片比例自动适配。",
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
                { type: "text", text: "{{input.prompt}}" },
                {
                  $optional: "{{input.image?}}",
                  $value: {
                    type: "image_url", image_url: { url: "{{input.image}}" }, role: "first_frame",
                  },
                },
                {
                  $optional: "{{input.lastImage?}}",
                  $value: {
                    type: "image_url", image_url: { url: "{{input.lastImage}}" }, role: "last_frame",
                  },
                },
              ],
              resolution: "{{params.resolution}}",
              duration: "{{params.duration}}",
              ratio: "{{params.ratio}}",
            },
          },
          response: {
            mode: "task",
            outputs: [{ type: "video", source: "url", path: "/task/content/url" }],
            errorPath: "/error/message",
            task: {
              idPath: "/task_id",
              request: {
                method: "GET",
                path: "/v2/query/video_generation/{{task.id}}",
                headers: { Authorization: "Bearer {{auth.apiKey}}" },
              },
              statusPath: "/task/status",
              successValues: ["succeeded"],
              failureValues: ["failed", "cancelled"],
              intervalSeconds: 3,
            },
          },
        },
        sampleInput: { prompt: "镜头缓缓掠过海边小镇" },
      }],
    })),
    ...["speech-2.8-hd", "speech-2.8-turbo"].map((modelId): ModelPreset => ({
      modelId,
      label: modelId,
      sourceUrls: ["https://platform.minimax.io/docs/api-reference/speech-t2a-http"],
      templates: [
        {
          id: `minimax-${modelId}`,
          version: 1,
          label: "语音合成",
          purpose: {
            type: "speech",
            adapter: "http-json",
            input: ["text"],
            output: ["audio"],
            inputSchema: {
              type: "object",
              required: ["text"],
              properties: {
                text: { type: "string", minLength: 1, maxLength: 9999 },
              },
            },
            parameters: [
              {
                name: "voice_id",
                type: "string",
                default: "male-qn-qingse",
                overridable: true,
                schema: { minLength: 1 },
              },
              {
                name: "speed",
                type: "number",
                default: 1,
                overridable: true,
                schema: { minimum: 0.5, maximum: 2 },
              },
              {
                name: "vol",
                type: "number",
                default: 1,
                overridable: true,
                schema: { exclusiveMinimum: 0, maximum: 10 },
              },
              {
                name: "pitch",
                type: "integer",
                default: 0,
                overridable: true,
                schema: { minimum: -12, maximum: 12 },
              },
            ],
            request: {
              method: "POST",
              path: "/v1/t2a_v2",
              headers: {
                Authorization: "Bearer {{auth.apiKey}}",
                "Content-Type": "application/json",
              },
              body: {
                model: "{{model.id}}",
                text: "{{input.text}}",
                stream: false,
                output_format: "url",
                voice_setting: {
                  voice_id: "{{params.voice_id}}",
                  speed: "{{params.speed}}",
                  vol: "{{params.vol}}",
                  pitch: "{{params.pitch}}",
                },
                audio_setting: { sample_rate: 32000, bitrate: 128000, format: "mp3", channel: 1 },
              },
            },
            response: {
              mode: "direct",
              outputs: [{ type: "audio", source: "url", path: "/data/audio", mimeType: "audio/mpeg" }],
              success: { path: "/base_resp/status_code", equals: 0 },
              errorPath: "/base_resp/status_msg",
            },
          },
          sampleInput: { text: "你好，欢迎来到 Mewvis。" },
        },
      ],
    })),
  ],
};
