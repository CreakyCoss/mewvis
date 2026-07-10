import { AgentProtocol } from "@/features/pages/taverns/room/agent-protocol";
import type { AgentProtocolParseResult } from "@/features/pages/taverns/room/agent-protocol/types";
import type {
  MessageAudience,
  MessageCharacterProfile,
  MessageRenderInput,
  MessageSegment,
  RenderableMessage,
} from "../types";
import { buildMessageSegments } from "./segments";

const getMessageRawText = (message: MessageRenderInput) =>
  message.body.type === "agent_output" ? message.body.rawText : message.body.text;

const getParsedPublicText = ({
  message,
  parsed,
}: {
  message: MessageRenderInput;
  parsed: AgentProtocolParseResult;
}) => {
  const outputKey =
    message.role === "narrator" || message.presentation?.profileId === "novel-prose" ? "narrative" : "publicReply";
  return parsed.data[outputKey]!.trim();
};

const getParsedActionText = (parsed: AgentProtocolParseResult | null) => parsed?.data.action?.trim() ?? "";

const canAudienceSeeThought = (audience: MessageAudience, characterId?: string) => {
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

const getSpeakerName = ({
  message,
  character,
  userName,
}: {
  message: MessageRenderInput;
  character?: MessageCharacterProfile;
  userName: string;
}) => {
  if (message.role === "user") {
    return userName;
  }
  if (message.role === "narrator") {
    return "旁白";
  }
  return character!.name;
};

export const normalizeMessageForAudience = ({
  message,
  characterById,
  userName,
  audience,
}: {
  message: MessageRenderInput;
  characterById: Map<string, MessageCharacterProfile>;
  userName: string;
  audience: MessageAudience;
}): RenderableMessage => {
  const rawText = getMessageRawText(message);
  const parsed = message.body.type === "agent_output" ? AgentProtocol.parse(rawText, message.body.format) : null;
  const character = message.role === "character" ? characterById.get(message.characterId) : undefined;
  const speakerName = getSpeakerName({ message, character, userName });
  const parsedContent = parsed ? getParsedPublicText({ message, parsed }) : rawText.trim();
  const parsedAction = message.role === "character" ? getParsedActionText(parsed) : "";
  const thought = parsed?.data.privateThought?.trim() ?? "";
  const visibleThought = canAudienceSeeThought(audience, message.characterId) ? thought : "";
  const segments: MessageSegment[] = buildMessageSegments({
    role: message.role,
    characterId: message.characterId,
    content: parsedContent,
    actions: parsedAction ? [parsedAction] : undefined,
    thought: visibleThought,
    presentation: message.presentation,
  });

  return {
    id: message.id,
    role: message.role,
    characterId: message.characterId,
    character,
    speakerName,
    content: parsedContent,
    segments,
    thought: visibleThought || undefined,
    rawText,
    createdAt: message.createdAt,
    status: message.status,
    referencedFiles: message.referencedFiles,
  };
};
