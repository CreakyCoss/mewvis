import { cloneDeep } from "lodash-es";
import { clampInteger } from "./normalization";
import type { TavernRoomSettings } from "@/features/pages/taverns/manage/model";

const DEFAULT_TAVERN_ROOM_SETTINGS: TavernRoomSettings = {
  immersiveDescriptionEnabled: true,
  directorMaxSpeakers: 3,
  directorLoop: {
    maxRounds: 2,
  },
  directorNarrativeControl: {
    agencyMode: "player_protagonist",
    responseScale: "balanced",
    narratorPressure: "balanced",
  },
};

export const cloneDefaultRoomSettings = (): TavernRoomSettings => cloneDeep(DEFAULT_TAVERN_ROOM_SETTINGS);

const normalizeDirectorNarrativeControl = (value: unknown): TavernRoomSettings["directorNarrativeControl"] => {
  const defaults = cloneDefaultRoomSettings().directorNarrativeControl;
  if (!value || typeof value !== "object") {
    return defaults;
  }

  const candidate = value as Partial<TavernRoomSettings["directorNarrativeControl"]>;
  return {
    agencyMode:
      candidate.agencyMode === "player_protagonist" ||
      candidate.agencyMode === "story_directive" ||
      candidate.agencyMode === "scene_drive"
        ? candidate.agencyMode
        : defaults.agencyMode,
    responseScale:
      candidate.responseScale === "focused" ||
      candidate.responseScale === "balanced" ||
      candidate.responseScale === "ensemble"
        ? candidate.responseScale
        : defaults.responseScale,
    narratorPressure:
      candidate.narratorPressure === "low" ||
      candidate.narratorPressure === "balanced" ||
      candidate.narratorPressure === "high"
        ? candidate.narratorPressure
        : defaults.narratorPressure,
  };
};

export const normalizeRoomSettings = (value: unknown): TavernRoomSettings => {
  if (!value || typeof value !== "object") {
    return cloneDefaultRoomSettings();
  }

  const candidate = value as Partial<TavernRoomSettings>;
  const directorLoop =
    candidate.directorLoop && typeof candidate.directorLoop === "object"
      ? (candidate.directorLoop as Partial<TavernRoomSettings["directorLoop"]>)
      : {};

  return {
    immersiveDescriptionEnabled: candidate.immersiveDescriptionEnabled !== false,
    directorMaxSpeakers: clampInteger(
      candidate.directorMaxSpeakers,
      DEFAULT_TAVERN_ROOM_SETTINGS.directorMaxSpeakers,
      1,
      6,
    ),
    directorLoop: {
      maxRounds: clampInteger(directorLoop.maxRounds, DEFAULT_TAVERN_ROOM_SETTINGS.directorLoop.maxRounds, 1, 5),
    },
    directorNarrativeControl: normalizeDirectorNarrativeControl(candidate.directorNarrativeControl),
  };
};
