import type { TavernRuntimeRoom as TavernRoom } from "@/features/pages/taverns/room/model";
import {
  buildTavernStoryContextPackage,
  formatTavernStoryGraphContext as formatTavernStoryGraphContextFromPackage,
  getTavernRuntimeStoryProjection,
} from "../../../adapters/story";

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
