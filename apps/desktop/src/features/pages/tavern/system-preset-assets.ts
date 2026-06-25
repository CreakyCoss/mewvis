import {
  createTavernId as createId,
} from "./ids";
import {
  normalizeCharacterMemoryDraftVisibility,
  normalizeLorebookKeywords,
  normalizeSceneMemoryDraftVisibility,
} from "./asset-normalizers";
import type {
  TavernAssetDraft,
  TavernLorebookEntry,
} from "./types";
import type {
  TavernSystemPresetRoom,
} from "./system-preset-registry";

export const mergeLorebookEntries = (
  ...groups: TavernLorebookEntry[][]
) => {
  const seen = new Set<string>();
  return groups.flat().filter((entry) => {
    const key = [
      entry.title.trim().toLowerCase(),
      entry.content.trim().toLowerCase(),
      entry.keywords.map((keyword) => keyword.trim().toLowerCase()).sort().join(","),
    ].join("|");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

export const createPresetLorebookEntry = (
  entry: NonNullable<TavernSystemPresetRoom["lorebookEntries"]>[number],
  createdAt: number,
): TavernLorebookEntry | null => {
  const title = typeof entry.title === "string" ? entry.title.trim() : "";
  const content = typeof entry.content === "string" ? entry.content.trim() : "";
  if (!title || !content) {
    return null;
  }

  return {
    id: createId("lore"),
    title,
    content,
    keywords: normalizeLorebookKeywords(entry.keywords),
    enabled: entry.enabled !== false,
    alwaysOn: Boolean(entry.alwaysOn),
    createdAt,
    updatedAt: createdAt,
  };
};

export const createPresetAssetDraft = (
  draft: NonNullable<TavernSystemPresetRoom["assetDrafts"]>[number],
  characterIdByPresetId: Map<string, string>,
  createdAt: number,
): TavernAssetDraft | null => {
  const sceneMemories = (draft.sceneMemories ?? []).flatMap((memory) => {
    const note = typeof memory.note === "string" ? memory.note.trim() : "";
    const visibility = normalizeSceneMemoryDraftVisibility(memory.visibility);
    return note && visibility
      ? [{
          id: createId("scene-memory-draft"),
          note,
          visibility,
          secretId: memory.secretId?.trim() || undefined,
        }]
      : [];
  });
  const characterMemories = (draft.characterMemories ?? []).flatMap((memory) => {
    const characterId = characterIdByPresetId.get(memory.characterId);
    const note = typeof memory.note === "string" ? memory.note.trim() : "";
    const visibility = normalizeCharacterMemoryDraftVisibility(memory.visibility);
    const revealToCharacterIds = memory.revealToCharacterIds
      ?.map((characterId) => characterIdByPresetId.get(characterId) ?? characterId.trim())
      .filter(Boolean) ?? [];
    return characterId && note && visibility && (visibility !== "character" || revealToCharacterIds.length > 0)
      ? [{
          id: createId("memory-draft"),
          characterId,
          note,
          visibility,
          secretId: memory.secretId?.trim() || undefined,
          revealToCharacterIds,
        }]
      : [];
  });
  const lorebookEntries = (draft.lorebookEntries ?? []).flatMap((entry) => {
    const title = typeof entry.title === "string" ? entry.title.trim() : "";
    const content = typeof entry.content === "string" ? entry.content.trim() : "";
    return title && content
      ? [{
          id: createId("lore-draft"),
          title,
          content,
          keywords: normalizeLorebookKeywords(entry.keywords),
          alwaysOn: Boolean(entry.alwaysOn),
        }]
      : [];
  });

  if (
    sceneMemories.length === 0 &&
    characterMemories.length === 0 &&
    lorebookEntries.length === 0
  ) {
    return null;
  }

  return {
    id: createId("draft"),
    sourceMessageIds: (draft.sourceMessageIds ?? []).filter((item): item is string =>
      typeof item === "string"
    ),
    sceneMemories,
    characterMemories,
    lorebookEntries,
    createdAt,
    updatedAt: createdAt,
  };
};
