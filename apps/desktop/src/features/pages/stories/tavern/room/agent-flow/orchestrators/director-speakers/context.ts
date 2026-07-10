import type { AgentProtocolMessage } from "@/features/pages/stories/tavern/room/agent-protocol/types";
import { AgentProtocol } from "@/features/pages/stories/tavern/room/agent-protocol";
import type { TavernCharacter } from "@/features/pages/stories/tavern/room/model";
import { getTavernMessageRawText, type TavernMessage } from "@/features/pages/stories/tavern/room/model/message";
import { getTavernAgentFlowPublicText } from "./output";
import { getTavernAgentFlowPublicOutputKey, resolveTavernAgentFlowPresentation } from "./presentation";
import type { TavernAgentFlowContext, TavernAgentFlowInput, TavernAgentFlowPresentation } from "../../types";

const resolveMaxSpeakers = ({
  maxSpeakers,
  configuredMaxSpeakers,
  candidateCount,
}: {
  maxSpeakers?: number;
  configuredMaxSpeakers?: number;
  candidateCount: number;
}) => {
  const resolved = maxSpeakers ?? configuredMaxSpeakers ?? 1;
  return Math.min(Math.max(1, Math.floor(resolved)), Math.max(1, candidateCount));
};

const resolveCandidateCharacters = ({
  characters,
  selectedCharacterIds,
}: {
  characters: TavernCharacter[];
  selectedCharacterIds?: string[];
}) => {
  const selectedIds = new Set(selectedCharacterIds ?? []);
  return selectedIds.size > 0 ? characters.filter((character) => selectedIds.has(character.id)) : characters;
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

  const parsed = AgentProtocol.parse(getTavernMessageRawText(message));
  if (message.role === "narrator") {
    return parsed.data.narrative!.trim();
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
  playerName,
}: {
  message: TavernMessage;
  characterById: Map<string, TavernCharacter>;
  presentation: TavernAgentFlowPresentation;
  playerName: string;
}): AgentProtocolMessage | null => {
  const content = extractStoredMessagePublicText({ message, presentation }).trim();
  if (!content) {
    return null;
  }

  if (message.role === "user") {
    return {
      role: "user",
      speaker: playerName,
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

  const character = characterById.get(message.characterId!)!;
  return {
    role: "agent",
    speaker: character.name,
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
  const presentation = resolveTavernAgentFlowPresentation(input.story.roomConfig);
  const candidateCharacters = resolveCandidateCharacters({
    characters: input.characters,
    selectedCharacterIds: input.selectedCharacterIds,
  });
  const characterById = new Map(input.characters.map((character) => [character.id, character]));
  const playerName = input.story.playerName;
  const currentInstruction =
    (input.trigger?.type === "scene_drive"
      ? input.trigger.directive || input.currentUserText
      : input.currentUserText
    ).trim() || "继续推进当前场景。";

  return {
    presentation,
    candidateCharacters,
    playerName,
    currentInstruction,
    references: input.references ?? [],
    maxSpeakers: resolveMaxSpeakers({
      maxSpeakers: input.maxSpeakers,
      configuredMaxSpeakers: input.story.roomConfig.settings.directorMaxSpeakers,
      candidateCount: candidateCharacters.length,
    }),
    historyMessages: input.messages.flatMap((message) => {
      const historyMessage = toAgentProtocolHistoryMessage({
        message,
        characterById,
        presentation,
        playerName,
      });
      return historyMessage ? [historyMessage] : [];
    }),
  };
};
