import {
  collectUniqueTrimmedLines,
  formatTavernMemoryBlocks,
  getTavernBranchPathInstances,
  getTavernBranchSecretReveals,
  resolveCharacterMemoryEntryText,
  resolveSceneMemoryEntryText,
} from "./branch-memory";
import {
  createTavernId as createId,
} from "../ids";
import {
  createEmptyCharacterMemoryLayers,
  createEmptySceneMemoryLayers,
} from "./memory-layers";
import {
  ensureTavernRoomRuntimeScopes,
} from "./room-runtime-scopes";
import {
  normalizeScenePromptOverrides,
} from "./scene-prompt-overrides";
import {
  resolveActiveSceneInstance,
} from "./scene-instances";
import {
  getTavernSceneInstanceDisplayTitle,
} from "./scene-selectors";
import {
  createRouteScopedSceneInstanceId,
  resolveRunNodePrefix,
} from "./story-runtime";
import type {
  TavernCharacterMemoryLayers,
  TavernMemoryEntry,
  TavernRoom,
  TavernScene,
  TavernSceneInstance,
  TavernSceneMemoryLayers,
  TavernScenePromptOverrides,
  TavernSecretReveal,
} from "../types";

type TavernProjectableScene = Pick<
  TavernScene,
  | "scenePresetId"
  | "scene"
  | "sceneGoal"
  | "plot"
  | "storyDirection"
  | "transition"
  | "memory"
  | "relationshipOverrides"
  | "sceneStatus"
  | "characterPublicStatuses"
  | "characterPrivateStatuses"
  | "pendingInteractions"
  | "replyOptions"
  | "factEvents"
  | "statusEvents"
  | "statusSnapshot"
  | "previousStatusSnapshot"
  | "statusCheckpoints"
  | "taskDefinitions"
  | "taskEvents"
  | "taskSnapshot"
  | "sceneOutcomes"
  | "outcomeEvents"
  | "characterConfigs"
  | "characterMemories"
  | "illustrationHints"
  | "assetDrafts"
  | "characterIds"
  | "activeCharacterId"
>;

const projectSceneNarrativeFieldsToRoom = (
  scene: TavernProjectableScene,
) => ({
  scenePresetId: scene.scenePresetId,
  scene: scene.scene,
  sceneGoal: scene.sceneGoal,
  scenePlot: scene.plot,
  sceneDirection: scene.storyDirection,
  sceneTransition: scene.transition,
  memory: scene.memory,
  relationshipOverrides: scene.relationshipOverrides,
});

const projectSceneInteractionFieldsToRoom = (
  scene: TavernProjectableScene,
) => ({
  sceneStatus: scene.sceneStatus,
  characterPublicStatuses: scene.characterPublicStatuses,
  characterPrivateStatuses: scene.characterPrivateStatuses,
  pendingInteractions: scene.pendingInteractions,
  replyOptions: scene.replyOptions,
});

const projectSceneProgressFieldsToRoom = (
  scene: TavernProjectableScene,
) => ({
  factEvents: scene.factEvents,
  statusEvents: scene.statusEvents,
  statusSnapshot: scene.statusSnapshot,
  previousStatusSnapshot: scene.previousStatusSnapshot,
  statusCheckpoints: scene.statusCheckpoints,
  taskDefinitions: scene.taskDefinitions,
  taskEvents: scene.taskEvents,
  taskSnapshot: scene.taskSnapshot,
  sceneOutcomes: scene.sceneOutcomes,
  outcomeEvents: scene.outcomeEvents,
});

const projectSceneAssetFieldsToRoom = (
  scene: TavernProjectableScene,
) => ({
  illustrationHints: scene.illustrationHints,
  assetDrafts: scene.assetDrafts,
});

const projectSceneCharacterFieldsToRoom = (
  scene: TavernProjectableScene,
) => ({
  characterConfigs: scene.characterConfigs ?? {},
  characterMemories: scene.characterMemories,
  characterIds: scene.characterIds,
  activeCharacterId: scene.activeCharacterId,
});

