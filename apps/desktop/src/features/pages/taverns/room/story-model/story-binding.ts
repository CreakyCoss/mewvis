import { now } from "../../tavern/ids";
import type { TavernStoryBinding } from "@/features/pages/taverns/room/model";

export const createTavernStoryBinding = (storyId: string, boundAt = now()): TavernStoryBinding => ({
  version: 1,
  storyId,
  source: "story",
  boundAt,
});
