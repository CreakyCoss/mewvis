import type {
  TavernCharacter,
  TavernMessage,
  TavernReferencedFile,
  TavernRoom,
} from "../types";
import { buildTavernSystemPrompt } from "./prompt";
import { buildTavernBridgeSystemPrompt } from "./bridge-prompt";
import {
  formatTavernVisibleMessagesForRequestContext,
  normalizeTavernMessagesForAudience,
  tavernBridgeSessionRootDir,
  tavernCharacterAgentRoleId,
} from "../core";

export type TavernReplyAgentRequestInput = {
  room: TavernRoom;
  activeCharacter: TavernCharacter;
  characters: TavernCharacter[];
  messages: TavernMessage[];
  references: TavernReferencedFile[];
  currentUserText: string;
  turnInstruction?: string;
};

export const buildTavernReplyAgentRequest = ({
  room,
  activeCharacter,
  characters,
  messages,
  references,
  currentUserText,
  turnInstruction,
}: TavernReplyAgentRequestInput) => {
  const promptContext = buildTavernSystemPrompt({
    room,
    activeCharacter,
    characters,
    references,
    currentUserText,
    turnInstruction,
  });
  const visibleMessages = normalizeTavernMessagesForAudience({
    messages,
    characters,
    userPersonaName: room.userPersonaName,
    audience: { type: "character", characterId: activeCharacter.id },
  });

  return {
    sessionRootDir: tavernBridgeSessionRootDir(room.id),
    agentRoleId: tavernCharacterAgentRoleId(room, activeCharacter),
    systemPrompt: buildTavernBridgeSystemPrompt(room),
    userMessage: [
      `请以「${activeCharacter.name}」的身份生成本轮回复。`,
      "输出必须包含 <inner_thought>...</inner_thought> 和 <reply>...</reply>。",
      "<reply> 必须非空；即使没有新信息，也要用当前角色口吻说一句简短公开状态。",
    ].join("\n"),
    requestContext: [
      promptContext,
      "",
      "<visible_turn_messages>",
      formatTavernVisibleMessagesForRequestContext(visibleMessages),
      "</visible_turn_messages>",
    ].join("\n"),
    runtimeInstruction: turnInstruction ?? null,
  };
};