export const projectTavernSceneFieldsOntoRoom = (
  scene: TavernProjectableScene,
) => ({
  ...projectSceneNarrativeFieldsToRoom(scene),
  ...projectSceneInteractionFieldsToRoom(scene),
  ...projectSceneProgressFieldsToRoom(scene),
  ...projectSceneAssetFieldsToRoom(scene),
  ...projectSceneCharacterFieldsToRoom(scene),
});

const projectRoomNarrativeFieldsToScene = (
  room: TavernRoom,
) => ({
  scenePresetId: room.scenePresetId,
  scene: room.scene,
  sceneGoal: room.sceneGoal,
  plot: room.scenePlot,
  storyDirection: room.sceneDirection,
  transition: room.sceneTransition,
  memory: room.memory,
  relationshipOverrides: room.relationshipOverrides,
});

const projectRoomInteractionFieldsToScene = (
  room: TavernRoom,
) => ({
  sceneStatus: room.sceneStatus,
  characterPublicStatuses: room.characterPublicStatuses,
  characterPrivateStatuses: room.characterPrivateStatuses,
  pendingInteractions: room.pendingInteractions,
  replyOptions: room.replyOptions,
});

const projectRoomProgressFieldsToScene = (
  room: TavernRoom,
) => ({
  factEvents: room.factEvents,
  statusEvents: room.statusEvents,
  statusSnapshot: room.statusSnapshot,
  previousStatusSnapshot: room.previousStatusSnapshot,
  statusCheckpoints: room.statusCheckpoints,
  taskDefinitions: room.taskDefinitions,
  taskEvents: room.taskEvents,
  taskSnapshot: room.taskSnapshot,
  sceneOutcomes: room.sceneOutcomes,
  outcomeEvents: room.outcomeEvents,
});

const projectRoomAssetFieldsToScene = (
  room: TavernRoom,
) => ({
  illustrationHints: room.illustrationHints,
  assetDrafts: room.assetDrafts,
});

const projectRoomCharacterFieldsToScene = (
  room: TavernRoom,
) => ({
  characterConfigs: room.characterConfigs ?? {},
  characterMemories: room.characterMemories,
  characterIds: room.characterIds,
  activeCharacterId: room.activeCharacterId,
});

const syncTavernSceneInstanceFieldsFromRoom = (
  room: TavernRoom,
  activeInstance: TavernSceneInstance,
): TavernSceneInstance => ({
  ...activeInstance,
  ...projectRoomNarrativeFieldsToScene(room),
  ...projectRoomInteractionFieldsToScene(room),
  ...projectRoomProgressFieldsToScene(room),
  ...projectRoomAssetFieldsToScene(room),
  ...projectRoomCharacterFieldsToScene(room),
  updatedAt: room.updatedAt,
});

export const getActiveTavernSceneInstance = (
  room: TavernRoom | null | undefined,
) => {
  if (!room?.sceneInstances?.length) {
    return null;
  }

  return resolveActiveSceneInstance(room);
};

export const findTavernSceneInstanceIdForNode = (
  room: TavernRoom,
  nodeId: string | undefined | null,
) => {
  const targetNodeId = nodeId?.trim();
  if (!targetNodeId) {
    return "";
  }

  const runtimeRoom = ensureTavernRoomRuntimeScopes(room);
  const activeRun = runtimeRoom.storyRuns.find((run) =>
    run.id === runtimeRoom.activeRunId && run.pathNodeIds.includes(targetNodeId)
  ) ?? runtimeRoom.storyRuns.find((run) => run.pathNodeIds.includes(targetNodeId)) ?? null;
  const scopedInstanceId = activeRun
    ? createRouteScopedSceneInstanceId(
        runtimeRoom.id,
        resolveRunNodePrefix(activeRun, targetNodeId),
      )
    : "";

  return runtimeRoom.sceneInstances.find((instance) => instance.id === scopedInstanceId)?.id ??
    runtimeRoom.sceneInstances.find((instance) => instance.nodeId === targetNodeId)?.id ??
    "";
};

