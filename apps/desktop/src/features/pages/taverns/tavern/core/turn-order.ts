import type { TavernCharacter } from "@/features/pages/taverns/manage/model";

export const isTavernCharacterAvailableForSpeech = (_character: TavernCharacter) => true;

export const orderTavernRoundSpeakers = ({
  characters,
  activeCharacterId,
}: {
  characters: TavernCharacter[];
  activeCharacterId?: string;
}) => {
  const availableCharacters = characters.filter((character) => isTavernCharacterAvailableForSpeech(character));

  if (!activeCharacterId) {
    return availableCharacters;
  }

  const activeIndex = availableCharacters.findIndex((character) => character.id === activeCharacterId);
  if (activeIndex <= 0) {
    return availableCharacters;
  }

  return [...availableCharacters.slice(activeIndex), ...availableCharacters.slice(0, activeIndex)];
};
