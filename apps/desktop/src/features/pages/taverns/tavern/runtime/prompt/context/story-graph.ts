import {
  buildTavernStoryContextPackage,
  formatTavernStoryGraphContext as formatTavernStoryGraphContextFromPackage,
  getTavernRuntimeStoryProjection,
} from "../../../adapters/story";
import type { TavernRoom } from "../../../types";

export const formatTavernStoryGraphContext = (
  room: TavernRoom,
  {
    maxEdges,
    maxSummaryChars,
  }: {
    maxEdges?: number;
    maxSummaryChars?: number;
  } = {},
) => {
  const storyProjection = getTavernRuntimeStoryProjection(room);

  return formatTavernStoryGraphContextFromPackage(
    buildTavernStoryContextPackage({
      room,
      characters: storyProjection.characters,
    }),
    {
      maxEdges,
      maxSummaryChars,
    },
  );
};
