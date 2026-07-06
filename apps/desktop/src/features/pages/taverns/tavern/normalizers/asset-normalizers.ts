import { now } from "../ids";
import type {
  TavernAssetDraft,
  TavernCharacterMemoryDraft,
  TavernIllustrationHint,
  TavernLorebookDraft,
  TavernLorebookEntry,
  TavernSceneMemoryDraft,
} from "@/features/pages/taverns/manage/model";

export const normalizeLorebookKeywords = (value: unknown) =>
  Array.isArray(value) ? value.flatMap((item) => (typeof item === "string" ? [item.trim()] : [])).filter(Boolean) : [];

export const normalizeLorebookEntry = (value: unknown): TavernLorebookEntry | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<TavernLorebookEntry>;
  const title = typeof candidate.title === "string" ? candidate.title.trim() : "";
  const content = typeof candidate.content === "string" ? candidate.content.trim() : "";
  if (!candidate.id || !title || !content) {
    return null;
  }

  const updatedAt = typeof candidate.updatedAt === "number" ? candidate.updatedAt : now();

  return {
    id: candidate.id,
    title,
    content,
    keywords: normalizeLorebookKeywords(candidate.keywords),
    enabled: candidate.enabled !== false,
    alwaysOn: Boolean(candidate.alwaysOn),
    createdAt: typeof candidate.createdAt === "number" ? candidate.createdAt : updatedAt,
    updatedAt,
  };
};

export const normalizeCharacterMemoryDraftVisibility = (
  value: unknown,
): TavernCharacterMemoryDraft["visibility"] | null =>
  value === "public" || value === "hidden" || value === "character" ? value : null;

export const normalizeSceneMemoryDraftVisibility = (value: unknown): TavernSceneMemoryDraft["visibility"] | null =>
  value === "public" || value === "hidden" || value === "director" ? value : null;

const normalizeSceneMemoryDraft = (value: unknown): TavernSceneMemoryDraft | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<TavernSceneMemoryDraft>;
  const note = typeof candidate.note === "string" ? candidate.note.trim() : "";
  const visibility = normalizeSceneMemoryDraftVisibility(candidate.visibility);
  if (!candidate.id || !note || !visibility) {
    return null;
  }

  return {
    id: candidate.id,
    note,
    visibility,
    secretId: candidate.secretId?.trim() || undefined,
  };
};

const normalizeCharacterMemoryDraft = (value: unknown): TavernCharacterMemoryDraft | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<TavernCharacterMemoryDraft>;
  const characterId = typeof candidate.characterId === "string" ? candidate.characterId.trim() : "";
  const note = typeof candidate.note === "string" ? candidate.note.trim() : "";
  const visibility = normalizeCharacterMemoryDraftVisibility(candidate.visibility);
  const revealToCharacterIds = Array.isArray(candidate.revealToCharacterIds)
    ? candidate.revealToCharacterIds.filter(
        (item): item is string => typeof item === "string" && item.trim().length > 0,
      )
    : [];
  if (
    !candidate.id ||
    !characterId ||
    !note ||
    !visibility ||
    (visibility === "character" && revealToCharacterIds.length === 0)
  ) {
    return null;
  }

  return {
    id: candidate.id,
    characterId,
    note,
    visibility,
    secretId: candidate.secretId?.trim() || undefined,
    revealToCharacterIds,
  };
};

const normalizeLorebookDraft = (value: unknown): TavernLorebookDraft | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<TavernLorebookDraft>;
  const title = typeof candidate.title === "string" ? candidate.title.trim() : "";
  const content = typeof candidate.content === "string" ? candidate.content.trim() : "";
  if (!candidate.id || !title || !content) {
    return null;
  }

  return {
    id: candidate.id,
    title,
    content,
    keywords: normalizeLorebookKeywords(candidate.keywords),
    alwaysOn: Boolean(candidate.alwaysOn),
  };
};

export const normalizeAssetDraft = (value: unknown): TavernAssetDraft | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<TavernAssetDraft>;
  if (!candidate.id) {
    return null;
  }

  const updatedAt = typeof candidate.updatedAt === "number" ? candidate.updatedAt : now();
  const sourceMessageIds = Array.isArray(candidate.sourceMessageIds)
    ? candidate.sourceMessageIds.filter((item): item is string => typeof item === "string")
    : [];
  const characterMemories = Array.isArray(candidate.characterMemories)
    ? candidate.characterMemories
        .map(normalizeCharacterMemoryDraft)
        .filter((draft): draft is TavernCharacterMemoryDraft => Boolean(draft))
    : [];
  const sceneMemories = Array.isArray(candidate.sceneMemories)
    ? candidate.sceneMemories
        .map(normalizeSceneMemoryDraft)
        .filter((draft): draft is TavernSceneMemoryDraft => Boolean(draft))
    : [];
  const lorebookEntries = Array.isArray(candidate.lorebookEntries)
    ? candidate.lorebookEntries
        .map(normalizeLorebookDraft)
        .filter((draft): draft is TavernLorebookDraft => Boolean(draft))
    : [];

  if (sceneMemories.length === 0 && characterMemories.length === 0 && lorebookEntries.length === 0) {
    return null;
  }

  return {
    id: candidate.id,
    sourceMessageIds,
    sceneMemories,
    characterMemories,
    lorebookEntries,
    createdAt: typeof candidate.createdAt === "number" ? candidate.createdAt : updatedAt,
    updatedAt,
  };
};

const normalizeIllustrationHint = (value: unknown): TavernIllustrationHint | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<TavernIllustrationHint>;
  const prompt = typeof candidate.prompt === "string" ? candidate.prompt.trim() : "";
  if (!candidate.id || !prompt) {
    return null;
  }

  return {
    id: candidate.id,
    turnId: typeof candidate.turnId === "string" && candidate.turnId.trim() ? candidate.turnId : undefined,
    source: "director",
    prompt,
    sourceMessageIds: Array.isArray(candidate.sourceMessageIds)
      ? candidate.sourceMessageIds.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [],
    createdAt: typeof candidate.createdAt === "number" ? candidate.createdAt : now(),
  };
};

export const normalizeIllustrationHints = (value: unknown): TavernIllustrationHint[] =>
  Array.isArray(value)
    ? value.map(normalizeIllustrationHint).filter((hint): hint is TavernIllustrationHint => Boolean(hint))
    : [];
