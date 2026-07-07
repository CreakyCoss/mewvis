import type { TavernActiveRoomView as TavernRoom } from "@/features/pages/taverns/room/model";
import { buildTavernStoryContextPackage } from "@/features/pages/taverns/room/story-context/context-package";
import { getTavernRuntimeStoryProjection } from "@/features/pages/taverns/room/story-context/projection";
import { formatTavernStoryGraphContext as formatTavernStoryGraphContextFromPackage } from "@/features/pages/taverns/room/story-context/prompt-sections";

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
