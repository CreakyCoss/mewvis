import type { AgentProtocolMessage } from "@/features/pages/taverns/room/agent-protocol/types";
import type { TavernCharacter } from "@/features/pages/taverns/manage/model";
import type { TavernMessage } from "@/features/pages/taverns/tavern/types";
import { getTavernMessageRawText } from "@/features/pages/taverns/room/model/message-body";
import { getTavernAgentFlowPublicText, parseTavernAgentFlowOutput } from "./output";
import { getTavernAgentFlowPublicOutputKey, resolveTavernAgentFlowPresentation } from "./presentation";
import type { TavernAgentFlowContext, TavernAgentFlowInput, TavernAgentFlowPresentation } from "../../types";

const normalizeMaxSpeakers = ({
  maxSpeakers,
  fallback,
  candidateCount,
}: {
  maxSpeakers?: number;
  fallback?: number;
  candidateCount: number;
}) => {
  const resolved = Number.isFinite(maxSpeakers) ? maxSpeakers : fallback;
  const normalized = Math.max(1, Math.floor(resolved || 1));
  return Math.min(normalized, Math.max(1, candidateCount));
};

const resolveCandidateCharacters = ({
  characters,
  selectedCharacterIds,
}: {
  characters: TavernCharacter[];
  selectedCharacterIds?: string[];
}) => {
  const selectedIds = new Set(selectedCharacterIds?.filter(Boolean) ?? []);
  const candidates =
    selectedIds.size > 0 ? characters.filter((character) => selectedIds.has(character.id)) : characters;
  return candidates.length > 0 ? candidates : characters;
};

const extractStoredMessagePublicText = ({
  message,
  presentation,
}: {
  message: TavernMessage;
  presentation: TavernAgentFlowPresentation;
}) => {
  if (message.body.type === "text") {
    return getTavernMessageRawText(message).trim();
  }

  const parsed = parseTavernAgentFlowOutput(getTavernMessageRawText(message));
  if (message.role === "narrator") {
    return parsed.data.narrative?.trim() || parsed.data.publicReply?.trim() || parsed.unwrappedText?.trim() || "";
  }

  return getTavernAgentFlowPublicText({
    parsed,
    preferredOutput: getTavernAgentFlowPublicOutputKey(presentation),
  });
};

const toAgentProtocolHistoryMessage = ({
  message,
  characterById,
  presentation,
  userPersonaName,
}: {
  message: TavernMessage;
  characterById: Map<string, TavernCharacter>;
  presentation: TavernAgentFlowPresentation;
  userPersonaName: string;
}): AgentProtocolMessage | null => {
  const content = extractStoredMessagePublicText({ message, presentation }).trim();
  if (!content) {
    return null;
  }

  if (message.role === "user") {
    return {
      role: "user",
      speaker: userPersonaName || "用户",
      content,
      visibility: "public",
      createdAt: message.createdAt,
    };
  }

  if (message.role === "narrator") {
    return {
      role: "narrator",
      speaker: "旁白",
      content,
      visibility: "public",
      createdAt: message.createdAt,
    };
  }

  const character = message.characterId ? characterById.get(message.characterId) : null;
  return {
    role: "agent",
    speaker: character?.name ?? "角色",
    content,
    visibility: "public",
    createdAt: message.createdAt,
  };
};

export const createTavernAgentFlowPublicMessage = ({
  character,
  content,
}: {
  character: TavernCharacter;
  content: string;
}): AgentProtocolMessage => ({
  role: "agent",
  speaker: character.name,
  content,
  visibility: "public",
});

export const buildTavernAgentFlowContext = (input: TavernAgentFlowInput): TavernAgentFlowContext => {
  const presentation = resolveTavernAgentFlowPresentation(input.room.presentation.profile.profileId);
  const candidateCharacters = resolveCandidateCharacters({
    characters: input.characters,
    selectedCharacterIds: input.selectedCharacterIds,
  });
  const characterById = new Map(input.characters.map((character) => [character.id, character]));
  const userPersonaName = input.room.user.personaName || "用户";
  const currentInstruction =
    (input.trigger?.type === "scene_drive"
      ? input.trigger.directive || input.currentUserText
      : input.currentUserText
    ).trim() || "继续推进当前场景。";

  return {
    presentation,
    candidateCharacters,
    userPersonaName,
    currentInstruction,
    references: input.references ?? [],
    maxSpeakers: normalizeMaxSpeakers({
      maxSpeakers: input.maxSpeakers,
      fallback: input.room.presentation.settings.directorMaxSpeakers,
      candidateCount: candidateCharacters.length,
    }),
    historyMessages: input.messages.flatMap((message) => {
      const historyMessage = toAgentProtocolHistoryMessage({
        message,
        characterById,
        presentation,
        userPersonaName,
      });
      return historyMessage ? [historyMessage] : [];
    }),
  };
};
