import type { TavernCharacterMemoryLayers, TavernSceneMemoryLayers } from "@/features/pages/taverns/room/model";

export const createEmptySceneMemoryLayers = (
  input: Partial<TavernSceneMemoryLayers> = {},
): TavernSceneMemoryLayers => ({
  required: input.required?.trim() ?? "",
  private: input.private?.trim() ?? "",
  public: input.public?.trim() ?? "",
  directorSecret: input.directorSecret?.trim() ?? "",
  entries: Array.isArray(input.entries) ? input.entries : [],
  updatedAt: input.updatedAt,
});

export const createEmptyCharacterMemoryLayers = (
  input: Partial<TavernCharacterMemoryLayers> = {},
): TavernCharacterMemoryLayers => ({
  required: input.required?.trim() ?? "",
  public: input.public?.trim() ?? "",
  known: input.known?.trim() ?? "",
  privateSelf: input.privateSelf?.trim() ?? "",
  directorSecret: input.directorSecret?.trim() ?? "",
  entries: Array.isArray(input.entries) ? input.entries : [],
  updatedAt: input.updatedAt,
});
