import type { TavernRuntimeMessage } from "../../conversation/messages";
import {
  formatTavernMessageSegmentsForPrompt,
  resolveTavernMessageSegments,
} from "@/features/pages/taverns/room/message/domain/segments";
import { parseTavernReplyText } from "@/features/pages/taverns/room/message/protocol/parse-reply";
import { getTavernPresentationContractForMessageKind } from "../../../presentation/presentation-contracts";
import { getTavernProtocolHistoryPrivateThoughtTag } from "@/features/pages/taverns/room/message/protocol/schema";
import type { TavernMessage } from "../../../types";
import type { TavernCharacter } from "@/features/pages/taverns/manage/model";
import { escapePromptXmlAttribute, escapePromptXmlText } from "../shared/text";

export const tavernMessagesToRuntimeMessages = ({
  messages,
  characters,
  userPersonaName,
  visibleThoughtCharacterId,
}: {
  messages: TavernMessage[];
  characters: TavernCharacter[];
  userPersonaName: string;
  visibleThoughtCharacterId?: string | null;
}): TavernRuntimeMessage[] => {
  const characterById = new Map(characters.map((character) => [character.id, character]));

  return messages.map((message) => {
    if (message.role === "user") {
      const segments = resolveTavernMessageSegments(message);
      return {
        id: message.id,
        role: "user",
        content: [
          `<history_message role="user" speaker="${escapePromptXmlAttribute(userPersonaName || "用户")}">`,
          formatTavernMessageSegmentsForPrompt(segments, {
            escapeText: escapePromptXmlText,
            includeThoughts: false,
          }) || escapePromptXmlText(message.content),
          "</history_message>",
        ].join("\n"),
        timestamp: message.createdAt,
        metadata: null,
      };
    }

    if (message.role === "narrator") {
      const segments = resolveTavernMessageSegments(message);
      return {
        id: message.id,
        role: "assistant",
        content: [
          "<history_narration>",
          formatTavernMessageSegmentsForPrompt(segments, {
            escapeText: escapePromptXmlText,
            includeThoughts: false,
          }) || escapePromptXmlText(message.content),
          "</history_narration>",
        ].join("\n"),
        timestamp: message.createdAt,
        metadata: null,
      };
    }

    const character = message.characterId ? characterById.get(message.characterId) : null;
    const parsedReply = character
      ? parseTavernReplyText({
          text: message.content,
          activeCharacter: character,
          characters,
          userPersonaName,
        })
      : null;
    const content = parsedReply?.content || message.content.trim();
    const segments = resolveTavernMessageSegments({
      ...message,
      content,
    });
    const canSeeThought = Boolean(visibleThoughtCharacterId && message.characterId === visibleThoughtCharacterId);
    const thought = canSeeThought ? message.thought?.trim() || parsedReply?.thought?.trim() : "";
    const publicHistoryTag = getTavernPresentationContractForMessageKind(message.kind).historyContentTag;
    const privateThoughtTag = getTavernProtocolHistoryPrivateThoughtTag();
    const thoughtLines = thought
      ? [`<${privateThoughtTag} visibility="self_only">`, escapePromptXmlText(thought), `</${privateThoughtTag}>`]
      : [];

    return {
      id: message.id,
      role: "assistant",
      content: [
        `<history_message role="character" speaker="${escapePromptXmlAttribute(character?.name ?? "角色")}">`,
        `<${publicHistoryTag}>`,
        formatTavernMessageSegmentsForPrompt(segments, {
          escapeText: escapePromptXmlText,
          includeThoughts: false,
        }) || escapePromptXmlText(content),
        `</${publicHistoryTag}>`,
        ...thoughtLines,
        "</history_message>",
      ].join("\n"),
      timestamp: message.createdAt,
      metadata: null,
    };
  });
};
