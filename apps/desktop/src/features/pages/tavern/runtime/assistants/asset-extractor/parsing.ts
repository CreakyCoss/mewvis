import type {
  TavernCharacter,
  TavernMessage,
  TavernRoom,
} from "../../../types";
import type { TavernExtractedAssetDraft } from "./types";

const MAX_CHARACTER_MEMORY_DRAFTS = 4;
const MAX_LOREBOOK_DRAFTS = 3;

const extractJsonObject = (text: string) => {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const match = trimmed.match(/\{[\s\S]*\}/);
  return match?.[0] ?? "{}";
};

const limitText = (text: string, maxChars: number) => {
  const trimmed = text.trim();
  return trimmed.length <= maxChars ? trimmed : `${trimmed.slice(0, maxChars)}...`;
};

const normalizeKeywords = (value: unknown) => Array.isArray(value)
  ? [...new Set(value.flatMap((item) => (
      typeof item === "string" && item.trim() ? [item.trim()] : []
    )))]
  : [];

const normalizeKey = (value: string) => value.trim().toLowerCase();

export const parseTavernAssetDraft = ({
  text,
  room,
  characters,
  sourceMessages,
}: {
  text: string;
  room: TavernRoom;
  characters: TavernCharacter[];
  sourceMessages: TavernMessage[];
}): TavernExtractedAssetDraft => {
  const parsed = JSON.parse(extractJsonObject(text)) as Record<string, unknown>;
  const characterIds = new Set(characters.map((character) => character.id));
  const existingLoreTitles = new Set([
    ...room.lorebookEntries.map((entry) => normalizeKey(entry.title)),
    ...room.assetDrafts.flatMap((draft) =>
      draft.lorebookEntries.map((entry) => normalizeKey(entry.title))
    ),
  ]);

  const characterMemories = Array.isArray(parsed.characterMemories)
    ? parsed.characterMemories.flatMap((value) => {
        if (!value || typeof value !== "object") {
          return [];
        }

        const candidate = value as Record<string, unknown>;
        const characterId = typeof candidate.characterId === "string"
          ? candidate.characterId.trim()
          : "";
        const note = typeof candidate.note === "string"
          ? limitText(candidate.note, 280)
          : "";
        const currentMemory = room.characterMemories[characterId] ?? "";
        if (!characterIds.has(characterId) || !note || currentMemory.includes(note)) {
          return [];
        }

        return [{ characterId, note }];
      }).slice(0, MAX_CHARACTER_MEMORY_DRAFTS)
    : [];

  const lorebookEntries = Array.isArray(parsed.lorebookEntries)
    ? parsed.lorebookEntries.flatMap((value) => {
        if (!value || typeof value !== "object") {
          return [];
        }

        const candidate = value as Record<string, unknown>;
        const title = typeof candidate.title === "string"
          ? limitText(candidate.title, 80)
          : "";
        const content = typeof candidate.content === "string"
          ? limitText(candidate.content, 520)
          : "";
        const normalizedTitle = normalizeKey(title);
        if (!title || !content || existingLoreTitles.has(normalizedTitle)) {
          return [];
        }

        existingLoreTitles.add(normalizedTitle);
        return [{
          title,
          content,
          keywords: normalizeKeywords(candidate.keywords).slice(0, 8),
          alwaysOn: Boolean(candidate.alwaysOn),
        }];
      }).slice(0, MAX_LOREBOOK_DRAFTS)
    : [];

  return {
    sourceMessageIds: sourceMessages.map((message) => message.id),
    characterMemories,
    lorebookEntries,
  };
};
