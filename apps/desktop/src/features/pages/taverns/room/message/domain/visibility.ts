import { AgentProtocol } from "@/features/pages/taverns/room/agent-protocol";
import type { AgentProtocolParseResult } from "@/features/pages/taverns/room/agent-protocol/types";
import type { TavernCharacter } from "@/features/pages/taverns/manage/model";
import type { TavernMessage, TavernMessageKind, TavernMessageSegment } from "@/features/pages/taverns/tavern/types";
import { cleanTavernAgentOutputContent, cleanTavernThoughtText } from "../protocol/tavern-cleanup";
import { getTavernMessageRawText } from "../../model/message-body";
import { buildTavernMessageSegments } from "./segments";

export type TavernMessageAudience =
  | { type: "ui"; characterId?: string | null; includeAllThoughts?: boolean }
  | { type: "public" }
  | { type: "character"; characterId: string }
  | { type: "director"; includeThoughts?: boolean }
  | { type: "user_proxy" }
  | { type: "archivist" };

export type TavernVisibleMessage = {
  id: string;
  kind: TavernMessageKind;
  role: TavernMessage["role"];
  characterId?: string;
  speakerName: string;
  content: string;
  segments: TavernMessageSegment[];
  thought?: string;
  rawText: string;
  createdAt: number;
  status?: TavernMessage["status"];
  referencedFiles?: TavernMessage["referencedFiles"];
};

const firstText = (...values: Array<string | undefined>) => values.find((value) => value?.trim())?.trim() ?? "";

const getParsedPublicText = ({
  message,
  parsed,
}: {
  message: TavernMessage;
  parsed: AgentProtocolParseResult;
}) => {
  if (message.role === "narrator") {
    return firstText(parsed.data.narrative, parsed.data.publicReply, parsed.unwrappedText);
  }

  if (message.presentationProfileId === "novel-prose") {
    return firstText(parsed.data.narrative, parsed.data.publicReply, parsed.unwrappedText);
  }

  return firstText(parsed.data.publicReply, parsed.data.narrative, parsed.unwrappedText);
};

const getParsedActionText = (parsed: AgentProtocolParseResult | null) => firstText(parsed?.data.action);

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

export const stripTavernPrivateThoughts = (text: string) => {
  const parsed = AgentProtocol.parse(text);
  return firstText(parsed.data.publicReply, parsed.data.narrative, parsed.unwrappedText, text);
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
  const rawText = getTavernMessageRawText(message);
  const parsed = message.body.type === "agent_output" ? AgentProtocol.parse(rawText, message.body.format) : null;
  const character = message.characterId ? characterById.get(message.characterId) : null;
  const parsedContent = parsed ? getParsedPublicText({ message, parsed }) : rawText.trim();
  const parsedAction = message.role === "character" ? getParsedActionText(parsed) : "";
  const content =
    parsedContent && message.role === "character" && character
      ? cleanTavernAgentOutputContent({
          text: parsedContent,
          activeCharacter: character,
          characters,
          userPersonaName,
        })
      : parsedContent;
  const action =
    parsedAction && character
      ? cleanTavernAgentOutputContent({
          text: parsedAction,
          activeCharacter: character,
          characters,
          userPersonaName,
        })
      : parsedAction;
  const thought = cleanTavernThoughtText(parsed?.data.privateThought ?? "");
  const visibleThought = canAudienceSeeThought(audience, message.characterId) ? thought : "";
  const segments = buildTavernMessageSegments({
    role: message.role,
    characterId: message.characterId,
    content,
    actions: action ? [action] : undefined,
    thought: visibleThought,
    presentationProfileId: message.presentationProfileId,
  });

  return {
    id: message.id,
    kind: message.kind,
    role: message.role,
    characterId: message.characterId,
    speakerName,
    content,
    segments,
    thought: visibleThought || undefined,
    rawText,
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
