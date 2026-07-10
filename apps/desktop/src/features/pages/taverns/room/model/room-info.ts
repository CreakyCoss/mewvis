import type { TavernCharacter } from "@/features/pages/taverns/manage/model";
import type { TavernRoomRuntime, TavernStoryNode } from "./standard";

export const getTavernRoomStoryNode = (runtime: TavernRoomRuntime): TavernStoryNode =>
  runtime.story.graph.nodes.find((node) => node.id === runtime.story.graph.activeNodeId)!;

export const getTavernRoomSceneTitle = (runtime: TavernRoomRuntime) => getTavernRoomStoryNode(runtime).title.trim();

export const getTavernRoomCharacters = (runtime: TavernRoomRuntime): TavernCharacter[] => {
  const characterById = new Map(runtime.cast.characters.map((character) => [character.id, character]));
  return runtime.cast.characterIds.map((characterId) => characterById.get(characterId)!);
};

export const getTavernRoomActiveCharacter = (runtime: TavernRoomRuntime) => {
  const characters = getTavernRoomCharacters(runtime);
  return characters.find((character) => character.id === runtime.scene.activeCharacterId) ?? null;
};

export const getTavernRoomCharacterMemoryLayers = (runtime: TavernRoomRuntime, characterId: string) =>
  runtime.scene.characterMemoryLayers[characterId];
