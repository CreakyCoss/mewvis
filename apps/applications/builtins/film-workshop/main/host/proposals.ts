import { defineTool, type MewvisApplicationContext } from "@mewvis/app-sdk";
import { createProposal } from "../assistant/proposals";
import { createAssistantStore } from "../assistant/store";

const string = { type: "string", description: "最多 12000 字符" };
const name = { type: "string", description: "非空名称，最多 120 字符" };
const id = {
  type: "string",
  description: "上下文中的标识，不得编造已有实体 ID",
};
export function createProposalTool(
  context: Pick<MewvisApplicationContext, "storage" | "files">,
) {
  return defineTool({
    name: "film_propose_changes",
    description:
      "向影视工坊提交剧本、角色／场景／道具和分镜的结构化建议，等待用户预览并按项采用。不会直接修改项目。使用本轮 runtimeInstruction 中的 contextId、chatId；修改已有实体时传 id，仅填写需要修改的字段；新增素材以 key 供镜头的 sceneId、characterIds、speakerId 引用，也可引用已有素材 ID。素材最多 150 项、镜头最多 200 项。不支持删除、改顺序、修改媒体或跨分集操作。",
    risk: "medium",
    parameters: {
      type: "object",
      properties: {
        contextId: id,
        chatId: id,
        title: name,
        script: {
          type: "string",
          description:
            "本集完整剧本的新版本，最多 80000 字符；不需要修改剧本时省略。",
        },
        assets: {
          type: "array",
          items: {
            type: "object",
            properties: {
              key: {
                ...id,
                description:
                  "本次建议中唯一的素材引用名，如 character-1；镜头引用此 key。",
              },
              id,
              kind: { type: "string", enum: ["character", "scene", "prop"] },
              name,
              description: string,
              prompt: string,
            },
            required: ["key"],
            additionalProperties: false,
          },
        },
        shots: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id,
              title: name,
              description: string,
              sceneId: string,
              characterIds: { type: "array", items: id },
              framing: name,
              camera: string,
              duration: { type: "number", description: "镜头时长，0.5–120 秒" },
              imagePrompt: string,
              videoPrompt: string,
              dialogue: string,
              speakerId: string,
              voice: { type: "string" },
              sound: string,
            },
            additionalProperties: false,
          },
        },
      },
      required: ["contextId", "chatId", "title"],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: "object",
        properties: {
          proposalId: id,
          title: name,
          count: { type: "integer" },
          status: { type: "string", enum: ["pending"] },
        },
        required: ["proposalId", "title", "count", "status"],
        additionalProperties: false,
      },
      render: (_args: unknown, value: unknown) => [
        { type: "text" as const, text: JSON.stringify(value) },
      ],
    },
    async execute(value: unknown) {
      if (!context.storage || !context.files)
        throw new Error("创作建议需要应用存储与文件服务");
      const input = value as { contextId?: unknown; chatId?: unknown } | null;
      if (
        typeof input?.contextId !== "string" ||
        typeof input.chatId !== "string"
      )
        throw new Error("请传入当前创作上下文标识");
      const store = createAssistantStore(context.storage, context.files);
      const source = await store.context(input.chatId, input.contextId);
      const proposal = createProposal(value, source);
      await store.publish(proposal);
      return {
        proposalId: proposal.id,
        title: proposal.title,
        count: proposal.changes.length,
        status: "pending" as const,
      };
    },
  });
}
