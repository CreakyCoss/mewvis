import { workspaceFile } from "@/platform/files";
import { STORY_TAVERN_FILE, type StoryWorkspace } from "../../storage";
import { createEmptyManualTavernRoom, type TavernRoomConfig } from "./model";

type StoryTavernOwner = {
  id: string;
  workspace: StoryWorkspace;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const createStoryTavernConfig = (item: StoryTavernOwner): TavernRoomConfig => ({
  ...createEmptyManualTavernRoom(1),
  id: `tavern-${item.id}`,
  title: `${item.workspace.name} · 酒馆`,
});

const normalizeStoryTavernConfig = (item: StoryTavernOwner, value: unknown): TavernRoomConfig | null => {
  if (!isRecord(value)) {
    return null;
  }

  const fallback = createStoryTavernConfig(item);
  const presentation = isRecord(value.presentation) ? value.presentation : {};
  const systemNarrative = isRecord(value.systemNarrative) ? value.systemNarrative : {};
  const settings = isRecord(value.settings) ? value.settings : {};
  const directorLoop = isRecord(settings.directorLoop) ? settings.directorLoop : {};
  const directorNarrativeControl = isRecord(settings.directorNarrativeControl) ? settings.directorNarrativeControl : {};

  return {
    ...fallback,
    ...value,
    id: typeof value.id === "string" && value.id.trim() ? value.id : fallback.id,
    title: typeof value.title === "string" ? value.title : fallback.title,
    presentation: {
      ...fallback.presentation,
      ...presentation,
    },
    systemNarrative: {
      ...fallback.systemNarrative,
      ...systemNarrative,
    },
    settings: {
      ...fallback.settings,
      ...settings,
      directorLoop: {
        ...fallback.settings.directorLoop,
        ...directorLoop,
      },
      directorNarrativeControl: {
        ...fallback.settings.directorNarrativeControl,
        ...directorNarrativeControl,
      },
    },
  } as TavernRoomConfig;
};

export const saveStoryTavernConfig = async (
  workspace: StoryWorkspace,
  config: TavernRoomConfig,
): Promise<TavernRoomConfig> => {
  await workspaceFile(workspace.path, STORY_TAVERN_FILE).writeJson(config);
  return config;
};

export const loadStoryTavernConfig = async (item: StoryTavernOwner): Promise<TavernRoomConfig | null> => {
  const parsed = await workspaceFile(item.workspace.path, STORY_TAVERN_FILE).readJson();
  return normalizeStoryTavernConfig(item, parsed);
};

export const loadOrCreateStoryTavernConfig = async (item: StoryTavernOwner): Promise<TavernRoomConfig> => {
  const existing = await loadStoryTavernConfig(item);
  if (existing) {
    return existing;
  }

  return saveStoryTavernConfig(item.workspace, createStoryTavernConfig(item));
};
