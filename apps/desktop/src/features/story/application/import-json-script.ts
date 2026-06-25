import type { StoryImportDraftInput } from "./import-draft";
import { firstNonEmpty } from "./import-bridge-utils";
import {
  normalizeCharacters,
  normalizeScenes,
  normalizeWorldBookEntries,
} from "./import-normalizers";

export const looksLikeScript = (value: Record<string, unknown>) =>
  Array.isArray(value.characters) ||
  Array.isArray(value.scenes) ||
  typeof value.storyOutline === "string" ||
  typeof value.premise === "string" ||
  typeof value.background === "string";

export const createDraftFromScript = (
  value: Record<string, unknown>,
): StoryImportDraftInput => {
  const title = firstNonEmpty(value.title, value.name, value.label, "导入互动剧本");
  const background = firstNonEmpty(value.background, value.worldInfo, value.world, value.setting);
  const storyOutline = firstNonEmpty(value.storyOutline, value.premise, value.summary, background);
  const scenes = normalizeScenes(value.scenes);
  const characters = normalizeCharacters(value.characters);
  const openingScene = firstNonEmpty(value.scene, value.scenario, value.openingScene);
  const openingGoal = firstNonEmpty(value.sceneGoal, value.goal, value.objective);

  return {
    sourceKind: "json",
    label: title,
    description: firstNonEmpty(value.description, value.summary, "由互动剧本 JSON 转换。"),
    story: {
      title,
      outline: storyOutline,
      goal: firstNonEmpty(value.storyGoal, value.goal, value.objective),
      userPersonaName: firstNonEmpty(value.userPersonaName, value.userName, "我"),
    },
    characters,
    scenes: [
      ...scenes,
      ...(openingScene || openingGoal
        ? [{
            id: "scene-main",
            title: "起始场景",
            scene: openingScene || storyOutline,
            goal: openingGoal,
            plot: "",
            direction: "",
            transition: "",
            memory: "",
            characterIds: characters.map((character) => character.id),
            activeCharacterId: characters[0]?.id,
            lorebookEntries: [],
          }]
        : []),
    ],
    lorebookEntries: [
      ...normalizeWorldBookEntries(value.lorebookEntries),
      ...normalizeWorldBookEntries(value.worldBook),
      ...normalizeWorldBookEntries(value.worldbook),
      ...(background
        ? [{
            id: "lore-background",
            title: "背景设定",
            content: background,
            keywords: ["背景", "世界观"],
            enabled: true,
            alwaysOn: true,
          }]
        : []),
    ],
    messages: firstNonEmpty(value.openingMessage, value.firstMessage, value.opening)
      ? [{
          role: "narrator",
          content: firstNonEmpty(value.openingMessage, value.firstMessage, value.opening),
        }]
      : [],
  };
};
