import { DEFAULT_VISUAL_PRESET_ID } from "@/features/pages/taverns/tavern/visual-presets";
import { createTavernId as createId, now } from "../ids";
import { createDefaultPromptForPresentation } from "../presentation/presentation-settings";
import { createDefaultTavernPresentation } from "../prompt-registry/presentation-rules";
import { normalizeCharacterRelationships } from "../normalizers/relationships";
import { cloneDefaultRoomSettings } from "../normalizers/room-settings";
import type { TavernCharacter, TavernCharacterRelationship, TavernRoom } from "@/features/pages/taverns/manage/model";

export const createTavernRoom = (workspaceId: string, index: number): TavernRoom => {
  const createdAt = now();
  const roomId = createId("room");
  const presentation = createDefaultTavernPresentation();

  return {
    id: roomId,
    workspaceId,
    title: `新酒馆 ${index}`,
    creationSource: "manual",
    scenePresetId: DEFAULT_VISUAL_PRESET_ID,
    presentation,
    prompt: createDefaultPromptForPresentation(presentation),
    replyMode: "director",
    settings: cloneDefaultRoomSettings(),
    createdAt,
    updatedAt: createdAt,
  };
};

export const createTavernCharacter = (input: {
  name: string;
  avatar: string;
  description: string;
  speakingStyle: string;
  writingStyle?: string;
  replyStylePrompt?: string;
  goals?: string;
  relationships?: TavernCharacterRelationship[];
}): TavernCharacter => {
  const createdAt = now();
  return {
    id: createId("character"),
    name: input.name,
    avatar: input.avatar,
    description: input.description,
    speakingStyle: input.speakingStyle,
    writingStyle: input.writingStyle?.trim() || undefined,
    replyStylePrompt: input.replyStylePrompt?.trim() || undefined,
    goals: input.goals?.trim() || undefined,
    relationships: normalizeCharacterRelationships(input.relationships, createdAt),
    createdAt,
    updatedAt: createdAt,
  };
};