export const switchTavernRoomStoryNode = (
  room: TavernRoom,
  nodeId: string | undefined | null,
) => {
  const sceneInstanceId = findTavernSceneInstanceIdForNode(room, nodeId);
  return sceneInstanceId ? switchTavernRoomSceneInstance(room, sceneInstanceId) : room;
};

export const projectTavernSceneOntoRoom = (room: TavernRoom): TavernRoom => {
  const runtimeRoom = ensureTavernRoomRuntimeScopes(room);
  const activeInstance = getActiveTavernSceneInstance(runtimeRoom);
  if (!activeInstance) {
    return runtimeRoom;
  }

  return {
    ...runtimeRoom,
    activeSceneId: activeInstance.sceneId,
    activeSceneInstanceId: activeInstance.id,
    ...projectTavernSceneFieldsOntoRoom(activeInstance),
  };
};

export type TavernBranchUpstreamMemoryLoadResult = {
  room: TavernRoom;
  sourceInstanceIds: string[];
  sceneMemory: string;
  characterMemories: Record<string, string>;
  revealedSecretIds: string[];
};

export const loadTavernBranchUpstreamMemory = (
  room: TavernRoom,
): TavernBranchUpstreamMemoryLoadResult => {
  const runtimeRoom = ensureTavernRoomRuntimeScopes(room);
  const activeInstance = getActiveTavernSceneInstance(runtimeRoom);
  if (!activeInstance) {
    return {
      room: runtimeRoom,
      sourceInstanceIds: [],
      sceneMemory: "",
      characterMemories: {},
      revealedSecretIds: [],
    };
  }

  const { upstreamInstances, pathInstances } = getTavernBranchPathInstances(runtimeRoom, activeInstance);
  const reveals = getTavernBranchSecretReveals(pathInstances);
  const revealedSecretIds = Array.from(new Set(reveals.map((reveal) => reveal.secretId)));

  const sceneMemory = formatTavernMemoryBlocks(upstreamInstances.map((instance) => {
    const layers = createEmptySceneMemoryLayers(instance.memoryLayers);
    const entryLines = (layers.entries ?? [])
      .map((entry) => resolveSceneMemoryEntryText(entry, reveals))
      .filter(Boolean);

    return {
      title: getTavernSceneInstanceDisplayTitle(runtimeRoom, instance.id, instance.title),
      lines: [
        layers.required,
        instance.memory,
        layers.public,
        layers.private,
        ...entryLines,
      ],
    };
  }));

  const characterIds = Array.from(new Set([
    ...runtimeRoom.characterIds,
    ...activeInstance.characterIds,
    ...upstreamInstances.flatMap((instance) => [
      ...instance.characterIds,
      ...Object.keys(instance.characterMemoryLayers ?? {}),
    ]),
  ]));
  const characterMemories = Object.fromEntries(characterIds.flatMap((characterId) => {
    const memory = formatTavernMemoryBlocks(upstreamInstances.map((instance) => {
      const layers = createEmptyCharacterMemoryLayers(
        instance.characterMemoryLayers?.[characterId],
      );
      const entryLines = (layers.entries ?? [])
        .map((entry) => resolveCharacterMemoryEntryText(entry, reveals, characterId))
        .filter(Boolean);

      return {
        title: getTavernSceneInstanceDisplayTitle(runtimeRoom, instance.id, instance.title),
        lines: [
          layers.required,
          layers.public,
          layers.known,
          layers.privateSelf,
          ...entryLines,
        ],
      };
    }));

    return memory.trim() ? [[characterId, memory]] : [];
  }));
  const updatedAt = Date.now();
  const nextInstances = runtimeRoom.sceneInstances.map((instance) => {
    if (instance.id !== activeInstance.id) {
      return instance;
    }

    const nextCharacterMemoryLayers = { ...instance.characterMemoryLayers };
    for (const characterId of characterIds) {
      const layers = createEmptyCharacterMemoryLayers(nextCharacterMemoryLayers[characterId]);
      nextCharacterMemoryLayers[characterId] = {
        ...layers,
        known: characterMemories[characterId] ?? "",
        updatedAt,
      };
    }

    return {
      ...instance,
      memoryLayers: {
        ...createEmptySceneMemoryLayers(instance.memoryLayers),
        upstream: sceneMemory,
        updatedAt,
      },
      characterMemoryLayers: nextCharacterMemoryLayers,
      updatedAt,
    };
  });

  return {
    room: projectTavernSceneOntoRoom({
      ...runtimeRoom,
      sceneInstances: nextInstances,
      updatedAt,
    }),
    sourceInstanceIds: upstreamInstances.map((instance) => instance.id),
    sceneMemory,
    characterMemories,
    revealedSecretIds,
  };
};

