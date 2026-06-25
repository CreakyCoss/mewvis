import {
  assertStoryImportDraftReady,
  createStoryImportDraft,
  type StoryImportDraft,
} from "@/features/story";
import type {
  TavernGeneratedPresetJson,
  TavernGeneratedPresetRoom,
} from "../../types";
import {
  buildTavernStoryImportRuntimeHints,
  mapTavernGeneratedCharacterToStoryDraft,
  mapTavernGeneratedLorebookEntryToStoryDraft,
  mapTavernGeneratedSceneToStoryDraft,
  selectTavernGeneratedScenesForStoryImport,
} from "./import-draft-mappers";

export const createStoryImportDraftFromTavernGeneratedPreset = (
  preset: TavernGeneratedPresetJson,
  {
    sourceKind,
  }: {
    sourceKind: StoryImportDraft["sourceKind"];
  },
) => {
  const room: Partial<TavernGeneratedPresetRoom> = preset.room ?? {};
  const scenes = selectTavernGeneratedScenesForStoryImport(room);
  const draft = createStoryImportDraft({
    mode: "story",
    sourceKind,
    label: preset.label,
    description: preset.description,
    story: {
      title: room.title,
      outline: room.storyOutline,
      goal: room.storyGoal,
      userPersonaName: room.userPersonaName,
    },
    characters: (preset.characters ?? []).map(mapTavernGeneratedCharacterToStoryDraft),
    scenes: scenes.map(mapTavernGeneratedSceneToStoryDraft),
    lorebookEntries: (room.lorebookEntries ?? []).map(mapTavernGeneratedLorebookEntryToStoryDraft),
    messages: preset.messages,
    runtimeHints: buildTavernStoryImportRuntimeHints(room),
  });
  assertStoryImportDraftReady(draft);
  return draft;
};
