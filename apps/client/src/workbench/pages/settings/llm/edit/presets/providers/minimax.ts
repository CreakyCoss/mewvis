import type { ModelPreset, ProviderPreset } from "../types";
import type { ModelSchemaOption } from "@mewvis/chat-contracts/model-configuration";

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
          version: 3,
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
                description: "图片宽高比。1:1 为方形，16:9 为横向宽屏，9:16 为竖屏；根据用户要求选择。",
                type: "string",
                default: "16:9",
                overridable: true,
                schema: {
                  enum: ["1:1", "16:9", "4:3", "3:2", "2:3", "3:4", "9:16", "21:9"],
                },
              },
              {
                name: "response_format",
                description: "图片返回形式：链接或 Base64 图像数据。",
                type: "string",
                default: "url",
                overridable: false,
                schema: {
                  options: [{ value: "url", label: "图片链接" }, { value: "base64", label: "Base64 图像数据" }],
                },
              },
              {
                name: "n",
                description: "一次生成的图片数量，允许 1–9 张。",
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
                description: "是否自动优化提示词；关闭后更直接使用传入的提示词。",
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
          version: 2,
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
                description: "参考人物生成图片的宽高比。1:1 为方形，16:9 为横向宽屏，9:16 为竖屏。",
                type: "string",
                default: "16:9",
                overridable: true,
                schema: {
                  enum: ["1:1", "16:9", "4:3", "3:2", "2:3", "3:4", "9:16", "21:9"],
                },
              },
              {
                name: "response_format",
                description: "图片返回形式：链接或 Base64 图像数据。",
                type: "string",
                default: "url",
                overridable: false,
                schema: {
                  options: [{ value: "url", label: "图片链接" }, { value: "base64", label: "Base64 图像数据" }],
                },
              },
              {
                name: "n",
                description: "一次生成的图片数量，允许 1–9 张。",
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
                description: "是否自动优化提示词；关闭后更直接使用传入的提示词。",
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
        version: 3,
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
              description: "视频秒数；10 秒仅支持 768P，1080P 仅支持 6 秒。",
              type: "integer",
              default: 6,
              overridable: true,
              schema: { enum: [6, 10] },
            },
            {
              name: "resolution",
              description: "视频分辨率。1080P 仅支持 6 秒；10 秒请选择 768P。",
              type: "string",
              default: "768P",
              overridable: true,
              schema: {
                options: [
                  { value: "768P", label: "768P", description: "支持 6 秒和 10 秒视频" },
                  { value: "1080P", label: "1080P", description: "仅支持 6 秒视频" },
                ],
              },
            },
            {
              name: "prompt_optimizer",
              type: "boolean",
              description: "是否自动优化视频提示词；关闭后更精确遵循原始提示词。",
              default: true,
              overridable: true,
            },
            {
              name: "fast_pretreatment",
              type: "boolean",
              description: "是否缩短提示词优化耗时；仅在 prompt_optimizer 启用时生效。",
              default: false,
              overridable: true,
            },
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
      { modelId: "MiniMax-H3", templateId: "minimax-video-h3", version: 4, resolutions: ["768P", "2K"], minDuration: 4 },
      { modelId: "MiniMax-H3-Max", templateId: "minimax-video-h3-max", version: 3, resolutions: ["480P", "768P"], minDuration: 5 },
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
              name: "resolution", description: `${modelId} 的输出分辨率；按模型支持的选项选择。`,
              type: "string", default: "768P", overridable: true,
              schema: {
                options: resolutions.map((value) => ({ value, label: value })),
              },
            },
            {
              name: "duration", description: `视频时长（秒），${modelId} 支持 ${minDuration}–15 秒。`,
              type: "integer", default: 6, overridable: true,
              schema: { minimum: minDuration, maximum: 15 },
            },
            {
              name: "ratio", description: "输出视频宽高比：16:9 为横屏，9:16 为竖屏，1:1 为方形。仅文生视频有效；传入首帧或尾帧时，服务端按图片比例自动适配。",
              type: "string", default: "16:9", overridable: true,
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
      sourceUrls: [
        "https://platform.minimax.io/docs/api-reference/speech-t2a-http",
        "https://platform.minimax.cn/docs/faq/system-voice-id",
      ],
      templates: [
        {
          id: `minimax-${modelId}`,
          version: 2,
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
                description: "语音合成的音色 ID。根据选项标签中的性别、年龄与风格匹配用户要求；不能可靠选择时先询问。内置普通话系统音色，使用其他语种或自定义音色时请先添加对应选项。",
                type: "string",
                default: "male-qn-qingse",
                overridable: true,
                schema: {
                  minLength: 1,
                  options: minimaxVoiceOptions(),
                },
              },
              {
                name: "speed",
                description: "语速倍率，1 为正常语速；范围 0.5–2，值越大读得越快。",
                type: "number",
                default: 1,
                overridable: true,
                schema: { minimum: 0.5, maximum: 2 },
              },
              {
                name: "vol",
                description: "音量倍率，1 为原始音量；必须大于 0，最大为 10。",
                type: "number",
                default: 1,
                overridable: true,
                schema: { exclusiveMinimum: 0, maximum: 10 },
              },
              {
                name: "pitch",
                description: "音调调整，0 保持原音调；范围 -12–12，负数降低音调，正数提高音调。",
                type: "integer",
                default: 0,
                overridable: true,
                schema: { minimum: -12, maximum: 12 },
              },
              {
                name: "emotion",
                description: "语音表达情绪。不设置时由模型根据文本自动判断；仅在用户明确要求时指定。",
                type: "string",
                overridable: true,
                schema: {
                  options: [
                    { value: "happy", label: "开心" },
                    { value: "sad", label: "悲伤" },
                    { value: "angry", label: "愤怒" },
                    { value: "fearful", label: "害怕" },
                    { value: "disgusted", label: "厌恶" },
                    { value: "surprised", label: "惊讶" },
                    { value: "calm", label: "平静" },
                  ],
                },
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
                  emotion: "{{params.emotion?}}",
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

// Official Mandarin system voices, verified 2026-10-24.
// https://platform.minimax.cn/docs/faq/system-voice-id
function minimaxVoiceOptions(): ModelSchemaOption[] {
  return [
    { value: "male-qn-qingse", label: "男声 · 青涩青年音色" },
    { value: "male-qn-jingying", label: "男声 · 精英青年音色" },
    { value: "male-qn-badao", label: "男声 · 霸道青年音色" },
    { value: "male-qn-daxuesheng", label: "男声 · 青年大学生音色" },
    { value: "female-shaonv", label: "女声 · 少女音色" },
    { value: "female-yujie", label: "女声 · 御姐音色" },
    { value: "female-chengshu", label: "女声 · 成熟女性音色" },
    { value: "female-tianmei", label: "女声 · 甜美女性音色" },
    { value: "male-qn-qingse-jingpin", label: "男声 · 青涩青年音色-beta" },
    { value: "male-qn-jingying-jingpin", label: "男声 · 精英青年音色-beta" },
    { value: "male-qn-badao-jingpin", label: "男声 · 霸道青年音色-beta" },
    { value: "male-qn-daxuesheng-jingpin", label: "男声 · 青年大学生音色-beta" },
    { value: "female-shaonv-jingpin", label: "女声 · 少女音色-beta" },
    { value: "female-yujie-jingpin", label: "女声 · 御姐音色-beta" },
    { value: "female-chengshu-jingpin", label: "女声 · 成熟女性音色-beta" },
    { value: "female-tianmei-jingpin", label: "女声 · 甜美女性音色-beta" },
    { value: "clever_boy", label: "聪明男童" },
    { value: "cute_boy", label: "可爱男童" },
    { value: "lovely_girl", label: "萌萌女童" },
    { value: "cartoon_pig", label: "卡通猪小琪" },
    { value: "bingjiao_didi", label: "病娇弟弟" },
    { value: "junlang_nanyou", label: "俊朗男友" },
    { value: "chunzhen_xuedi", label: "纯真学弟" },
    { value: "lengdan_xiongzhang", label: "冷淡学长" },
    { value: "badao_shaoye", label: "霸道少爷" },
    { value: "tianxin_xiaoling", label: "甜心小玲" },
    { value: "qiaopi_mengmei", label: "俏皮萌妹" },
    { value: "wumei_yujie", label: "妩媚御姐" },
    { value: "diadia_xuemei", label: "嗲嗲学妹" },
    { value: "danya_xuejie", label: "淡雅学姐" },
    { value: "Chinese (Mandarin)_Reliable_Executive", label: "沉稳高管" },
    { value: "Chinese (Mandarin)_News_Anchor", label: "新闻女声" },
    { value: "Chinese (Mandarin)_Mature_Woman", label: "傲娇御姐" },
    { value: "Chinese (Mandarin)_Unrestrained_Young_Man", label: "不羁青年" },
    { value: "Arrogant_Miss", label: "嚣张小姐" },
    { value: "Robot_Armor", label: "机械战甲" },
    { value: "Chinese (Mandarin)_Kind-hearted_Antie", label: "热心大婶" },
    { value: "Chinese (Mandarin)_HK_Flight_Attendant", label: "港普空姐" },
    { value: "Chinese (Mandarin)_Humorous_Elder", label: "搞笑大爷" },
    { value: "Chinese (Mandarin)_Gentleman", label: "温润男声" },
    { value: "Chinese (Mandarin)_Warm_Bestie", label: "温暖闺蜜" },
    { value: "Chinese (Mandarin)_Male_Announcer", label: "播报男声" },
    { value: "Chinese (Mandarin)_Sweet_Lady", label: "甜美女声" },
    { value: "Chinese (Mandarin)_Southern_Young_Man", label: "南方小哥" },
    { value: "Chinese (Mandarin)_Wise_Women", label: "阅历姐姐" },
    { value: "Chinese (Mandarin)_Gentle_Youth", label: "温润青年" },
    { value: "Chinese (Mandarin)_Warm_Girl", label: "温暖少女" },
    { value: "Chinese (Mandarin)_Kind-hearted_Elder", label: "花甲奶奶" },
    { value: "Chinese (Mandarin)_Cute_Spirit", label: "憨憨萌兽" },
    { value: "Chinese (Mandarin)_Radio_Host", label: "电台男主播" },
    { value: "Chinese (Mandarin)_Lyrical_Voice", label: "抒情男声" },
    { value: "Chinese (Mandarin)_Straightforward_Boy", label: "率真弟弟" },
    { value: "Chinese (Mandarin)_Sincere_Adult", label: "真诚青年" },
    { value: "Chinese (Mandarin)_Gentle_Senior", label: "温柔学姐" },
    { value: "Chinese (Mandarin)_Stubborn_Friend", label: "嘴硬竹马" },
    { value: "Chinese (Mandarin)_Crisp_Girl", label: "清脆少女" },
    { value: "Chinese (Mandarin)_Pure-hearted_Boy", label: "清澈邻家弟弟" },
    { value: "Chinese (Mandarin)_Soft_Girl", label: "柔和少女" },
  ];
}
