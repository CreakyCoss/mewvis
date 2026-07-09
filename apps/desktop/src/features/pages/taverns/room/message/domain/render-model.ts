import { normalizeMessageForAudience, type MessageAudience } from "./visibility";
import type { MessageCharacterProfile, MessageRenderInput, RenderableMessage } from "./types";

export const createRenderableMessages = ({
  messages,
  characterProfiles,
  userName,
  audience = { type: "ui", includeAllThoughts: true },
}: {
  messages: MessageRenderInput[];
  characterProfiles: MessageCharacterProfile[];
  userName: string;
  audience?: MessageAudience;
}): RenderableMessage[] => {
  const characterById = new Map(characterProfiles.map((character) => [character.id, character]));

  return messages.map((message) =>
    normalizeMessageForAudience({
      message,
      characterById,
      userName,
      audience,
    }),
  );
};
