import { now } from "../ids";
import type { TavernStoryBinding } from "@/features/pages/taverns/room/model";

export const createTavernStoryBinding = (storyId: string, boundAt = now()): TavernStoryBinding => ({
  version: 1,
  storyId,
  source: "story",
  boundAt,
});

export const normalizeTavernStoryBinding = (
  value: unknown,
  fallbackStoryId: string,
  boundAt = now(),
): TavernStoryBinding => {
  const candidate = value && typeof value === "object" ? (value as Partial<TavernStoryBinding>) : {};
  const storyId =
    typeof candidate.storyId === "string" && candidate.storyId.trim() ? candidate.storyId.trim() : fallbackStoryId;

  return createTavernStoryBinding(storyId, typeof candidate.boundAt === "number" ? candidate.boundAt : boundAt);
};
