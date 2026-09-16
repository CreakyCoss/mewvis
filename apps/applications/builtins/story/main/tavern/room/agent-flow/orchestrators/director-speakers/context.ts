import type { AgentProtocolMessage } from "../../../agent-protocol/types";
import { AgentProtocol } from "../../../agent-protocol";
import type { TavernCharacter } from "../../../model";
import { getTavernMessageRawText, type TavernMessage } from "../../../model/message";
import { getTavernAgentFlowPublicText } from "./output";
import { resolveTavernAgentFlowPresentation } from "./presentation";
import type { TavernAgentFlowContext, TavernAgentFlowInput } from "../../types";

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

const extractStoredMessagePublicText = ({ message }: { message: TavernMessage }) => {
  if (message.body.type === "text") {
    return getTavernMessageRawText(message).trim();
  }

  const protocolData = AgentProtocol.parse(getTavernMessageRawText(message));
  return getTavernAgentFlowPublicText(protocolData);
};

const toAgentProtocolHistoryMessage = ({
  message,
  characterById,
  playerName,
}: {
  message: TavernMessage;
  characterById: Map<string, TavernCharacter>;
  playerName: string;
}): AgentProtocolMessage | null => {
  const content = extractStoredMessagePublicText({ message }).trim();
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
    characters: input.story.characters,
    selectedCharacterIds: input.selectedCharacterIds,
  });
  const characterById = new Map(input.story.characters.map((character) => [character.id, character]));
  const playerName = "我";
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
    maxSpeakers: resolveMaxSpeakers({
      maxSpeakers: input.maxSpeakers,
      configuredMaxSpeakers: input.story.roomConfig.settings.directorMaxSpeakers,
      candidateCount: candidateCharacters.length,
    }),
    historyMessages: input.messages.flatMap((message) => {
      const historyMessage = toAgentProtocolHistoryMessage({
        message,
        characterById,
        playerName,
      });
      return historyMessage ? [historyMessage] : [];
    }),
  };
};
