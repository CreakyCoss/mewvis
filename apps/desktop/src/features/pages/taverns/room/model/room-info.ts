import type { TavernMessage } from "@/features/pages/taverns/tavern/types";
import type { TavernCharacter } from "@/features/pages/taverns/manage/model";
import type { TavernCharacterMemoryLayers, TavernRoomRuntime, TavernStoryNode } from "./standard";

const createEmptyCharacterMemoryLayers = (): TavernCharacterMemoryLayers => ({
  required: "",
  public: "",
  known: "",
  privateSelf: "",
  directorSecret: "",
});

export const isTavernRoomRuntime = (value: unknown): value is TavernRoomRuntime => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<TavernRoomRuntime>;
  return candidate.version === 1 && Boolean(candidate.identity?.id && candidate.config?.room && candidate.scene);
};

export const materializeTavernRoomMessages = (runtime: TavernRoomRuntime, messages: TavernMessage[]) =>
  messages.map((message) => ({
    ...message,
    roomId: message.roomId || runtime.identity.id,
    status: message.status === "streaming" ? ("done" as const) : message.status,
  }));

export const getTavernRoomStoryNode = (runtime: TavernRoomRuntime): TavernStoryNode | null => {
  const graph = runtime.story.graph;
  return (
    graph.nodes.find((node) => node.id === runtime.story.activeNodeId) ??
    graph.nodes.find((node) => node.id === graph.activeNodeId) ??
    graph.nodes.find((node) => node.id === graph.entryNodeId) ??
    graph.nodes[0] ??
    null
  );
};

export const getTavernRoomSceneTitle = (runtime: TavernRoomRuntime, fallback = "当前场景") =>
  getTavernRoomStoryNode(runtime)?.title.trim() || runtime.scene.title.trim() || fallback;

export const getTavernRoomCharacters = (runtime: TavernRoomRuntime): TavernCharacter[] => {
  const characterById = new Map(runtime.cast.characters.map((character) => [character.id, character]));
  const orderedCharacters = runtime.cast.characterIds
    .map((characterId) => characterById.get(characterId))
    .filter((character): character is TavernCharacter => Boolean(character));

  return orderedCharacters.length > 0 ? orderedCharacters : runtime.cast.characters;
};

export const getTavernRoomActiveCharacter = (runtime: TavernRoomRuntime) => {
  const characters = getTavernRoomCharacters(runtime);
  const activeCharacterId = runtime.scene.activeCharacterId || runtime.cast.activeCharacterId;
  return characters.find((character) => character.id === activeCharacterId) ?? characters[0] ?? null;
};

export const getTavernRoomCharacterMemoryLayers = (runtime: TavernRoomRuntime, characterId: string) =>
  runtime.scene.characterMemoryLayers[characterId] ?? createEmptyCharacterMemoryLayers();
