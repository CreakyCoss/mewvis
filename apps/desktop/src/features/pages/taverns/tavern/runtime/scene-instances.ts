import { createEmptyCharacterMemoryLayers, createEmptySceneMemoryLayers } from "./memory-layers";
import { normalizeScenePromptOverrides } from "./scene-prompt-overrides";
import type {
  TavernScene,
  TavernSceneInstance,
  TavernStoryGraph,
  TavernStoryNode,
  TavernActiveRoomView as TavernRoom,
} from "@/features/pages/taverns/room/model";

const stableIdHash = (value: string) => {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
};

const createNodeScopedSceneInstanceId = (roomId: string, nodeId: string) =>
  `scene-instance-${stableIdHash([roomId, nodeId].join(">"))}`;

export const resolveActiveSceneInstance = (
  room: Pick<TavernRoom, "activeSceneId" | "activeSceneInstanceId" | "storyGraph" | "sceneInstances">,
) => {
  const explicitInstance = room.sceneInstances.find((instance) => instance.id === room.activeSceneInstanceId);
  if (explicitInstance) {
    return explicitInstance;
  }

  return (
    room.sceneInstances.find((instance) => instance.nodeId === room.storyGraph.activeNodeId) ??
    room.sceneInstances.find((instance) => instance.sceneId === room.activeSceneId) ??
    room.sceneInstances[0] ??
    null
  );
};

const createSceneInstanceFromScene = ({
  roomId,
  scene,
  node,
}: {
  roomId: string;
  scene: TavernScene;
  node: TavernStoryNode;
}): TavernSceneInstance => {
  const id = createNodeScopedSceneInstanceId(roomId, node.id);
  return {
    ...scene,
    id,
    sceneId: scene.id,
    nodeId: node.id,
    pathNodeIds: [node.id],
    pathEdgeIds: [],
    promptOverrides: normalizeScenePromptOverrides(),
    memoryLayers: createEmptySceneMemoryLayers({
      required: scene.memory,
      updatedAt: scene.updatedAt,
    }),
    characterMemoryLayers: Object.fromEntries(
      Object.entries(scene.characterMemories).map(([characterId, memory]) => [
        characterId,
        createEmptyCharacterMemoryLayers({
          required: memory,
          updatedAt: scene.updatedAt,
        }),
      ]),
    ),
    secretReveals: [],
  };
};

export const buildNodeScopedSceneInstances = ({
  roomId,
  graph,
  scenes,
  existingInstances = [],
}: {
  roomId: string;
  graph: TavernStoryGraph;
  scenes: TavernScene[];
  existingInstances?: TavernSceneInstance[];
}) => {
  const sceneById = new Map(scenes.map((scene) => [scene.id, scene]));
  const existingById = new Map(existingInstances.map((instance) => [instance.id, instance]));
  const instanceById = new Map<string, TavernSceneInstance>();

  graph.nodes.forEach((node) => {
    const scene = node.sceneId ? sceneById.get(node.sceneId) : scenes[0];
    if (!scene) {
      return;
    }

    const instanceId = createNodeScopedSceneInstanceId(roomId, node.id);
    const legacyInstance =
      existingInstances.find((instance) => instance.nodeId === node.id) ??
      existingInstances.find((instance) => instance.sceneId === scene.id);
    const existing = existingById.get(instanceId) ?? legacyInstance;
    const instance =
      existing ??
      createSceneInstanceFromScene({
        roomId,
        scene,
        node,
      });

    instanceById.set(instanceId, {
      ...instance,
      id: instanceId,
      sceneId: scene.id,
      nodeId: node.id,
      pathNodeIds: [node.id],
      pathEdgeIds: [],
      promptOverrides: normalizeScenePromptOverrides(instance.promptOverrides),
      memoryLayers: createEmptySceneMemoryLayers(instance.memoryLayers),
      characterMemoryLayers: Object.fromEntries(
        Object.entries(instance.characterMemoryLayers ?? {}).map(([characterId, layers]) => [
          characterId,
          createEmptyCharacterMemoryLayers(layers),
        ]),
      ),
      secretReveals: Array.isArray(instance.secretReveals) ? instance.secretReveals : [],
    });
  });

  return [...instanceById.values()];
};