export type TavernBranchSecretMemoryOption = {
  secretId: string;
  text: string;
  sourceInstanceId: string;
  sourceTitle: string;
  target: "scene" | "character";
  characterId?: string;
  ownerCharacterId?: string;
};

export const listTavernBranchSecretMemoryEntries = (
  room: TavernRoom,
): TavernBranchSecretMemoryOption[] => {
  const runtimeRoom = ensureTavernRoomRuntimeScopes(room);
  const activeInstance = getActiveTavernSceneInstance(runtimeRoom);
  if (!activeInstance) {
    return [];
  }

  const { pathInstances } = getTavernBranchPathInstances(runtimeRoom, activeInstance);
  const seen = new Set<string>();

  return pathInstances.flatMap((instance) => {
    const sourceTitle = getTavernSceneInstanceDisplayTitle(runtimeRoom, instance.id, instance.title);
    const sceneEntries = (instance.memoryLayers.entries ?? []).flatMap((entry) => {
      const secretId = entry.secretId?.trim();
      const text = entry.text.trim();
      if (!secretId || !text || seen.has(`scene:${secretId}`)) {
        return [];
      }
      seen.add(`scene:${secretId}`);
      return [{
        secretId,
        text,
        sourceInstanceId: instance.id,
        sourceTitle,
        target: "scene" as const,
        ownerCharacterId: entry.ownerCharacterId,
      }];
    });
    const characterEntries = Object.entries(instance.characterMemoryLayers ?? {})
      .flatMap(([characterId, layers]) =>
        (layers.entries ?? []).flatMap((entry) => {
          const secretId = entry.secretId?.trim();
          const text = entry.text.trim();
          if (!secretId || !text || seen.has(`character:${characterId}:${secretId}`)) {
            return [];
          }
          seen.add(`character:${characterId}:${secretId}`);
          return [{
            secretId,
            text,
            sourceInstanceId: instance.id,
            sourceTitle,
            target: "character" as const,
            characterId,
            ownerCharacterId: entry.ownerCharacterId,
          }];
        })
      );

    return [...sceneEntries, ...characterEntries];
  });
};

export type TavernSecretMemoryTarget =
  | { type: "scene" }
  | { type: "character"; characterId: string };

