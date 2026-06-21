import {
  cleanTavernThoughtText,
  parseTavernReplyText,
} from "../runtime/reply-cleanup";
import { getTavernPresentationContractForMessageKind } from "../presentation-contracts";
import {
  buildTavernMessageSegments,
  formatTavernMessageSegmentsForPrompt,
  resolveTavernMessageSegments,
} from "./message-segments";
import type {
  TavernCharacter,
  TavernMessage,
  TavernMessageKind,
  TavernMessageSegment,
} from "../types";

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

const privateThoughtTagNames = [
  "inner_thought",
  "private_thought",
  "history_private_thought",
  "thought",
  "mind",
  "心理想法",
  "内心想法",
  "心想",
  "心理",
];

const replyWrapperTagNames = [
  "reply",
  "public_reply",
  "history_public_reply",
  "response",
  "content",
  "正文",
  "回复",
  "回应",
  "对白",
];

const narrativeBeatWrapperTagNames = [
  "narrative_beat",
  "public_narrative_beat",
  "history_narrative_beat",
  "story_beat",
  "narrative",
  "story",
  "beat",
  "叙事片段",
  "故事片段",
  "小说正文",
  "叙事正文",
];

const historyWrapperTagNames = [
  "message",
  "history_message",
  "narration",
  "history_narration",
];

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const tagNamePattern = (tagNames: string[]) =>
  tagNames.map(escapeRegExp).join("|");

const stripKnownTagBlocks = (text: string, tagNames: string[]) => {
  const pattern = tagNamePattern(tagNames);
  return text.replace(
    new RegExp(
      `<\\s*(?:${pattern})(?:\\s+[^>]*)?\\s*>[\\s\\S]*?<\\s*/\\s*(?:${pattern})\\s*>`,
      "gi",
    ),
    "",
  );
};

const stripKnownWrapperTags = (text: string, tagNames: string[]) => {
  const pattern = tagNamePattern(tagNames);
  return text.replace(
    new RegExp(`<\\s*/?\\s*(?:${pattern})(?:\\s+[^>]*)?\\s*>`, "gi"),
    "",
  );
};

export const stripTavernPrivateThoughts = (text: string) => {
  const withoutPrivateBlocks = stripKnownTagBlocks(text, privateThoughtTagNames);
  return stripKnownWrapperTags(withoutPrivateBlocks, [
    ...historyWrapperTagNames,
    ...narrativeBeatWrapperTagNames,
    ...replyWrapperTagNames,
  ]).trim();
};

const canAudienceSeeThought = (
  audience: TavernMessageAudience,
  characterId?: string,
) => {
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
  return message.characterId
    ? characterById.get(message.characterId)?.name ?? "角色"
    : "角色";
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
}) => input.messages.map((message) =>
  normalizeTavernMessageForAudience({
    ...input,
    message,
  })
);

const escapePromptXmlText = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const escapePromptXmlAttribute = (text: string) =>
  escapePromptXmlText(text).replace(/"/g, "&quot;");

export const formatTavernVisibleMessagesForRequestContext = (
  messages: TavernVisibleMessage[],
) => messages
  .filter((message) => message.content.trim() || message.thought?.trim() || message.segments.length > 0)
  .map((message) => {
    const publicSegments = formatTavernMessageSegmentsForPrompt(message.segments, {
      escapeText: escapePromptXmlText,
      includeThoughts: false,
    });
    if (message.role === "narrator") {
      return [
        "<message role=\"narrator\" speaker=\"旁白\">",
        publicSegments || escapePromptXmlText(message.content),
        "</message>",
      ].join("\n");
    }

    const publicContentTag =
      getTavernPresentationContractForMessageKind(message.kind).visibleContentTag;
    const lines = [
      `<message role="${message.role}" speaker="${escapePromptXmlAttribute(message.speakerName)}">`,
      `<${publicContentTag}>`,
      publicSegments || escapePromptXmlText(message.content),
      `</${publicContentTag}>`,
    ];
    if (message.thought?.trim()) {
      lines.push(
        "<private_thought visibility=\"self_only\">",
        escapePromptXmlText(message.thought),
        "</private_thought>",
      );
    }
    lines.push("</message>");
    return lines.join("\n");
  })
  .join("\n\n");
