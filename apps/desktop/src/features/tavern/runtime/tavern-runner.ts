import type { LlmProvider, ProviderModel } from "@/ai/llm/types";
import { runSharedRuntimeChat } from "@/features/shared-chat-runtime";
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

export type RunTavernReplyInput = {
  runtimeAgentId: string;
  provider: LlmProvider;
  model: ProviderModel;
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
  provider,
  model,
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
  });

  return runSharedRuntimeChat({
    agentId: runtimeAgentId,
    provider,
    model,
    systemPrompt,
    messages: runtimeMessages,
    onTextDelta,
    onThinkingDelta,
  });
};
