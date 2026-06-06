import { appendReferencesToPrompt } from "@/features/workspace-chat/utils/references";
import type { ConversationMessage } from "@/features/workspace-chat/types";
import type {
  TavernCharacter,
  TavernMessage,
  TavernReferencedFile,
  TavernRoom,
} from "../types";

const formatCharacter = (character: TavernCharacter) => [
  `name: ${character.name}`,
  `description: ${character.description}`,
  `speakingStyle: ${character.speakingStyle}`,
  character.goals ? `goals: ${character.goals}` : "",
  character.relationships ? `relationships: ${character.relationships}` : "",
].filter(Boolean).join("\n");

export const buildTavernSystemPrompt = ({
  room,
  activeCharacter,
  characters,
  references,
  currentUserText,
}: {
  room: TavernRoom;
  activeCharacter: TavernCharacter;
  characters: TavernCharacter[];
  references: TavernReferencedFile[];
  currentUserText: string;
}) => {
  const basePrompt = [
    "你正在 Novel Claw 的酒馆模式中扮演一个角色。",
    "",
    "硬性规则：",
    `- 这轮只允许以「${activeCharacter.name}」的身份发言。`,
    "- 不要代替用户说话，不要替其他角色完整发言。",
    "- 可以用简短动作描写，但主体必须是角色回应。",
    "- 如果引用文件或设定信息不足，基于已有场景合理推进，不要询问用户补充。",
    "- 输出中文，保持沉浸感，避免解释你是模型或系统。",
    "",
    "<room_scene>",
    `room: ${room.title}`,
    room.scene,
    "</room_scene>",
    "",
    "<active_character>",
    formatCharacter(activeCharacter),
    "</active_character>",
    "",
    "<present_characters instruction=\"persona_context_only\">",
    characters.map(formatCharacter).join("\n\n---\n\n"),
    "</present_characters>",
  ].join("\n");

  return appendReferencesToPrompt(basePrompt, references, {
    query: currentUserText,
    perFileChars: 12000,
    totalChars: 26000,
  });
};

export const tavernMessagesToRuntimeMessages = ({
  messages,
  characters,
  userPersonaName,
}: {
  messages: TavernMessage[];
  characters: TavernCharacter[];
  userPersonaName: string;
}): ConversationMessage[] => {
  const characterById = new Map(characters.map((character) => [character.id, character]));

  return messages.slice(-24).map((message) => {
    if (message.role === "user") {
      return {
        id: message.id,
        role: "user",
        content: `${userPersonaName}: ${message.content}`,
        timestamp: message.createdAt,
        metadata: null,
      };
    }

    if (message.role === "narrator") {
      return {
        id: message.id,
        role: "assistant",
        content: `旁白: ${message.content}`,
        timestamp: message.createdAt,
        metadata: null,
      };
    }

    const character = message.characterId ? characterById.get(message.characterId) : null;
    return {
      id: message.id,
      role: "assistant",
      content: `${character?.name ?? "角色"}: ${message.content}`,
      timestamp: message.createdAt,
      metadata: null,
    };
  });
};
