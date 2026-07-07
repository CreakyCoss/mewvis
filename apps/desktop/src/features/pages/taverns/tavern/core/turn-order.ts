import type { TavernCharacter, TavernRoomSettings } from "@/features/pages/taverns/manage/model";

type TavernRoundParticipant =
  | {
      type: "user";
      id: "user";
      name: string;
    }
  | {
      type: "character";
      id: string;
      name: string;
      character: TavernCharacter;
    };

export const isTavernCharacterAvailableForSpeech = (_settings: TavernRoomSettings, _character: TavernCharacter) =>
  true;

export const orderTavernRoundSpeakers = ({
  settings,
  characters,
  activeCharacterId,
}: {
  settings: TavernRoomSettings;
  characters: TavernCharacter[];
  activeCharacterId?: string;
}) => {
  const availableCharacters = characters.filter((character) => isTavernCharacterAvailableForSpeech(settings, character));

  if (!activeCharacterId) {
    return availableCharacters;
  }

  const activeIndex = availableCharacters.findIndex((character) => character.id === activeCharacterId);
  if (activeIndex <= 0) {
    return availableCharacters;
  }

  return [...availableCharacters.slice(activeIndex), ...availableCharacters.slice(0, activeIndex)];
};

export const orderTavernRoundParticipants = ({
  settings,
  characters,
  activeCharacterId,
  includeUser = false,
  userPosition = "first",
  userPersonaName,
}: {
  settings: TavernRoomSettings;
  characters: TavernCharacter[];
  activeCharacterId?: string;
  includeUser?: boolean;
  userPosition?: "first" | "last";
  userPersonaName?: string;
}): TavernRoundParticipant[] => {
  const characterParticipants: TavernRoundParticipant[] = orderTavernRoundSpeakers({
    settings,
    characters,
    activeCharacterId,
  }).map((character) => ({
    type: "character" as const,
    id: character.id,
    name: character.name,
    character,
  }));

  if (!includeUser) {
    return characterParticipants;
  }

  const userParticipant: TavernRoundParticipant = {
    type: "user",
    id: "user",
    name: userPersonaName?.trim() || "你",
  };

  return userPosition === "last"
    ? [...characterParticipants, userParticipant]
    : [userParticipant, ...characterParticipants];
};
