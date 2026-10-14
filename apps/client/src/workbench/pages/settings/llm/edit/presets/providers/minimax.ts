import type { ProviderPreset } from "../types";

export const minimaxPreset: ProviderPreset = {
  id: "minimax-cn",
  label: "MiniMax",
  websiteUrl: "https://www.minimax.com",
  idPrefixes: ["minimax"],
  apis: [
    { apiFormat: "anthropic-messages", apiEndpoint: "https://api.minimaxi.com/anthropic" },
    { apiFormat: "openai-completions", apiEndpoint: "https://api.minimaxi.com/v1" },
  ],
  templates: [
    {
      id: "minimax-image-01",
      label: "MiniMax · Image-01",
      sourceUrl: "https://platform.minimax.io/docs/api-reference/image-generation-t2i",
      sampleInput: {
        prompt:
          "A man in a white t-shirt, full-body, standing front view, outdoors, with the Venice Beach sign in the background, Los Angeles. Fashion photography in 90s documentary style, film grain, photorealistic.",
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
            default: 3,
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
      version: 1,
      match: {
        modelIds: ["image-01"],
      },
    },
    {
      id: "minimax-video-h3",
      label: "MiniMax · Hailuo 3",
      sourceUrl: "https://platform.minimax.io/docs/api-reference/video-generation-v2-create",
      sampleInput: {
        prompt: "A slow camera pan across a quiet seaside town",
      },
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
              enum: ["16:9", "9:16", "1:1", "adaptive"],
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
            failureValues: ["failed"],
            intervalSeconds: 3,
          },
        },
      },
      version: 1,
      match: {
        modelPattern: "hailuo.*3",
      },
    },
  ],
};
