import type { StoryImportDraft } from "@/features/story";

export const updateImportCharacter = (
  draft: StoryImportDraft,
  characterId: string,
  patch: Partial<StoryImportDraft["characters"][number]>,
): StoryImportDraft => ({
  ...draft,
  characters: draft.characters.map((character) =>
    character.id === characterId ? { ...character, ...patch } : character
  ),
});

export const updateImportScene = (
  draft: StoryImportDraft,
  sceneId: string,
  patch: Partial<StoryImportDraft["scenes"][number]>,
): StoryImportDraft => ({
  ...draft,
  scenes: draft.scenes.map((scene) =>
    scene.id === sceneId ? { ...scene, ...patch } : scene
  ),
});

export const updateImportLore = (
  draft: StoryImportDraft,
  entryId: string,
  patch: Partial<StoryImportDraft["lorebookEntries"][number]>,
): StoryImportDraft => ({
  ...draft,
  lorebookEntries: draft.lorebookEntries.map((entry) =>
    entry.id === entryId ? { ...entry, ...patch } : entry
  ),
});
