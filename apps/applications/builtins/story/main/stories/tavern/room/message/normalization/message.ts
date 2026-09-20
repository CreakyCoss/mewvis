import { AgentProtocol } from "@/stories/tavern/room/agent-protocol";
import type { AgentProtocolData } from "@/stories/tavern/room/agent-protocol/types";
import type {
  MessageAudience,
  MessageCharacterProfile,
  MessageRenderInput,
  MessageSegment,
  RenderableMessage,
} from "../types";
import { cleanAgentOutputContent, cleanThoughtText } from "./cleanup";
import { buildMessageSegments } from "./segments";

const getMessageRawText = (message: MessageRenderInput) =>
  message.body.type === "agent_output" ? message.body.rawText : message.body.text;

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
  return character?.name ?? "角色";
};

const buildProtocolDataSegments = ({
  data,
  message,
  audience,
}: {
  data: AgentProtocolData[];
  message: MessageRenderInput;
  audience: MessageAudience;
}) =>
  data.flatMap<MessageSegment>((item) => {
    if (item.type === "unwrappedText") {
      return buildMessageSegments({
        role: message.role,
        characterId: message.characterId,
        content: cleanAgentOutputContent(item.content),
        presentation: message.presentation,
      });
    }

    if (item.type === "privateThought") {
      if (!canAudienceSeeThought(audience, message.characterId)) {
        return [];
      }

      return buildMessageSegments({
        role: message.role,
        characterId: message.characterId,
        content: "",
        thought: cleanThoughtText(item.content),
        presentation: message.presentation,
      });
    }

    if (item.type === "action") {
      return buildMessageSegments({
        role: message.role,
        characterId: message.characterId,
        content: "",
        actions: [cleanAgentOutputContent(item.content)],
        presentation: message.presentation,
      });
    }

    if (item.type === "publicReply" || item.type === "narrative") {
      return buildMessageSegments({
        role: message.role,
        characterId: message.characterId,
        content: cleanAgentOutputContent(item.content),
        contentKind: item.type === "narrative" ? "narrative" : "default",
        presentation: message.presentation,
      });
    }

    return [];
  });

const buildRenderableContent = (segments: MessageSegment[]) =>
  segments
    .filter((segment) => segment.type !== "thought")
    .map((segment) => segment.text.trim())
    .filter(Boolean)
    .join("\n\n");

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
  const protocolData = message.body.type === "agent_output" ? AgentProtocol.parse(rawText, message.body.format) : null;
  const character = message.role === "character" ? characterById.get(message.characterId) : undefined;
  const speakerName = getSpeakerName({ message, character, userName });
  const segments = protocolData
    ? buildProtocolDataSegments({ data: protocolData, message, audience })
    : buildMessageSegments({
        role: message.role,
        characterId: message.characterId,
        content: rawText.trim(),
        presentation: message.presentation,
      });

  return {
    id: message.id,
    role: message.role,
    characterId: message.characterId,
    character,
    speakerName,
    content: buildRenderableContent(segments),
    segments,
    rawText,
    createdAt: message.createdAt,
    status: message.status,
  };
};
