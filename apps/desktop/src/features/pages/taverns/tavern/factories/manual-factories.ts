import { DEFAULT_VISUAL_PRESET_ID } from "@/features/pages/taverns/tavern/visual-presets";
import { createTavernId as createId, now } from "../ids";
import { createDefaultPromptForPresentation } from "../presentation/presentation-settings";
import { createDefaultTavernPresentation } from "../prompt-registry/presentation-rules";
import { cloneDefaultRoomSettings } from "../normalizers/room-settings";
import type { TavernRoom } from "@/features/pages/taverns/manage/model";

export const createTavernRoom = (workspaceId: string, index: number): TavernRoom => {
  const createdAt = now();
  const roomId = createId("room");
  const presentation = createDefaultTavernPresentation();
  const settings = cloneDefaultRoomSettings();

  return {
    id: roomId,
    workspaceId,
    title: `新酒馆 ${index}`,
    creationSource: "manual",
    scenePresetId: DEFAULT_VISUAL_PRESET_ID,
    presentation,
    prompt: createDefaultPromptForPresentation(presentation, settings),
    replyMode: "director",
    settings,
    createdAt,
    updatedAt: createdAt,
  };
};
