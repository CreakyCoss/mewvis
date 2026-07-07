import type { TavernSceneInstance } from "@/features/pages/taverns/room/model";

export const collectUniqueTrimmedLines = (values: Array<string | undefined>) => {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed)) {
      return [];
    }

    seen.add(trimmed);
    return [trimmed];
  });
};

export const getTavernBranchPathInstances = (activeInstance: TavernSceneInstance) => ({
  pathInstances: [activeInstance],
});
