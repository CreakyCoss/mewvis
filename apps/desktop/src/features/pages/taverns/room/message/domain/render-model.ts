import type { TavernCharacter } from "@/features/pages/taverns/manage/model";
import type { TavernMessage } from "@/features/pages/taverns/tavern/types";
import { normalizeTavernMessageForAudience, type TavernVisibleMessage } from "./visibility";

export type TavernRenderableMessage = TavernVisibleMessage & {
  source: TavernMessage;
};

export const createTavernRenderableMessages = ({
  messages,
  characters,
  userPersonaName,
}: {
  messages: TavernMessage[];
  characters: TavernCharacter[];
  userPersonaName: string;
}): TavernRenderableMessage[] =>
  messages.map((message) => ({
    ...normalizeTavernMessageForAudience({
      message,
      characters,
      userPersonaName,
      audience: { type: "ui", includeAllThoughts: true },
    }),
    source: message,
  }));
