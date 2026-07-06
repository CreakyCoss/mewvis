import type { TavernRuntimeRoom as TavernRoom } from "@/features/pages/taverns/room/model";
import type { TavernMessage } from "../../../types";
import type {
  TavernCharacter,
  TavernCharacterMemoryDraft,
  TavernSceneMemoryDraft,
} from "@/features/pages/taverns/manage/model";
import type { TavernExtractedAssetDraft } from "./types";

const MAX_CHARACTER_MEMORY_DRAFTS = 4;
const MAX_SCENE_MEMORY_DRAFTS = 3;
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

const normalizeKeywords = (value: unknown) =>
  Array.isArray(value)
    ? [...new Set(value.flatMap((item) => (typeof item === "string" && item.trim() ? [item.trim()] : [])))]
    : [];

const normalizeKey = (value: string) => value.trim().toLowerCase();

const normalizeMemoryVisibility = (value: unknown): TavernCharacterMemoryDraft["visibility"] | null =>
  value === "public" || value === "hidden" || value === "character" ? value : null;

const normalizeSceneMemoryVisibility = (value: unknown): TavernSceneMemoryDraft["visibility"] | null =>
  value === "public" || value === "hidden" || value === "director" ? value : null;

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
    ...room.assetDrafts.flatMap((draft) => draft.lorebookEntries.map((entry) => normalizeKey(entry.title))),
  ]);
  const activeInstance =
    room.sceneInstances.find((instance) => instance.id === room.activeSceneInstanceId) ?? room.sceneInstances[0];
  const existingSceneMemoryText = [
    room.memory,
    activeInstance?.memoryLayers?.required,
    activeInstance?.memoryLayers?.public,
    activeInstance?.memoryLayers?.private,
    activeInstance?.memoryLayers?.directorSecret,
    ...(activeInstance?.memoryLayers?.entries ?? []).map((entry) => entry.text),
    ...room.assetDrafts.flatMap((draft) => draft.sceneMemories.map((memory) => memory.note)),
  ].join("\n");

  const sceneMemories = Array.isArray(parsed.sceneMemories)
    ? parsed.sceneMemories
        .flatMap((value) => {
          if (!value || typeof value !== "object") {
            return [];
          }

          const candidate = value as Record<string, unknown>;
          const note = typeof candidate.note === "string" ? limitText(candidate.note, 360) : "";
          const visibility = normalizeSceneMemoryVisibility(candidate.visibility);
          const secretId = typeof candidate.secretId === "string" ? candidate.secretId.trim() : "";
          if (!note || !visibility || existingSceneMemoryText.includes(note)) {
            return [];
          }

          return [
            {
              note,
              visibility,
              secretId: secretId || undefined,
            },
          ];
        })
        .slice(0, MAX_SCENE_MEMORY_DRAFTS)
    : [];

  const characterMemories = Array.isArray(parsed.characterMemories)
    ? parsed.characterMemories
        .flatMap((value) => {
          if (!value || typeof value !== "object") {
            return [];
          }

          const candidate = value as Record<string, unknown>;
          const characterId = typeof candidate.characterId === "string" ? candidate.characterId.trim() : "";
          const note = typeof candidate.note === "string" ? limitText(candidate.note, 280) : "";
          const visibility = normalizeMemoryVisibility(candidate.visibility);
          const secretId = typeof candidate.secretId === "string" ? candidate.secretId.trim() : "";
          const revealToCharacterIds = Array.isArray(candidate.revealToCharacterIds)
            ? candidate.revealToCharacterIds.flatMap((item) =>
                typeof item === "string" && characterIds.has(item.trim()) ? [item.trim()] : [],
              )
            : [];
          const activeInstance =
            room.sceneInstances.find((instance) => instance.id === room.activeSceneInstanceId) ??
            room.sceneInstances[0];
          const layers = activeInstance?.characterMemoryLayers?.[characterId];
          const currentMemory = [layers?.required, layers?.public, layers?.known, layers?.privateSelf]
            .filter(Boolean)
            .join("\n");
          if (
            !characterIds.has(characterId) ||
            !note ||
            !visibility ||
            (visibility === "character" && revealToCharacterIds.length === 0) ||
            currentMemory.includes(note)
          ) {
            return [];
          }

          return [
            {
              characterId,
              note,
              visibility,
              secretId: secretId || undefined,
              revealToCharacterIds,
            },
          ];
        })
        .slice(0, MAX_CHARACTER_MEMORY_DRAFTS)
    : [];

  const lorebookEntries = Array.isArray(parsed.lorebookEntries)
    ? parsed.lorebookEntries
        .flatMap((value) => {
          if (!value || typeof value !== "object") {
            return [];
          }

          const candidate = value as Record<string, unknown>;
          const title = typeof candidate.title === "string" ? limitText(candidate.title, 80) : "";
          const content = typeof candidate.content === "string" ? limitText(candidate.content, 520) : "";
          const normalizedTitle = normalizeKey(title);
          if (!title || !content || existingLoreTitles.has(normalizedTitle)) {
            return [];
          }

          existingLoreTitles.add(normalizedTitle);
          return [
            {
              title,
              content,
              keywords: normalizeKeywords(candidate.keywords).slice(0, 8),
              alwaysOn: Boolean(candidate.alwaysOn),
            },
          ];
        })
        .slice(0, MAX_LOREBOOK_DRAFTS)
    : [];

  return {
    sourceMessageIds: sourceMessages.map((message) => message.id),
    sceneMemories,
    characterMemories,
    lorebookEntries,
  };
};