export const addTavernSecretMemoryEntry = (
  room: TavernRoom,
  input: {
    target: TavernSecretMemoryTarget;
    text: string;
    secretId?: string;
  },
) => {
  const runtimeRoom = ensureTavernRoomRuntimeScopes(room);
  const activeInstance = getActiveTavernSceneInstance(runtimeRoom);
  const text = input.text.trim();
  if (!activeInstance || !text) {
    return { room: runtimeRoom, entry: null };
  }

  const createdAt = Date.now();
  const secretId = input.secretId?.trim() || createId("secret");
  const entry: TavernMemoryEntry = {
    id: createId("memory-entry"),
    text,
    visibility: "hidden",
    secretId,
    ownerCharacterId: input.target.type === "character" ? input.target.characterId : undefined,
    visibleToCharacterIds: [],
    sourceMessageIds: [],
    createdAt,
    updatedAt: createdAt,
  };

  const sceneInstances = runtimeRoom.sceneInstances.map((instance) => {
    if (instance.id !== activeInstance.id) {
      return instance;
    }

    if (input.target.type === "scene") {
      const memoryLayers = createEmptySceneMemoryLayers(instance.memoryLayers);
      return {
        ...instance,
        memoryLayers: {
          ...memoryLayers,
          entries: [...(memoryLayers.entries ?? []), entry],
          updatedAt: createdAt,
        },
        updatedAt: createdAt,
      };
    }

    const characterMemoryLayers = { ...instance.characterMemoryLayers };
    const layers = createEmptyCharacterMemoryLayers(characterMemoryLayers[input.target.characterId]);
    characterMemoryLayers[input.target.characterId] = {
      ...layers,
      entries: [...(layers.entries ?? []), entry],
      updatedAt: createdAt,
    };

    return {
      ...instance,
      characterMemoryLayers,
      updatedAt: createdAt,
    };
  });

  return {
    room: projectTavernSceneOntoRoom({
      ...runtimeRoom,
      sceneInstances,
      updatedAt: createdAt,
    }),
    entry,
  };
};

export const revealTavernSecretMemory = (
  room: TavernRoom,
  input: {
    secretId: string;
    visibility: "public" | "character";
    targetCharacterIds?: string[];
    note?: string;
  },
) => {
  const runtimeRoom = ensureTavernRoomRuntimeScopes(room);
  const activeInstance = getActiveTavernSceneInstance(runtimeRoom);
  const secretId = input.secretId.trim();
  if (!activeInstance || !secretId) {
    return { room: runtimeRoom, reveal: null };
  }

  const revealedAt = Date.now();
  const targetCharacterIds = input.visibility === "character"
    ? Array.from(new Set((input.targetCharacterIds ?? []).filter(Boolean)))
    : [];
  const reveal: TavernSecretReveal = {
    id: createId("secret-reveal"),
    secretId,
    scope: { type: "sceneInstance", sceneInstanceId: activeInstance.id },
    visibility: input.visibility,
    targetCharacterIds,
    sourceMessageIds: [],
    note: input.note?.trim() || undefined,
    revealedAt,
  };

  const sceneInstances = runtimeRoom.sceneInstances.map((instance) => {
    if (instance.id !== activeInstance.id) {
      return instance;
    }

    const existingReveals = instance.secretReveals.filter((item) =>
      !(
        item.secretId === reveal.secretId &&
        item.scope.type === "sceneInstance" &&
        item.scope.sceneInstanceId === activeInstance.id &&
        item.visibility === reveal.visibility &&
        item.targetCharacterIds.join("|") === reveal.targetCharacterIds.join("|")
      )
    );

    const matchingSceneEntryTexts = (instance.memoryLayers.entries ?? [])
      .filter((entry) => entry.secretId === reveal.secretId)
      .map((entry) => entry.text.trim())
      .filter(Boolean);
    const matchingCharacterEntryTexts = Object.values(instance.characterMemoryLayers ?? {})
      .flatMap((layers) => (layers.entries ?? [])
        .filter((entry) => entry.secretId === reveal.secretId)
        .map((entry) => entry.text.trim())
        .filter(Boolean)
      );
    let nextMemoryLayers = createEmptySceneMemoryLayers(instance.memoryLayers);
    let nextCharacterMemoryLayers = { ...instance.characterMemoryLayers };
    if (reveal.visibility === "public") {
      nextMemoryLayers = {
        ...nextMemoryLayers,
        public: collectUniqueTrimmedLines([
          nextMemoryLayers.public,
          ...matchingSceneEntryTexts,
        ]).join("\n"),
        updatedAt: revealedAt,
      };
      nextCharacterMemoryLayers = Object.fromEntries(
        Object.entries(nextCharacterMemoryLayers).map(([characterId, layers]) => {
          const normalizedLayers = createEmptyCharacterMemoryLayers(layers);
          const entryTexts = (normalizedLayers.entries ?? [])
            .filter((entry) => entry.secretId === reveal.secretId)
            .map((entry) => entry.text.trim())
            .filter(Boolean);
          return [
            characterId,
            {
              ...normalizedLayers,
              public: collectUniqueTrimmedLines([
                normalizedLayers.public,
                ...entryTexts,
              ]).join("\n"),
              updatedAt: entryTexts.length > 0 ? revealedAt : normalizedLayers.updatedAt,
            },
          ];
        }),
      );
    } else {
      for (const characterId of reveal.targetCharacterIds) {
        const normalizedLayers = createEmptyCharacterMemoryLayers(nextCharacterMemoryLayers[characterId]);
        nextCharacterMemoryLayers[characterId] = {
          ...normalizedLayers,
          known: collectUniqueTrimmedLines([
            normalizedLayers.known,
            ...matchingSceneEntryTexts,
            ...matchingCharacterEntryTexts,
          ]).join("\n"),
          updatedAt: revealedAt,
        };
      }
    }

    return {
      ...instance,
      secretReveals: [...existingReveals, reveal],
      memoryLayers: nextMemoryLayers,
      characterMemoryLayers: nextCharacterMemoryLayers,
      updatedAt: revealedAt,
    };
  });

  return {
    room: projectTavernSceneOntoRoom({
      ...runtimeRoom,
      sceneInstances,
      updatedAt: revealedAt,
    }),
    reveal,
  };
};

