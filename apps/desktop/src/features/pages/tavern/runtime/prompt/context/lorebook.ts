import {
  buildTavernStoryContextPackage,
  formatTavernStoryLorebookEntries,
  selectTavernStoryLorebookEntries,
} from "../../../adapters/story";
import type {
  StoryContextLorebookEntry,
} from "@/features/story";
import type {
  TavernCharacter,
  TavernRoom,
} from "../../../types";

export const selectTavernLorebookEntries = ({
  room,
  activeCharacter,
  characters,
  currentUserText,
}: {
  room: TavernRoom;
  activeCharacter?: TavernCharacter | null;
  characters: TavernCharacter[];
  currentUserText: string;
}) => {
  const storyContext = buildTavernStoryContextPackage({ room, characters });

  return selectTavernStoryLorebookEntries({
    storyContext,
    activeCharacterId: activeCharacter?.id,
    currentUserText,
  });
};

export const formatTavernLorebookEntries = (
  entries: StoryContextLorebookEntry[],
  {
    maxEntries,
    maxContentChars,
  }: {
    maxEntries?: number;
    maxContentChars?: number;
  } = {},
) => formatTavernStoryLorebookEntries(entries, {
  maxEntries,
  maxContentChars,
});
