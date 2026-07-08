import type { VisualPresetId } from "@/features/pages/taverns/tavern/visual-presets/types";
import type { TavernMessage } from "@/features/pages/taverns/tavern/types";
import type {
  TavernCharacter,
  TavernCharacterPrivateStatus,
  TavernCharacterPublicStatus,
  TavernPendingInteraction,
  TavernReplyOption,
  TavernRoom as TavernRoomConfig,
  TavernRoomCharacterConfig,
  TavernSceneRelationshipOverride,
  TavernSceneStatus,
} from "@/features/pages/taverns/manage/model";
import type { TavernCharacterMemoryLayers, TavernRoomRuntime, TavernScene, TavernStoryNode } from "./standard";

export type TavernSceneFields = {
  scenePresetId: VisualPresetId;
  scene: string;
  sceneGoal: string;
  scenePlot: string;
  sceneDirection: string;
  sceneTransition: string;
  memory: string;
  relationshipOverrides: TavernSceneRelationshipOverride[];
  sceneStatus?: TavernSceneStatus;
  characterPublicStatuses: Record<string, TavernCharacterPublicStatus>;
  characterPrivateStatuses: Record<string, TavernCharacterPrivateStatus>;
  pendingInteractions: TavernPendingInteraction[];
  replyOptions: TavernReplyOption[];
  characterConfigs: Record<string, TavernRoomCharacterConfig>;
  characterMemories: Record<string, string>;
  characterIds: string[];
  activeCharacterId: string;
};

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

export const getTavernRoomConfig = (runtime: TavernRoomRuntime): TavernRoomConfig => ({
  ...runtime.config.room,
  id: runtime.identity.id,
  workspaceId: runtime.identity.workspaceId,
  title: runtime.identity.title,
  creationSource: runtime.identity.creationSource,
  presentation: runtime.presentation.profile,
  prompt: runtime.presentation.prompt,
  settings: runtime.presentation.settings,
  scenePresetId: runtime.presentation.scenePresetId,
  replyMode: runtime.presentation.replyMode,
  createdAt: runtime.identity.createdAt,
  updatedAt: runtime.identity.updatedAt,
});

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

export const getTavernRoomScene = (runtime: TavernRoomRuntime): TavernScene => runtime.scene;

export const getTavernRoomSceneTitle = (runtime: TavernRoomRuntime, fallback = "当前场景") =>
  getTavernRoomStoryNode(runtime)?.title.trim() || runtime.scene.title.trim() || fallback;

export const getTavernRoomSceneFields = (runtime: TavernRoomRuntime): TavernSceneFields => ({
  scenePresetId: runtime.scene.scenePresetId,
  scene: runtime.scene.scene,
  sceneGoal: runtime.scene.sceneGoal,
  scenePlot: runtime.scene.plot,
  sceneDirection: runtime.scene.storyDirection,
  sceneTransition: runtime.scene.transition,
  memory: runtime.scene.memory,
  relationshipOverrides: runtime.scene.relationshipOverrides,
  sceneStatus: runtime.scene.sceneStatus,
  characterPublicStatuses: runtime.scene.characterPublicStatuses,
  characterPrivateStatuses: runtime.scene.characterPrivateStatuses,
  pendingInteractions: runtime.scene.pendingInteractions,
  replyOptions: runtime.scene.replyOptions,
  characterConfigs: runtime.scene.characterConfigs ?? {},
  characterMemories: runtime.scene.characterMemories,
  characterIds: runtime.scene.characterIds,
  activeCharacterId: runtime.scene.activeCharacterId,
});

export const getTavernRoomCharacters = (runtime: TavernRoomRuntime): TavernCharacter[] => {
  const characterById = new Map(runtime.cast.characters.map((character) => [character.id, character]));
  const orderedCharacters = runtime.cast.characterIds
    .map((characterId) => characterById.get(characterId))
    .filter((character): character is TavernCharacter => Boolean(character));

  return orderedCharacters.length > 0 ? orderedCharacters : runtime.cast.characters;
};

export const getTavernRoomActiveCharacter = (runtime: TavernRoomRuntime) => {
  const characters = getTavernRoomCharacters(runtime);
  const sceneFields = getTavernRoomSceneFields(runtime);
  const activeCharacterId = sceneFields.activeCharacterId || runtime.cast.activeCharacterId;
  return characters.find((character) => character.id === activeCharacterId) ?? characters[0] ?? null;
};

export const getTavernRoomPromptOverrides = (runtime: TavernRoomRuntime) => runtime.scene.promptOverrides;

export const getTavernRoomSceneMemoryLayers = (runtime: TavernRoomRuntime) => runtime.scene.memoryLayers;

export const getTavernRoomCharacterMemoryLayers = (runtime: TavernRoomRuntime, characterId: string) =>
  runtime.scene.characterMemoryLayers[characterId] ?? createEmptyCharacterMemoryLayers();
