import type { StoryImportDraftInput } from "./import-draft";
import { firstNonEmpty, isRecord } from "./import-bridge-utils";
import {
  normalizeCharacters,
  normalizeScenes,
  normalizeWorldBookEntries,
} from "./import-normalizers";

export const looksLikeStandardStory = (value: Record<string, unknown>) =>
  isRecord(value.story) ||
  typeof value.outline === "string" ||
  typeof value.goal === "string" ||
  isRecord(value.graph) ||
  Array.isArray(value.lorebookEntries);

export const createDraftFromStandardStory = (
  value: Record<string, unknown>,
): StoryImportDraftInput | null => {
  const storyRecord = isRecord(value.story) ? value.story : value;
  const title = firstNonEmpty(storyRecord.title, value.title);
  if (!title) {
    return null;
  }

  return {
    sourceKind: "json",
    label: title,
    description: firstNonEmpty(value.description, "由标准故事 JSON 转换。"),
    story: {
      title,
      outline: firstNonEmpty(
        storyRecord.outline,
        value.outline,
        value.storyOutline,
        value.premise,
        value.summary,
        value.background,
      ),
      goal: firstNonEmpty(storyRecord.goal, value.goal, value.storyGoal, value.objective),
      userPersonaName: firstNonEmpty(storyRecord.userPersonaName, value.userPersonaName, "我"),
    },
    characters: normalizeCharacters(value.characters),
    scenes: normalizeScenes(value.scenes),
    lorebookEntries: normalizeWorldBookEntries(value.lorebookEntries),
    messages: Array.isArray(value.messages)
      ? value.messages as StoryImportDraftInput["messages"]
      : [],
  };
};