export const updateTavernActiveSceneMemoryLayers = (
  room: TavernRoom,
  patch: Partial<TavernSceneMemoryLayers>,
) => {
  const runtimeRoom = ensureTavernRoomRuntimeScopes(room);
  const activeInstance = getActiveTavernSceneInstance(runtimeRoom);
  if (!activeInstance) {
    return runtimeRoom;
  }

  const updatedAt = Date.now();
  const sceneInstances = runtimeRoom.sceneInstances.map((instance) => {
    if (instance.id !== activeInstance.id) {
      return instance;
    }

    return {
      ...instance,
      memoryLayers: {
        ...createEmptySceneMemoryLayers(instance.memoryLayers),
        ...patch,
        updatedAt,
      },
      updatedAt,
    };
  });

  return projectTavernSceneOntoRoom({
    ...runtimeRoom,
    sceneInstances,
    updatedAt,
  });
};

export const updateTavernActiveCharacterMemoryLayers = (
  room: TavernRoom,
  characterId: string,
  patch: Partial<TavernCharacterMemoryLayers>,
) => {
  const runtimeRoom = ensureTavernRoomRuntimeScopes(room);
  const activeInstance = getActiveTavernSceneInstance(runtimeRoom);
  if (!activeInstance || !characterId) {
    return runtimeRoom;
  }

  const updatedAt = Date.now();
  const sceneInstances = runtimeRoom.sceneInstances.map((instance) => {
    if (instance.id !== activeInstance.id) {
      return instance;
    }

    const characterMemoryLayers = { ...instance.characterMemoryLayers };
    characterMemoryLayers[characterId] = {
      ...createEmptyCharacterMemoryLayers(characterMemoryLayers[characterId]),
      ...patch,
      updatedAt,
    };

    return {
      ...instance,
      characterMemoryLayers,
      updatedAt,
    };
  });

  return projectTavernSceneOntoRoom({
    ...runtimeRoom,
    sceneInstances,
    updatedAt,
  });
};

export const updateTavernActiveScenePromptOverrides = (
  room: TavernRoom,
  overrides: Partial<TavernScenePromptOverrides>,
) => {
  const runtimeRoom = ensureTavernRoomRuntimeScopes(room);
  const activeInstance = getActiveTavernSceneInstance(runtimeRoom);
  if (!activeInstance) {
    return runtimeRoom;
  }

  const updatedAt = Date.now();
  const sceneInstances = runtimeRoom.sceneInstances.map((instance) =>
    instance.id === activeInstance.id
      ? {
          ...instance,
          promptOverrides: normalizeScenePromptOverrides(overrides),
          updatedAt,
        }
      : instance
  );

  return projectTavernSceneOntoRoom({
    ...runtimeRoom,
    sceneInstances,
    updatedAt,
  });
};

