import type { StoryJson } from "../model/types";

export type StoryDraft = Pick<StoryJson, "title" | "premise" | "goal" | "playerName">;

export const formatCount = (count: number, label: string) => `${count} ${label}`;

export const splitKeywords = (value: string) =>
  value
    .split(/[\n,，、]/)
    .map((item) => item.trim())
    .filter(Boolean);

export const moveItem = <T>(items: T[], index: number, direction: -1 | 1) => {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= items.length) {
    return items;
  }
  const nextItems = [...items];
  const [item] = nextItems.splice(index, 1);
  nextItems.splice(targetIndex, 0, item);
  return nextItems;
};
