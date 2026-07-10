import { AgentProtocol } from "@/features/pages/taverns/room/agent-protocol";
import type { AgentProtocolParseResult } from "@/features/pages/taverns/room/agent-protocol/types";
import type {
  MessageAudience,
  MessageCharacterProfile,
  MessageRenderInput,
  MessageSegment,
  RenderableMessage,
} from "../types";
import { cleanAgentOutputContent, cleanThoughtText } from "./cleanup";
import { buildMessageSegments } from "./segments";

const firstText = (...values: Array<string | undefined>) => values.find((value) => value?.trim())?.trim() ?? "";

const getMessageRawText = (message: MessageRenderInput) =>
  message.body.type === "agent_output" ? message.body.rawText : message.body.text;

const getParsedPublicText = ({
  message,
  parsed,
}: {
  message: MessageRenderInput;
  parsed: AgentProtocolParseResult;
}) => {
  if (message.role === "narrator") {
    return firstText(parsed.data.narrative, parsed.data.publicReply, parsed.unwrappedText);
  }

  if (message.presentation?.profileId === "novel-prose") {
    return firstText(parsed.data.narrative, parsed.data.publicReply, parsed.unwrappedText);
  }

  return firstText(parsed.data.publicReply, parsed.data.narrative, parsed.unwrappedText);
};

const getParsedActionText = (parsed: AgentProtocolParseResult | null) => firstText(parsed?.data.action);

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

const fallbackSpeakerName = ({
  message,
  character,
  userName,
}: {
  message: MessageRenderInput;
  character?: MessageCharacterProfile;
  userName: string;
}) => {
  if (message.role === "user") {
    return userName || "我";
  }
  if (message.role === "narrator") {
    return "旁白";
  }
  return character?.name ?? "角色";
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
  const speakerName = fallbackSpeakerName({ message, character, userName });
  const parsedContent = parsed ? getParsedPublicText({ message, parsed }) : rawText.trim();
  const parsedAction = message.role === "character" ? getParsedActionText(parsed) : "";
  const content = parsedContent ? cleanAgentOutputContent({ text: parsedContent }) : parsedContent;
  const action = parsedAction ? cleanAgentOutputContent({ text: parsedAction }) : parsedAction;
  const thought = cleanThoughtText(parsed?.data.privateThought ?? "");
  const visibleThought = canAudienceSeeThought(audience, message.characterId) ? thought : "";
  const segments: MessageSegment[] = buildMessageSegments({
    role: message.role,
    characterId: message.characterId,
    content,
    actions: action ? [action] : undefined,
    thought: visibleThought,
    presentation: message.presentation,
  });

  return {
    id: message.id,
    role: message.role,
    characterId: message.characterId,
    character,
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
