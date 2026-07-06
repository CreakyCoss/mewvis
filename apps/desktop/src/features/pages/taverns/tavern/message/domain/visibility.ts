import { cleanTavernThoughtText, parseTavernReplyText } from "../protocol/parse-reply";
import {
  getTavernProtocolFieldTagNames,
  getTavernProtocolVisiblePrivateThoughtTag,
  TAVERN_PROTOCOL_CONTEXT_WRAPPER_TAGS,
} from "../protocol/schema";
import { getTavernPresentationContractForMessageKind } from "../../presentation/presentation-contracts";
import {
  buildTavernMessageSegments,
  formatTavernMessageSegmentsForPrompt,
  resolveTavernMessageSegments,
} from "./segments";
import type { TavernMessage, TavernMessageKind, TavernMessageSegment } from "../../types";
import type { TavernCharacter } from "@/features/pages/taverns/manage/model";

export type TavernMessageAudience =
  | { type: "ui"; characterId?: string | null; includeAllThoughts?: boolean }
  | { type: "public" }
  | { type: "character"; characterId: string }
  | { type: "director"; includeThoughts?: boolean }
  | { type: "user_proxy" }
  | { type: "archivist" };

export type TavernVisibleMessage = {
  id: string;
  kind?: TavernMessageKind;
  role: TavernMessage["role"];
  characterId?: string;
  speakerName: string;
  content: string;
  segments: TavernMessageSegment[];
  thought?: string;
  createdAt: number;
  status?: TavernMessage["status"];
  referencedFiles?: TavernMessage["referencedFiles"];
};

const privateThoughtTagNames = getTavernProtocolFieldTagNames("privateThought");
const replyWrapperTagNames = getTavernProtocolFieldTagNames("publicReply");
const narrativeBeatWrapperTagNames = getTavernProtocolFieldTagNames("narrativeBeat");

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const tagNamePattern = (tagNames: readonly string[]) => tagNames.map(escapeRegExp).join("|");

const stripKnownTagBlocks = (text: string, tagNames: readonly string[]) => {
  const pattern = tagNamePattern(tagNames);
  return text.replace(
    new RegExp(`<\\s*(?:${pattern})(?:\\s+[^>]*)?\\s*>[\\s\\S]*?<\\s*/\\s*(?:${pattern})\\s*>`, "gi"),
    "",
  );
};

const stripKnownWrapperTags = (text: string, tagNames: readonly string[]) => {
  const pattern = tagNamePattern(tagNames);
  return text.replace(new RegExp(`<\\s*/?\\s*(?:${pattern})(?:\\s+[^>]*)?\\s*>`, "gi"), "");
};

export const stripTavernPrivateThoughts = (text: string) => {
  const withoutPrivateBlocks = stripKnownTagBlocks(text, privateThoughtTagNames);
  return stripKnownWrapperTags(withoutPrivateBlocks, [
    ...TAVERN_PROTOCOL_CONTEXT_WRAPPER_TAGS,
    ...narrativeBeatWrapperTagNames,
    ...replyWrapperTagNames,
  ]).trim();
};

const canAudienceSeeThought = (audience: TavernMessageAudience, characterId?: string) => {
  if (!characterId) {
    return false;
  }

  if (audience.type === "ui") {
    return audience.includeAllThoughts ?? true;
  }

  if (audience.type === "character") {
    return audience.characterId === characterId;
  }

  if (audience.type === "director") {
    return audience.includeThoughts === true;
  }

  return false;
};

const fallbackSpeakerName = (
  message: TavernMessage,
  characterById: Map<string, TavernCharacter>,
  userPersonaName: string,
) => {
  if (message.role === "user") {
    return userPersonaName || "我";
  }
  if (message.role === "narrator") {
    return "旁白";
  }
  return message.characterId ? (characterById.get(message.characterId)?.name ?? "角色") : "角色";
};

export const normalizeTavernMessageForAudience = ({
  message,
  characters,
  userPersonaName,
  audience,
}: {
  message: TavernMessage;
  characters: TavernCharacter[];
  userPersonaName: string;
  audience: TavernMessageAudience;
}): TavernVisibleMessage => {
  const characterById = new Map(characters.map((character) => [character.id, character]));
  const speakerName = fallbackSpeakerName(message, characterById, userPersonaName);

  if (message.role !== "character") {
    const content = stripTavernPrivateThoughts(message.content);
    return {
      id: message.id,
      kind: message.kind,
      role: message.role,
      speakerName,
      content,
      segments: resolveTavernMessageSegments({
        ...message,
        content,
        thought: undefined,
      }),
      createdAt: message.createdAt,
      status: message.status,
      referencedFiles: message.referencedFiles,
    };
  }

  const character = message.characterId ? characterById.get(message.characterId) : null;
  const parsed = character
    ? parseTavernReplyText({
        text: message.content,
        activeCharacter: character,
        characters,
        userPersonaName,
      })
    : null;
  const content = (parsed?.content || stripTavernPrivateThoughts(message.content)).trim();
  const thought = cleanTavernThoughtText(message.thought?.trim() || parsed?.thought?.trim() || "");
  const visibleThought = canAudienceSeeThought(audience, message.characterId) ? thought : "";

  return {
    id: message.id,
    kind: message.kind,
    role: message.role,
    characterId: message.characterId,
    speakerName,
    content,
    segments: buildTavernMessageSegments({
      role: message.role,
      characterId: message.characterId,
      content,
      thought: visibleThought,
      presentationProfileId: message.presentationProfileId,
    }),
    thought: visibleThought || undefined,
    createdAt: message.createdAt,
    status: message.status,
    referencedFiles: message.referencedFiles,
  };
};

export const normalizeTavernMessagesForAudience = (input: {
  messages: TavernMessage[];
  characters: TavernCharacter[];
  userPersonaName: string;
  audience: TavernMessageAudience;
}) =>
  input.messages.map((message) =>
    normalizeTavernMessageForAudience({
      ...input,
      message,
    }),
  );

const escapePromptXmlText = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const escapePromptXmlAttribute = (text: string) => escapePromptXmlText(text).replace(/"/g, "&quot;");

export const formatTavernVisibleMessagesForRequestContext = (messages: TavernVisibleMessage[]) =>
  messages
    .filter((message) => message.content.trim() || message.thought?.trim() || message.segments.length > 0)
    .map((message) => {
      const publicSegments = formatTavernMessageSegmentsForPrompt(message.segments, {
        escapeText: escapePromptXmlText,
        includeThoughts: false,
      });
      if (message.role === "narrator") {
        return [
          '<message role="narrator" speaker="旁白">',
          publicSegments || escapePromptXmlText(message.content),
          "</message>",
        ].join("\n");
      }

      const publicContentTag = getTavernPresentationContractForMessageKind(message.kind).visibleContentTag;
      const lines = [
        `<message role="${message.role}" speaker="${escapePromptXmlAttribute(message.speakerName)}">`,
        `<${publicContentTag}>`,
        publicSegments || escapePromptXmlText(message.content),
        `</${publicContentTag}>`,
      ];
      if (message.thought?.trim()) {
        const privateThoughtTag = getTavernProtocolVisiblePrivateThoughtTag();
        lines.push(
          `<${privateThoughtTag} visibility="self_only">`,
          escapePromptXmlText(message.thought),
          `</${privateThoughtTag}>`,
        );
      }
      lines.push("</message>");
      return lines.join("\n");
    })
    .join("\n\n");
