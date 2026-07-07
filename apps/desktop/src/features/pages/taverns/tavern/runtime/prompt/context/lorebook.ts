import type { TavernActiveRoomView as TavernRoom } from "@/features/pages/taverns/room/model";
import {
  buildTavernStoryContextPackage,
  type TavernStoryContextLorebookEntry,
} from "@/features/pages/taverns/room/story-context/context-package";
import {
  formatTavernStoryLorebookEntries,
  selectTavernStoryLorebookEntries,
} from "@/features/pages/taverns/room/story-context/prompt-sections";
import type { TavernCharacter } from "@/features/pages/taverns/manage/model";

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
  entries: TavernStoryContextLorebookEntry[],
  {
    maxEntries,
    maxContentChars,
  }: {
    maxEntries?: number;
    maxContentChars?: number;
  } = {},
) =>
  formatTavernStoryLorebookEntries(entries, {
    maxEntries,
    maxContentChars,
  });
