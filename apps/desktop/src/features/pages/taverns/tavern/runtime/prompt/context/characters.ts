import { getTavernRoomSceneFields, type TavernRoomRuntime } from "@/features/pages/taverns/room/model";
import { formatTavernCharacterRelationships } from "../../../core/relationships";
import type { TavernCharacter } from "@/features/pages/taverns/manage/model";
import { escapePromptXmlText, limitPromptText } from "../shared/text";

const formatField = (label: string, value: string, maxChars: number) =>
  `${label}: ${escapePromptXmlText(limitPromptText(value, maxChars))}`;

export const formatTavernPromptCharacter = (
  character: TavernCharacter,
  {
    compact = false,
    runtime,
    characters = [],
  }: {
    compact?: boolean;
    runtime?: TavernRoomRuntime;
    characters?: TavernCharacter[];
  } = {},
) => {
  const sceneFields = runtime ? getTavernRoomSceneFields(runtime) : null;
  const relationships = formatTavernCharacterRelationships({
    character,
    characters,
    userPersonaName: runtime?.user.personaName,
    relationshipOverrides: sceneFields?.relationshipOverrides,
  });

  if (compact) {
    return [
      formatField("name", character.name, 80),
      formatField("role", character.description, 140),
      character.goals ? formatField("goals", character.goals, 100) : "",
      relationships ? formatField("relationships", relationships, 120) : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    formatField("name", character.name, 80),
    formatField("description", character.description, 700),
    formatField("speakingStyle", character.speakingStyle, 260),
    character.writingStyle ? formatField("writingStyle", character.writingStyle, 260) : "",
    character.replyStylePrompt ? formatField("replyStylePrompt", character.replyStylePrompt, 320) : "",
    character.goals ? formatField("goals", character.goals, 260) : "",
    relationships ? formatField("relationships", relationships, 320) : "",
  ]
    .filter(Boolean)
    .join("\n");
};
