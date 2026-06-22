import type { LedgerMessageInput } from "@/features/ai/components/conversation-ledger/types";
import {
  formatTavernVisibleMessagesForRequestContext,
  normalizeTavernMessagesForAudience,
} from "../../../message";
import type {
  TavernCharacter,
  TavernMessage,
  TavernRoom,
} from "../../../types";

const toLedgerRole = (role: TavernMessage["role"]) => {
  if (role === "character" || role === "narrator") {
    return "assistant";
  }
  return "user";
};

export const tavernMessagesToLedgerMessages = ({
  room,
  characters,
  messages,
}: {
  room: TavernRoom;
  characters: TavernCharacter[];
  messages: TavernMessage[];
}): LedgerMessageInput[] => {
  const visibleMessages = normalizeTavernMessagesForAudience({
    messages,
    characters,
    userPersonaName: room.userPersonaName,
    audience: { type: "public" },
  });

  return visibleMessages.flatMap((message) => {
    const content = [
      `speaker: ${message.speakerName}`,
      formatTavernVisibleMessagesForRequestContext([message]),
    ].join("\n").trim();
    return content
      ? [{
        role: toLedgerRole(message.role),
        content,
        timestamp: message.createdAt,
        metadata: {
          tavernRoomId: room.id,
          tavernSceneId: room.activeSceneId ?? null,
          tavernMessageId: message.id,
          tavernRole: message.role,
          tavernCharacterId: message.characterId ?? null,
        },
      }]
      : [];
  });
};
