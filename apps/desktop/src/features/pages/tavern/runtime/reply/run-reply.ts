import type { RuntimeModelInput } from "@/agent-client/protocol";
import type {
  TavernCharacter,
  TavernMessage,
  TavernReferencedFile,
  TavernRoom,
} from "../../types";
import {
  cleanTavernThoughtText,
  formatTavernVisibleMessagesForRequestContext,
  normalizeTavernMessagesForAudience,
} from "../../message";
import {
  buildTavernBridgeSystemPrompt,
} from "../conversation";
import {
  formatTavernCharacterRelationships,
  tavernBridgeSessionRootDir,
  tavernCharacterAgentRoleId,
} from "../../core";
import { runTavernRuntimeAgent } from "../agent";
import { buildTavernReplyAgentRequest } from "./request";

export type RunTavernReplyInput = {
  workspacePath: string;
  runtimeAgentId: string;
  runtimeModel: RuntimeModelInput;
  room: TavernRoom;
  activeCharacter: TavernCharacter;
  characters: TavernCharacter[];
  messages: TavernMessage[];
  references: TavernReferencedFile[];
  currentUserText: string;
  turnInstruction?: string;
  allowNonverbalReply?: boolean;
  onTextDelta?: (delta: string) => void;
  onThinkingDelta?: (delta: string) => void;
};

export const runTavernReply = async ({
  workspacePath,
  runtimeAgentId,
  runtimeModel,
  room,
  activeCharacter,
  characters,
  messages,
  references,
  currentUserText,
  turnInstruction,
  allowNonverbalReply,
  onTextDelta,
  onThinkingDelta,
}: RunTavernReplyInput) => {
  const request = buildTavernReplyAgentRequest({
    room,
    activeCharacter,
    characters,
    messages,
    references,
    currentUserText,
    turnInstruction,
    allowNonverbalReply,
  });

  return runTavernRuntimeAgent({
    agentId: runtimeAgentId,
    workspacePath,
    sessionRootDir: request.sessionRootDir,
    agentRoleId: request.agentRoleId,
    runtimeModel,
    systemPrompt: request.systemPrompt,
    userMessage: request.userMessage,
    requestContext: request.requestContext,
    runtimeInstruction: request.runtimeInstruction,
    onTextDelta,
    onThinkingDelta,
  });
};

export type RunTavernInnerThoughtInput = {
  workspacePath: string;
  runtimeAgentId: string;
  runtimeModel: RuntimeModelInput;
  room: TavernRoom;
  activeCharacter: TavernCharacter;
  characters: TavernCharacter[];
  messages: TavernMessage[];
  currentUserText: string;
  replyContent: string;
};

export const runTavernInnerThought = async ({
  workspacePath,
  runtimeAgentId,
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
    userPersonaName: room.userPersonaName,
    audience: { type: "character", characterId: activeCharacter.id },
  }).slice(-8);
  const activeInstance = room.sceneInstances.find((instance) =>
    instance.id === room.activeSceneInstanceId
  ) ?? room.sceneInstances[0];
  const characterMemoryLayers = activeInstance?.characterMemoryLayers?.[activeCharacter.id];
  const characterMemory = [
    characterMemoryLayers?.required?.trim() ?? "",
    characterMemoryLayers?.public?.trim() ?? "",
    characterMemoryLayers?.known?.trim() ?? "",
    characterMemoryLayers?.privateSelf?.trim() ?? "",
  ].filter(Boolean).join("\n\n");
  const relationshipText = formatTavernCharacterRelationships({
    character: activeCharacter,
    characters,
    userPersonaName: room.userPersonaName,
    relationshipOverrides: room.relationshipOverrides,
    statusSnapshot: room.statusSnapshot,
  });
  const result = await runTavernRuntimeAgent({
    agentId: runtimeAgentId,
    workspacePath,
    sessionRootDir: tavernBridgeSessionRootDir(room),
    agentRoleId: tavernCharacterAgentRoleId(room, activeCharacter),
    runtimeModel,
    systemPrompt: buildTavernBridgeSystemPrompt(room),
    userMessage: "请只输出当前角色此刻没有说出口的一句内心想法。",
    requestContext: [
        "<active_character>",
        `name: ${activeCharacter.name}`,
        `description: ${activeCharacter.description}`,
        `speakingStyle: ${activeCharacter.speakingStyle}`,
        activeCharacter.goals ? `goals: ${activeCharacter.goals}` : "",
        relationshipText ? `relationships: ${relationshipText}` : "",
        characterMemory ? `memory: ${characterMemory}` : "",
        "</active_character>",
        "",
        `<room title="${room.title}">`,
        room.scene,
        "</room>",
        "",
        "<current_user_input>",
        currentUserText,
        "</current_user_input>",
        "",
        "<recent_conversation>",
        formatTavernVisibleMessagesForRequestContext(visibleMessages) || "（无）",
        "</recent_conversation>",
        "",
        "<generated_reply>",
        replyContent,
        "</generated_reply>",
      ].filter(Boolean).join("\n"),
    runtimeInstruction: [
      "你是酒馆模式的角色内心独白补写器。",
      "只为当前角色补一条会显示在聊天气泡里的内心想法，不是模型推理过程。",
      "只输出 12 到 80 个中文字符的一句话；不要输出标签、角色名、解释、Markdown 或代码块。",
      "内心想法必须贴合角色人设、当前公开回复和现场，不要替其他角色写心理。",
    ].join("\n"),
  });

  return cleanTavernThoughtText(result.text).slice(0, 120);
};