export const syncTavernRoomActiveScene = (room: TavernRoom): TavernRoom => {
  const runtimeRoom = ensureTavernRoomRuntimeScopes(room);
  const activeInstance = getActiveTavernSceneInstance(runtimeRoom);
  if (!activeInstance) {
    return runtimeRoom;
  }

  const syncedInstance = syncTavernSceneInstanceFieldsFromRoom(room, activeInstance);

  return projectTavernSceneOntoRoom({
    ...runtimeRoom,
    activeSceneId: syncedInstance.sceneId,
    activeSceneInstanceId: syncedInstance.id,
    sceneInstances: runtimeRoom.sceneInstances.map((instance) =>
      instance.id === syncedInstance.id ? syncedInstance : instance
    ),
  });
};

export const switchTavernRoomScene = (
  room: TavernRoom,
  sceneId: string,
): TavernRoom => {
  const runtimeRoom = ensureTavernRoomRuntimeScopes(room);
  const scene = runtimeRoom.scenes?.find((item) => item.id === sceneId);
  const node = runtimeRoom.storyGraph?.nodes.find((item) => item.sceneId === sceneId);
  const activeRun = node
    ? runtimeRoom.storyRuns.find((run) =>
        run.id === runtimeRoom.activeRunId && run.pathNodeIds.includes(node.id)
      ) ?? runtimeRoom.storyRuns.find((run) => run.pathNodeIds.includes(node.id)) ?? null
    : null;
  const activeInstanceId = activeRun && node
    ? createRouteScopedSceneInstanceId(
        runtimeRoom.id,
        resolveRunNodePrefix(activeRun, node.id),
      )
    : undefined;
  return scene
    ? projectTavernSceneOntoRoom({
        ...runtimeRoom,
        storyGraph: node
          ? {
              ...runtimeRoom.storyGraph,
              activeNodeId: node.id,
            }
          : runtimeRoom.storyGraph,
        storyRuns: activeRun
          ? runtimeRoom.storyRuns.map((run) =>
              run.id === activeRun.id ? { ...run, activeNodeId: node?.id ?? run.activeNodeId } : run
            )
          : runtimeRoom.storyRuns,
        activeRunId: activeRun?.id ?? runtimeRoom.activeRunId,
        activeSceneId: scene.id,
        activeSceneInstanceId: activeInstanceId ?? runtimeRoom.activeSceneInstanceId,
        updatedAt: Date.now(),
      })
    : runtimeRoom;
};

export const switchTavernRoomSceneInstance = (
  room: TavernRoom,
  sceneInstanceId: string,
): TavernRoom => {
  const runtimeRoom = ensureTavernRoomRuntimeScopes(room);
  const activeInstance = runtimeRoom.sceneInstances.find((instance) =>
    instance.id === sceneInstanceId
  );
  if (!activeInstance) {
    return switchTavernRoomScene(runtimeRoom, sceneInstanceId);
  }

  const activeRunId = activeInstance.runIds.includes(runtimeRoom.activeRunId ?? "")
    ? runtimeRoom.activeRunId
    : activeInstance.runIds[0] ?? runtimeRoom.activeRunId;

  return projectTavernSceneOntoRoom({
    ...runtimeRoom,
    activeRunId,
    activeSceneId: activeInstance.sceneId,
    activeSceneInstanceId: activeInstance.id,
    storyGraph: {
      ...runtimeRoom.storyGraph,
      activeNodeId: activeInstance.nodeId,
    },
    storyRuns: runtimeRoom.storyRuns.map((run) =>
      run.id === activeRunId
        ? { ...run, activeNodeId: activeInstance.nodeId, updatedAt: Date.now() }
        : run
    ),
    updatedAt: Date.now(),
  });
};
