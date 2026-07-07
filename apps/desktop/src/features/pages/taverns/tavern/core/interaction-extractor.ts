import type { TavernMessage } from "../types";
import type { TavernCharacter, TavernPendingInteraction } from "@/features/pages/taverns/manage/model";
import { getTavernProtocolFieldTagNames } from "@/features/pages/taverns/room/message/protocol/schema";

const questionPattern = /[?？]|(?:吗|么|呢|哪|谁|什么|为何|为什么|怎么|如何)(?:[。！？!?」”']|$)/;

const containsQuestion = (text: string) => questionPattern.test(text.trim());

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const privateThoughtTagPattern = getTavernProtocolFieldTagNames("privateThought").map(escapeRegExp).join("|");

const trimMessageText = (text: string) =>
  text
    .replace(
      new RegExp(
        `<\\s*(?:${privateThoughtTagPattern})(?:\\s+[^>]*)?\\s*>[\\s\\S]*?<\\s*/\\s*(?:${privateThoughtTagPattern})\\s*>`,
        "gi",
      ),
      "",
    )
    .replace(/<[^>]+>/g, "")
    .trim();

const characterMentions = (text: string, characters: TavernCharacter[], excludedCharacterId?: string) =>
  characters.filter(
    (character) =>
      character.id !== excludedCharacterId && character.name.trim() && text.includes(character.name.trim()),
  );

const mentionsUser = (text: string, userPersonaName: string) => {
  const userName = userPersonaName.trim();
  return (
    Boolean(userName && userName !== "我" && text.includes(userName)) || /(?:你|您|玩家|来客|访客|过路人)/.test(text)
  );
};

type ExtractTavernPendingInteractionsInput = {
  message: TavernMessage;
  characters: TavernCharacter[];
  userPersonaName: string;
  turnId?: string;
};

const extractTavernPendingInteractions = ({
  message,
  characters,
  userPersonaName,
  turnId,
}: ExtractTavernPendingInteractionsInput): TavernPendingInteraction[] => {
  if (message.role === "narrator") {
    return [];
  }

  const text = trimMessageText(message.content);
  if (!text || !containsQuestion(text)) {
    return [];
  }

  const mentionedCharacters = characterMentions(text, characters, message.characterId);
  const target = (() => {
    if (mentionedCharacters.length > 0) {
      return {
        type: "character" as const,
        characterIds: mentionedCharacters.map((character) => character.id),
      };
    }

    if (message.role === "character" && mentionsUser(text, userPersonaName)) {
      return {
        type: "user" as const,
        characterIds: [],
      };
    }

    if (message.role === "user") {
      return {
        type: "group" as const,
        characterIds: [],
      };
    }

    return {
      type: "unknown" as const,
      characterIds: [],
    };
  })();

  return [
    {
      id: `${message.id}-interaction-0`,
      sourceMessageId: message.id,
      source: message.role === "character" ? { type: "character", characterId: message.characterId } : { type: "user" },
      target,
      kind: "question",
      text,
      requiresResponse: true,
      status: "open",
      createdTurnId: turnId ?? message.turnId ?? message.id,
    },
  ];
};

export const extractTavernPendingInteractionsFromMessages = ({
  messages,
  characters,
  userPersonaName,
  turnId,
}: {
  messages: TavernMessage[];
  characters: TavernCharacter[];
  userPersonaName: string;
  turnId?: string;
}) =>
  messages.flatMap((message, sourceIndex) =>
    extractTavernPendingInteractions({
      message,
      characters,
      userPersonaName,
      turnId,
    }).filter((interaction) => {
      const laterMessages = messages.slice(sourceIndex + 1);
      if (interaction.target.type === "character") {
        const targetCharacterIds = new Set(interaction.target.characterIds ?? []);
        return !laterMessages.some(
          (laterMessage) =>
            laterMessage.role === "character" &&
            laterMessage.characterId &&
            targetCharacterIds.has(laterMessage.characterId) &&
            laterMessage.status !== "streaming" &&
            laterMessage.status !== "error" &&
            trimMessageText(laterMessage.content),
        );
      }

      if (interaction.target.type === "user") {
        return !laterMessages.some(
          (laterMessage) =>
            laterMessage.role === "user" &&
            laterMessage.status !== "streaming" &&
            laterMessage.status !== "error" &&
            trimMessageText(laterMessage.content),
        );
      }

      if (interaction.target.type === "group") {
        return !laterMessages.some(
          (laterMessage) =>
            laterMessage.role === "character" &&
            laterMessage.status !== "streaming" &&
            laterMessage.status !== "error" &&
            trimMessageText(laterMessage.content),
        );
      }

      return true;
    }),
  );
