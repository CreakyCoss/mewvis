import { getActiveTavernScene } from "../../../../../storage";
import type { TavernRoom } from "../../../../../types";
import type {
  TavernPromptPreviewWarning,
  TavernPromptPreviewWarningLocation,
} from "../../../../../runtime/prompt/preview";

export type TavernPromptWarningNavigationModule =
  | "basic"
  | "characters"
  | "lore"
  | "scenes";

export type TavernPromptWarningNavigationRequest = {
  moduleId: TavernPromptWarningNavigationModule;
  label: string;
  focusElementId?: string;
  entryId?: string;
  characterId?: string;
  sceneId?: string;
};

const basicFieldElementIds: Record<string, string> = {
  title: "tavern-basic-title",
  storyOutline: "tavern-basic-story-outline",
  storyGoal: "tavern-basic-story-goal",
  userPersonaName: "tavern-basic-user-persona",
};

const sceneFieldElementIds: Record<string, string> = {
  scene: "tavern-scenes-scene",
  scenePlot: "tavern-scenes-plot",
  sceneGoal: "tavern-scenes-goal",
  sceneDirection: "tavern-scenes-direction",
  sceneTransition: "tavern-scenes-transition",
  memory: "tavern-scenes-memory",
};

const lorebookFieldElementIds: Record<string, string> = {
  title: "tavern-lore-title",
  content: "tavern-lore-content",
  keywords: "tavern-lore-keywords",
};

const characterFieldElementIds: Record<string, string> = {
  name: "tavern-character-name",
  description: "tavern-character-description",
  speakingStyle: "tavern-character-style",
  writingStyle: "tavern-character-writing-style",
  replyStylePrompt: "tavern-character-reply-style-prompt",
  goals: "tavern-character-goals",
};

const getActiveSceneId = (room: TavernRoom) =>
  room.activeSceneId ?? getActiveTavernScene(room)?.id;

export const resolveTavernPromptWarningNavigationLocation = (
  location: TavernPromptPreviewWarningLocation,
  room: TavernRoom,
): TavernPromptWarningNavigationRequest | null => {
  if (location.type === "room_field") {
    const basicFocusElementId = basicFieldElementIds[location.field];
    if (basicFocusElementId) {
      return {
        moduleId: "basic",
        label: location.label,
        focusElementId: basicFocusElementId,
      };
    }

    const sceneFocusElementId = sceneFieldElementIds[location.field];
    const sceneId = getActiveSceneId(room);
    if (sceneFocusElementId && sceneId) {
      return {
        moduleId: "scenes",
        label: location.label,
        sceneId,
        focusElementId: sceneFocusElementId,
      };
    }
  }

  if (location.type === "lorebook_entry") {
    const entry = room.lorebookEntries.find((item) => item.id === location.entryId);
    if (!entry) {
      return null;
    }

    return {
      moduleId: "lore",
      label: location.label,
      entryId: entry.id,
      focusElementId: lorebookFieldElementIds[location.field],
    };
  }

  if (location.type === "character_field") {
    const character = (room.localCharacters ?? []).find((item) =>
      item.id === location.characterId
    );
    if (!character) {
      return null;
    }

    if (location.field === "memory") {
      const sceneId = getActiveSceneId(room);
      if (!sceneId) {
        return null;
      }

      return {
        moduleId: "scenes",
        label: location.label,
        characterId: character.id,
        sceneId,
        focusElementId: `tavern-scenes-character-memory-${character.id}`,
      };
    }

    return {
      moduleId: "characters",
      label: location.label,
      characterId: character.id,
      focusElementId: characterFieldElementIds[location.field],
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
