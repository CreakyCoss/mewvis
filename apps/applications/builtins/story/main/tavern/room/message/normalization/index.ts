import type { MessageNormalizationRequest, RenderableMessage } from "../types";
import { normalizeMessageForAudience } from "./message";

export const createRenderableMessages = ({
  messages,
  characterProfiles,
  userName,
  audience = { type: "ui", includeAllThoughts: true },
}: MessageNormalizationRequest): RenderableMessage[] => {
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
