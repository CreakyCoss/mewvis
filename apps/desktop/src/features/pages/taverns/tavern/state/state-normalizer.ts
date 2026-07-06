import { createDefaultPromptForPresentation, normalizeRoomPresentation } from "../presentation/presentation-settings";
import { normalizeTavernPromptSettings } from "../prompt-registry/text-blocks";
import { normalizeReplyMode } from "../normalizers/reply-mode";
import { normalizeRoomSettings } from "../normalizers/room-settings";
import { createTavernRoomFromSystemPreset } from "../factories/system-preset-room";
import { getTavernSystemPreset, normalizeSystemPresetId, tavernSystemPresets } from "../system-preset-registry";
import { normalizeVisualPresetId } from "../visual-presets";
import {
  normalizeProgressTracker,
  normalizeProgressViews,
  normalizeSceneOutcomes,
  normalizeStatusDefinitions,
  normalizeStatusRules,
  normalizeTaskDefinitions,
} from "../normalizers/status-normalizers";
import type { TavernState } from "../types";
import type { TavernRoom } from "@/features/pages/taverns/manage/model";

const defaultRoomIdForSystemPreset = (presetId: string) => `default-room-${presetId}`;

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
  const systemPresetId = normalizeSystemPresetId(source.systemPresetId);
  const systemPreset = getTavernSystemPreset(systemPresetId);
  const presentation = normalizeRoomPresentation({ presentation: source.presentation });

  return {
    id: source.id,
    workspaceId: source.workspaceId,
    systemPresetId: systemPreset?.id,
    systemPresetVersion: systemPreset
      ? typeof source.systemPresetVersion === "number"
        ? source.systemPresetVersion
        : systemPreset.version
      : undefined,
    locked: Boolean(source.locked),
    title: source.title,
    presentation,
    prompt: normalizeTavernPromptSettings(source.prompt, createDefaultPromptForPresentation(presentation)),
    creationSource: normalizeCreationSource(source.creationSource),
    scenePresetId: normalizeVisualPresetId(source.scenePresetId),
    statusDefinitions: normalizeStatusDefinitions(source.statusDefinitions),
    statusRules: normalizeStatusRules(source.statusRules),
    progressViews: normalizeProgressViews(source.progressViews),
    progressTracker: normalizeProgressTracker(source.progressTracker),
    taskDefinitions: normalizeTaskDefinitions(source.taskDefinitions),
    sceneOutcomes: normalizeSceneOutcomes(source.sceneOutcomes),
    replyMode: normalizeReplyMode(source.replyMode),
    settings: normalizeRoomSettings(source.settings),
    createdAt,
    updatedAt: typeof source.updatedAt === "number" ? source.updatedAt : normalizedAt,
  };
};

const materializeDefaultTavernSystemPresetRooms = ({
  workspaceId,
  existingRoomIds = new Set<string>(),
  existingSystemPresetIds = new Set<string>(),
}: {
  workspaceId: string;
  existingRoomIds?: Set<string>;
  existingSystemPresetIds?: Set<string>;
}) =>
  tavernSystemPresets.flatMap((preset, index): TavernRoom[] => {
    if (existingSystemPresetIds.has(preset.id)) {
      return [];
    }

    const defaultRoomId = defaultRoomIdForSystemPreset(preset.id);
    const materialized = createTavernRoomFromSystemPreset(workspaceId, preset.id, {
      roomId: existingRoomIds.has(defaultRoomId) ? undefined : defaultRoomId,
      createdAt: Date.now() + index,
    });

    return [materialized.room];
  });

const ensureDefaultTavernSystemPresetRooms = (workspaceId: string, state: TavernState): TavernState => {
  const materializedDefaults = materializeDefaultTavernSystemPresetRooms({
    workspaceId,
    existingRoomIds: new Set(state.rooms.map((room) => room.id)),
    existingSystemPresetIds: new Set(state.rooms.flatMap((room) => (room.systemPresetId ? [room.systemPresetId] : []))),
  });

  if (materializedDefaults.length === 0) {
    return state;
  }

  const rooms = [...state.rooms, ...materializedDefaults];
  return {
    ...state,
    activeRoomId: rooms.some((room) => room.id === state.activeRoomId) ? state.activeRoomId : (rooms[0]?.id ?? ""),
    rooms,
  };
};

export const createDefaultTavernState = (workspaceId: string): TavernState => {
  const rooms = materializeDefaultTavernSystemPresetRooms({ workspaceId });

  return {
    version: 4,
    activeRoomId: rooms[0]?.id ?? "",
    rooms,
  };
};

export const normalizeTavernState = (
  workspaceId: string,
  value: unknown,
  options: {
    includeDefaultRooms?: boolean;
  } = {},
): TavernState | null => {
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
    return options.includeDefaultRooms === false ? null : createDefaultTavernState(workspaceId);
  }

  const activeRoomId = rooms.some((room) => room.id === candidate.activeRoomId)
    ? (candidate.activeRoomId ?? rooms[0].id)
    : rooms[0].id;

  const normalizedState: TavernState = {
    version: 4,
    activeRoomId,
    rooms,
  };

  return options.includeDefaultRooms === false
    ? normalizedState
    : ensureDefaultTavernSystemPresetRooms(workspaceId, normalizedState);
};
