import {
  createEmptyCharacterMemoryLayers,
  createEmptySceneMemoryLayers,
} from "./memory-layers";
import {
  normalizeScenePromptOverrides,
} from "./scene-prompt-overrides";
import {
  createRouteScopedSceneInstanceId,
} from "./story-runtime";
import type {
  TavernScene,
  TavernSceneInstance,
  TavernStoryGraph,
  TavernStoryNode,
  TavernStoryRun,
} from "./types";

const createSceneInstanceFromScene = ({
  roomId,
  scene,
  node,
  runId,
  pathNodeIds,
  pathEdgeIds,
}: {
  roomId: string;
  scene: TavernScene;
  node: TavernStoryNode;
  runId: string;
  pathNodeIds: string[];
  pathEdgeIds: string[];
}): TavernSceneInstance => {
  const id = createRouteScopedSceneInstanceId(roomId, pathNodeIds);
  return {
    ...scene,
    id,
    sceneId: scene.id,
    nodeId: node.id,
    runIds: [runId],
    pathNodeIds,
    pathEdgeIds,
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

export const buildSceneInstancesForRuns = ({
  roomId,
  graph,
  scenes,
  runs,
  existingInstances = [],
}: {
  roomId: string;
  graph: TavernStoryGraph;
  scenes: TavernScene[];
  runs: TavernStoryRun[];
  existingInstances?: TavernSceneInstance[];
}) => {
  const sceneById = new Map(scenes.map((scene) => [scene.id, scene]));
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const existingById = new Map(existingInstances.map((instance) => [instance.id, instance]));
  const instanceById = new Map<string, TavernSceneInstance>();

  runs.forEach((run) => {
    run.pathNodeIds.forEach((nodeId, index) => {
      const node = nodeById.get(nodeId);
      const scene = node?.sceneId ? sceneById.get(node.sceneId) : scenes[0];
      if (!node || !scene) {
        return;
      }

      const pathNodeIds = run.pathNodeIds.slice(0, index + 1);
      const pathEdgeIds = run.pathEdgeIds.slice(0, index);
      const instanceId = createRouteScopedSceneInstanceId(roomId, pathNodeIds);
      const existing = existingById.get(instanceId);
      const current = instanceById.get(instanceId);
      const instance = current ?? existing ?? createSceneInstanceFromScene({
        roomId,
        scene,
        node,
        runId: run.id,
        pathNodeIds,
        pathEdgeIds,
      });

      instanceById.set(instanceId, {
        ...instance,
        sceneId: scene.id,
        nodeId: node.id,
        runIds: Array.from(new Set([...instance.runIds, run.id])),
        pathNodeIds,
        pathEdgeIds,
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
  });

  return [...instanceById.values()];
};
