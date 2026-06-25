import type { StoryImportDraftInput } from "./import-draft";
import { firstNonEmpty, isRecord, stringArrayValue } from "./import-bridge-utils";
import {
  normalizeCharacters,
  normalizeScenes,
  normalizeWorldBookEntries,
} from "./import-normalizers";

export const looksLikeGeneratedPreset = (value: Record<string, unknown>) =>
  isRecord(value.room) && Array.isArray(value.characters);

export const createDraftFromGeneratedPreset = (
  value: Record<string, unknown>,
): StoryImportDraftInput => {
  const room = isRecord(value.room) ? value.room : {};
  const title = firstNonEmpty(room.title, value.label, value.title, "导入故事");
  const scene = firstNonEmpty(room.scene, room.scenario, room.storyOutline);
  const sceneGoal = firstNonEmpty(room.sceneGoal, room.goal, room.storyGoal);

  return {
    sourceKind: "json",
    label: title,
    description: firstNonEmpty(value.description, "由结构化 JSON 转换。"),
    story: {
      title,
      outline: firstNonEmpty(room.storyOutline, room.outline, scene),
      goal: firstNonEmpty(room.storyGoal, room.goal, sceneGoal),
      userPersonaName: firstNonEmpty(room.userPersonaName, room.userName, "我"),
    },
    characters: normalizeCharacters(value.characters),
    scenes: [
      ...normalizeScenes(room.scenes),
      ...(scene || sceneGoal
        ? [{
            id: "scene-main",
            title: "起始场景",
            scene,
            goal: sceneGoal,
            plot: firstNonEmpty(room.scenePlot, room.plot),
            direction: firstNonEmpty(room.sceneDirection, room.direction),
            transition: firstNonEmpty(room.sceneTransition, room.transition),
            memory: firstNonEmpty(room.sceneMemory, room.memory),
            characterIds: stringArrayValue(room.characterIds),
            activeCharacterId: firstNonEmpty(room.activeCharacterId) || undefined,
            lorebookEntries: [],
          }]
        : []),
    ],
    lorebookEntries: normalizeWorldBookEntries(room.lorebookEntries),
    messages: Array.isArray(value.messages)
      ? value.messages as StoryImportDraftInput["messages"]
      : [],
    runtimeHints: {
      source: "generatedPreset",
    },
  };
};
