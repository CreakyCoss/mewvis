import type { TavernRoom } from "../../../../../types";
import type {
  TavernPromptPreviewWarning,
  TavernPromptPreviewWarningLocation,
} from "../../../../../runtime/prompt/preview";

export type TavernPromptWarningNavigationTarget =
  | "runtimeBasic"
  | "storyConfig";

export type TavernPromptWarningNavigationRequest = {
  target: TavernPromptWarningNavigationTarget;
  label: string;
};

export const resolveTavernPromptWarningNavigationLocation = (
  location: TavernPromptPreviewWarningLocation,
  _room: TavernRoom,
): TavernPromptWarningNavigationRequest | null => {
  if (location.type === "room_field") {
    if (location.field === "title") {
      return {
        target: "runtimeBasic",
        label: location.label,
      };
    }

    if (
      location.field === "storyOutline" ||
      location.field === "storyGoal" ||
      location.field === "userPersonaName" ||
      location.field === "scene" ||
      location.field === "scenePlot" ||
      location.field === "sceneGoal" ||
      location.field === "sceneDirection" ||
      location.field === "sceneTransition" ||
      location.field === "memory"
    ) {
      return {
        target: "storyConfig",
        label: location.label,
      };
    }
  }

  if (location.type === "lorebook_entry") {
    return {
      target: "storyConfig",
      label: location.label,
    };
  }

  if (location.type === "character_field") {
    return {
      target: "storyConfig",
      label: location.label,
    };
  }

  return null;
};

export const resolveTavernPromptWarningNavigation = (
  warning: TavernPromptPreviewWarning,
  room: TavernRoom,
) => warning.locations
  ?.map((location) => resolveTavernPromptWarningNavigationLocation(location, room))
  .find((request): request is TavernPromptWarningNavigationRequest => Boolean(request))
  ?? null;
