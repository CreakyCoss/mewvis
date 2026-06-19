import type { RuntimeModelInput } from "@/ai/runtime-protocol";
import { runSharedRuntimeChat } from "@/features/ai/runtime";
import type {
  TavernCharacter,
  TavernMessage,
  TavernReferencedFile,
  TavernRoom,
} from "../types";
import {
  buildTavernSystemPrompt,
  tavernMessagesToRuntimeMessages,
} from "./prompt";
import { cleanTavernThoughtText } from "./reply-cleanup";

export type RunTavernReplyInput = {
  runtimeAgentId: string;
  runtimeModel: RuntimeModelInput;
  room: TavernRoom;
  activeCharacter: TavernCharacter;
  characters: TavernCharacter[];
  messages: TavernMessage[];
  references: TavernReferencedFile[];
  currentUserText: string;
  turnInstruction?: string;
  onTextDelta?: (delta: string) => void;
  onThinkingDelta?: (delta: string) => void;
};

export const runTavernReply = async ({
  runtimeAgentId,
  runtimeModel,
  room,
  activeCharacter,
  characters,
  messages,
  references,
  currentUserText,
  turnInstruction,
  onTextDelta,
  onThinkingDelta,
}: RunTavernReplyInput) => {
  const systemPrompt = buildTavernSystemPrompt({
    room,
    activeCharacter,
    characters,
    references,
    currentUserText,
    turnInstruction,
  });
  const runtimeMessages = tavernMessagesToRuntimeMessages({
    messages,
    characters,
    userPersonaName: room.userPersonaName,
    visibleThoughtCharacterId: activeCharacter.id,
  });

  return runSharedRuntimeChat({
    agentId: runtimeAgentId,
    runtimeModel,
    systemPrompt,
    messages: runtimeMessages,
    onTextDelta,
    onThinkingDelta,
  });
};

export type RunTavernInnerThoughtInput = {
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
  runtimeAgentId,
  runtimeModel,
  room,
  activeCharacter,
  characters,
  messages,
  currentUserText,
  replyContent,
}: RunTavernInnerThoughtInput) => {
  const runtimeMessages = tavernMessagesToRuntimeMessages({
    messages,
    characters,
    userPersonaName: room.userPersonaName,
    visibleThoughtCharacterId: activeCharacter.id,
  }).slice(-8);
  const characterMemory = room.characterMemories[activeCharacter.id]?.trim() ?? "";
  const recentConversation = runtimeMessages
    .map((message) => message.content)
    .join("\n\n");
  const result = await runSharedRuntimeChat({
    agentId: runtimeAgentId,
    runtimeModel,
    stream: false,
    systemPrompt: [
      "你是酒馆模式的角色内心独白补写器。",
      "只为当前角色补一条会显示在聊天气泡里的内心想法，不是模型推理过程。",
      "只输出 12 到 80 个中文字符的一句话；不要输出标签、角色名、解释、Markdown 或代码块。",
      "内心想法必须贴合角色人设、当前公开回复和现场，不要替其他角色写心理。",
    ].join("\n"),
    messages: [{
      id: `tavern-inner-thought-${Date.now()}`,
      role: "user",
      content: [
        "<active_character>",
        `name: ${activeCharacter.name}`,
        `description: ${activeCharacter.description}`,
        `speakingStyle: ${activeCharacter.speakingStyle}`,
        activeCharacter.goals ? `goals: ${activeCharacter.goals}` : "",
        activeCharacter.relationships ? `relationships: ${activeCharacter.relationships}` : "",
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
        recentConversation || "（无）",
        "</recent_conversation>",
        "",
        "<generated_reply>",
        replyContent,
        "</generated_reply>",
        "",
        "请只输出当前角色此刻没有说出口的一句内心想法。",
      ].filter(Boolean).join("\n"),
      timestamp: Date.now(),
      metadata: null,
    }],
  });

  return cleanTavernThoughtText(result.text).slice(0, 120);
};
