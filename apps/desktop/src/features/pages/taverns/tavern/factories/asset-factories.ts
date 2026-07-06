import { createTavernId, now } from "../ids";
import type {
  TavernAssetDraft,
  TavernCharacterMemoryDraft,
  TavernLorebookEntry,
  TavernSceneMemoryDraft,
} from "@/features/pages/taverns/manage/model";
import type { TavernIllustrationHint } from "@/features/pages/taverns/room/model";

const normalizeCharacterMemoryDraftVisibility = (value: unknown): TavernCharacterMemoryDraft["visibility"] | null =>
  value === "public" || value === "hidden" || value === "character" ? value : null;

const normalizeSceneMemoryDraftVisibility = (value: unknown): TavernSceneMemoryDraft["visibility"] | null =>
  value === "public" || value === "hidden" || value === "director" ? value : null;

export const createTavernLorebookEntry = (input: {
  title: string;
  content: string;
  keywords?: string[];
  alwaysOn?: boolean;
}): TavernLorebookEntry => {
  const createdAt = now();
  return {
    id: createTavernId("lore"),
    title: input.title.trim(),
    content: input.content.trim(),
    keywords: input.keywords?.map((keyword) => keyword.trim()).filter(Boolean) ?? [],
    enabled: true,
    alwaysOn: Boolean(input.alwaysOn),
    createdAt,
    updatedAt: createdAt,
  };
};

export const createTavernAssetDraft = (input: {
  sourceMessageIds: string[];
  sceneMemories?: Array<{
    note: string;
    visibility: "public" | "hidden" | "director";
    secretId?: string;
  }>;
  characterMemories?: Array<{
    characterId: string;
    note: string;
    visibility: "public" | "hidden" | "character";
    secretId?: string;
    revealToCharacterIds?: string[];
  }>;
  lorebookEntries?: Array<{
    title: string;
    content: string;
    keywords?: string[];
    alwaysOn?: boolean;
  }>;
}): TavernAssetDraft => {
  const createdAt = now();
  return {
    id: createTavernId("draft"),
    sourceMessageIds: input.sourceMessageIds,
    sceneMemories:
      input.sceneMemories?.flatMap((memory) => {
        const visibility = normalizeSceneMemoryDraftVisibility(memory.visibility);
        const note = memory.note.trim();
        return note && visibility
          ? [
              {
                id: createTavernId("scene-memory-draft"),
                note,
                visibility,
                secretId: memory.secretId?.trim() || undefined,
              },
            ]
          : [];
      }) ?? [],
    characterMemories:
      input.characterMemories?.flatMap((memory) => {
        const visibility = normalizeCharacterMemoryDraftVisibility(memory.visibility);
        const characterId = memory.characterId.trim();
        const note = memory.note.trim();
        const revealToCharacterIds =
          memory.revealToCharacterIds?.map((characterId) => characterId.trim()).filter(Boolean) ?? [];
        return characterId && note && visibility && (visibility !== "character" || revealToCharacterIds.length > 0)
          ? [
              {
                id: createTavernId("memory-draft"),
                characterId,
                note,
                visibility,
                secretId: memory.secretId?.trim() || undefined,
                revealToCharacterIds,
              },
            ]
          : [];
      }) ?? [],
    lorebookEntries:
      input.lorebookEntries
        ?.map((entry) => ({
          id: createTavernId("lore-draft"),
          title: entry.title.trim(),
          content: entry.content.trim(),
          keywords: entry.keywords?.map((keyword) => keyword.trim()).filter(Boolean) ?? [],
          alwaysOn: Boolean(entry.alwaysOn),
        }))
        .filter((entry) => entry.title && entry.content) ?? [],
    createdAt,
    updatedAt: createdAt,
  };
};

export const createTavernIllustrationHint = (input: {
  prompt: string;
  turnId?: string;
  sourceMessageIds?: string[];
}): TavernIllustrationHint => ({
  id: createTavernId("illustration"),
  turnId: input.turnId?.trim() || undefined,
  source: "director",
  prompt: input.prompt.trim(),
  sourceMessageIds: input.sourceMessageIds?.filter((item) => item.trim()) ?? [],
  createdAt: now(),
});
