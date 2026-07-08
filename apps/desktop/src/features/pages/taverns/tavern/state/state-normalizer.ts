import { createDefaultPromptForPresentation, normalizeRoomPresentation } from "../presentation/presentation-settings";
import { normalizeTavernPromptSettings } from "../prompt-registry/text-blocks";
import { normalizeReplyMode } from "../normalizers/reply-mode";
import { normalizeRoomSettings } from "../normalizers/room-settings";
import { normalizeVisualPresetId } from "../visual-presets";
import type { TavernState } from "../types";
import type { TavernRoom } from "@/features/pages/taverns/manage/model";

const normalizeCreationSource = (value: unknown): TavernRoom["creationSource"] =>
  value === "quick" || value === "imported" || value === "agent_generated" ? value : "manual";

const normalizeRoomConfig = (workspaceId: string, value: unknown): TavernRoom | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Partial<TavernRoom>;
  if (!source.id || source.workspaceId !== workspaceId || !source.title) {
    return null;
  }

  const normalizedAt = Date.now();
  const createdAt = typeof source.createdAt === "number" ? source.createdAt : normalizedAt;
  const presentation = normalizeRoomPresentation({ presentation: source.presentation });
  const settings = normalizeRoomSettings(source.settings);

  return {
    id: source.id,
    workspaceId: source.workspaceId,
    title: source.title,
    presentation,
    prompt: normalizeTavernPromptSettings(
      source.prompt,
      createDefaultPromptForPresentation(presentation, settings),
    ),
    creationSource: normalizeCreationSource(source.creationSource),
    scenePresetId: normalizeVisualPresetId(source.scenePresetId),
    replyMode: normalizeReplyMode(source.replyMode),
    settings,
    createdAt,
    updatedAt: typeof source.updatedAt === "number" ? source.updatedAt : normalizedAt,
  };
};

export const createDefaultTavernState = (_workspaceId: string): TavernState => {
  return {
    version: 4,
    activeRoomId: "",
    rooms: [],
  };
};

export const normalizeTavernState = (workspaceId: string, value: unknown): TavernState | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<TavernState>;
  if (candidate.version !== 4 || !Array.isArray(candidate.rooms)) {
    return null;
  }

  const rooms = candidate.rooms
    .map((room) => normalizeRoomConfig(workspaceId, room))
    .filter((room): room is TavernRoom => Boolean(room));

  if (rooms.length === 0) {
    return null;
  }

  const activeRoomId = rooms.some((room) => room.id === candidate.activeRoomId)
    ? (candidate.activeRoomId ?? rooms[0].id)
    : rooms[0].id;

  return {
    version: 4,
    activeRoomId,
    rooms,
  };
};
