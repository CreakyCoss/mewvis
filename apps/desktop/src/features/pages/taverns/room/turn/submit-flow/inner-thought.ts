import {
  getTavernRoomCharacterMemoryLayers,
  getTavernRoomScene,
  getTavernRoomSceneFields,
  type TavernRoomRuntime,
} from "@/features/pages/taverns/room/model";
import type { RuntimeModelInput } from "@/agent-client/types";
import type { TavernMessage } from "@/features/pages/taverns/tavern/types";
import type { TavernCharacter } from "@/features/pages/taverns/manage/model";
import { cleanTavernThoughtText } from "@/features/pages/taverns/room/message/protocol/parse-reply";
import {
  formatTavernVisibleMessagesForRequestContext,
  normalizeTavernMessagesForAudience,
} from "@/features/pages/taverns/room/message/domain/visibility";
import { formatTavernRoomPromptXml, TAVERN_ROOM_PROMPT_XML_TAGS } from "@/features/pages/taverns/room/prompt-xml";
import { buildTavernBridgeSystemPrompt } from "../prompt/bridge/system-prompt";
import { tavernBridgeSessionRootDir, tavernCharacterAgentRoleId } from "@/features/pages/taverns/room/turn/agent-role";
import { formatTavernCharacterRelationships } from "@/features/pages/taverns/tavern/core/relationships";
import { runTavernRuntimeAgent } from "../agent/run-agent";
export type RunTavernInnerThoughtInput = {
  workspacePath: string;
  runtimeModel: RuntimeModelInput;
  room: TavernRoomRuntime;
  activeCharacter: TavernCharacter;
  characters: TavernCharacter[];
  messages: TavernMessage[];
  currentUserText: string;
  replyContent: string;
};

const resolveInnerThoughtSceneText = (room: TavernRoomRuntime) => getTavernRoomScene(room).scene;

export const runTavernInnerThought = async ({
  workspacePath,
  runtimeModel,
  room,
  activeCharacter,
  characters,
  messages,
  currentUserText,
  replyContent,
}: RunTavernInnerThoughtInput) => {
  const visibleMessages = normalizeTavernMessagesForAudience({
    messages,
    characters,
    userPersonaName: room.user.personaName,
    audience: { type: "character", characterId: activeCharacter.id },
  }).slice(-8);
  const sceneFields = getTavernRoomSceneFields(room);
  const characterMemoryLayers = getTavernRoomCharacterMemoryLayers(room, activeCharacter.id);
  const characterMemory = [
    characterMemoryLayers?.required?.trim() ?? "",
    characterMemoryLayers?.public?.trim() ?? "",
    characterMemoryLayers?.known?.trim() ?? "",
    characterMemoryLayers?.privateSelf?.trim() ?? "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const relationshipText = formatTavernCharacterRelationships({
    character: activeCharacter,
    characters,
    userPersonaName: room.user.personaName,
    relationshipOverrides: sceneFields.relationshipOverrides,
  });
  const result = await runTavernRuntimeAgent({
    workspacePath,
    sessionRootDir: tavernBridgeSessionRootDir(room),
    agentRoleId: tavernCharacterAgentRoleId(room, activeCharacter),
    runtimeModel,
    systemPrompt: buildTavernBridgeSystemPrompt(room),
    userMessage: "请只输出当前角色此刻没有说出口的一句内心想法。",
    requestContext: formatTavernRoomPromptXml([
      {
        tag: TAVERN_ROOM_PROMPT_XML_TAGS.activeCharacter,
        text: [
          `name: ${activeCharacter.name}`,
          `description: ${activeCharacter.description}`,
          `speakingStyle: ${activeCharacter.speakingStyle}`,
          activeCharacter.goals ? `goals: ${activeCharacter.goals}` : "",
          relationshipText ? `relationships: ${relationshipText}` : "",
          characterMemory ? `memory: ${characterMemory}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      },
      { text: "" },
      {
        tag: TAVERN_ROOM_PROMPT_XML_TAGS.room,
        attributes: { title: room.identity.title },
        text: resolveInnerThoughtSceneText(room),
      },
      { text: "" },
      {
        tag: TAVERN_ROOM_PROMPT_XML_TAGS.currentUserInput,
        text: currentUserText,
      },
      { text: "" },
      {
        tag: TAVERN_ROOM_PROMPT_XML_TAGS.recentConversation,
        text: formatTavernVisibleMessagesForRequestContext(visibleMessages),
        textMode: "raw",
      },
      { text: "" },
      {
        tag: TAVERN_ROOM_PROMPT_XML_TAGS.generatedReply,
        text: replyContent,
      },
    ]),
    runtimeInstruction: [
      "你是酒馆模式的角色内心独白补写器。",
      "只为当前角色补一条会显示在聊天气泡里的内心想法，不是模型推理过程。",
      "只输出 12 到 80 个中文字符的一句话；不要输出标签、角色名、解释、Markdown 或代码块。",
      "内心想法必须贴合角色人设、当前公开回复和现场，不要替其他角色写心理。",
    ].join("\n"),
  });

  return cleanTavernThoughtText(result.text).slice(0, 120);
};
