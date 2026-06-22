import {
  formatTavernCharacterRelationships,
} from "../../../core";
import type {
  TavernCharacter,
  TavernRoom,
} from "../../../types";
import { limitPromptText } from "../shared/text";

export const formatTavernPromptCharacter = (
  character: TavernCharacter,
  {
    compact = false,
    room,
    characters = [],
  }: {
    compact?: boolean;
    room?: TavernRoom;
    characters?: TavernCharacter[];
  } = {},
) => {
  const relationships = room
    ? formatTavernCharacterRelationships({
        character,
        characters,
        userPersonaName: room.userPersonaName,
        relationshipOverrides: room.relationshipOverrides,
        statusSnapshot: room.statusSnapshot,
      })
    : formatTavernCharacterRelationships({ character, characters });

  if (compact) {
    return [
      `name: ${character.name}`,
      `role: ${limitPromptText(character.description, 140)}`,
      character.goals ? `goals: ${limitPromptText(character.goals, 100)}` : "",
      relationships ? `relationships: ${limitPromptText(relationships, 120)}` : "",
    ].filter(Boolean).join("\n");
  }

  return [
    `name: ${character.name}`,
    `description: ${limitPromptText(character.description, 700)}`,
    `speakingStyle: ${limitPromptText(character.speakingStyle, 260)}`,
    character.writingStyle ? `writingStyle: ${limitPromptText(character.writingStyle, 260)}` : "",
    character.replyStylePrompt ? `replyStylePrompt: ${limitPromptText(character.replyStylePrompt, 320)}` : "",
    character.goals ? `goals: ${limitPromptText(character.goals, 260)}` : "",
    relationships ? `relationships: ${limitPromptText(relationships, 320)}` : "",
  ].filter(Boolean).join("\n");
};
