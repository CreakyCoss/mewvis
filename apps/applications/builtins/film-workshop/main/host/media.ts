import { defineTool, type MewvisApplicationContext } from "@mewvis/app-sdk";
import { createAssistantStore } from "../assistant/store";
import { createMediaRequestStore } from "../assistant/media-requests";
import { generationMessage } from "../media";
import { identifier } from "../assistant/proposals";
import type { FilmGeneration } from "../model";

export function createMediaRequestTool(
  context: Pick<MewvisApplicationContext, "storage" | "files">,
) {
  return defineTool({
    name: "film_prepare_media",
    description:
      "在生成图片、视频或配音前登记影视工坊任务，锁定项目、本集镜头和用途，返回生成指令与输出目录。按钮和普通对话都必须使用；实际生成由 generate_media 执行，应用自动回填结果。先查询当前模型支持的用途；目标或必需信息不明确时先调用 ask_user。重复登记同一轮、同一镜头与用途会返回同一个任务。",
    risk: "low",
    parameters: {
      type: "object",
      properties: {
        contextId: {
          type: "string",
          description: "本轮 runtimeInstruction 的 contextId。",
        },
        chatId: {
          type: "string",
          description: "本轮 runtimeInstruction 的 chatId。",
        },
        purpose: {
          type: "string",
          enum: ["image-generation", "video-generation", "speech"],
        },
        shotId: {
          type: "string",
          description:
            "本集目标镜头 ID，省略时使用本轮选中的镜头。无明确目标时先 ask_user，不得猜测。",
        },
        prompt: {
          type: "string",
          description:
            "用户明确给出的生成内容或确认后的提示词／台词；省略时使用镜头现有内容。",
        },
        attempt: {
          type: "integer",
          description:
            "首次与普通澄清均省略或为 0。同一轮中生成失败后，只有通过 ask_user 获得明确重试授权才递增为 1、2…，创建新的生成目录。",
        },
      },
      required: ["contextId", "chatId", "purpose"],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: "object",
        properties: {
          requestId: { type: "string" },
          instruction: { type: "string" },
        },
        required: ["requestId", "instruction"],
        additionalProperties: false,
      },
      render: (_args: unknown, value: unknown) => [
        { type: "text" as const, text: JSON.stringify(value) },
      ],
    },
    async execute(value: unknown) {
      if (!context.storage || !context.files)
        throw new Error("媒体任务需要应用存储与文件服务");
      const input = value as {
        contextId: string;
        chatId: string;
        purpose: FilmGeneration["purpose"];
        shotId?: string;
        prompt?: string;
        attempt?: number;
      };
      if (
        !input ||
        typeof input !== "object" ||
        Array.isArray(input) ||
        Object.keys(input).some(
          (key) =>
            ![
              "contextId",
              "chatId",
              "purpose",
              "shotId",
              "prompt",
              "attempt",
            ].includes(key),
        ) ||
        (input.prompt !== undefined && typeof input.prompt !== "string")
      )
        throw new Error("媒体任务参数无效");
      const source = await createAssistantStore(
        context.storage,
        context.files,
      ).context(identifier(input.chatId), identifier(input.contextId));
      const job = await createMediaRequestStore(context.storage).prepare(
        source,
        input.purpose,
        input.shotId === undefined ? undefined : identifier(input.shotId),
        input.prompt,
        input.attempt,
      );
      const episode = source.project.episodes.find(
        (item) => item.id === job.episodeId,
      )!;
      const shot = episode.shots.find((item) => item.id === job.shotId)!;
      return {
        requestId: job.id,
        instruction: generationMessage(source.project, episode, shot, job, true)
          .text,
      };
    },
  });
}
