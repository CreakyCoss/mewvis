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
  projectTavernSceneOntoRoom,
} from "./active-scene-runtime";
import {
  ensureTavernRoomRuntimeScopes,
} from "./room-runtime-scopes";
import {
  resolveActiveSceneInstance,
} from "./scene-instances";
import {
  getTavernSceneInstanceDisplayTitle,
} from "./scene-selectors";
import type {
  TavernMemoryEntry,
  TavernRoom,
  TavernSecretReveal,
} from "../types";

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
  const activeInstance = resolveActiveSceneInstance(runtimeRoom);
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
  const activeInstance = resolveActiveSceneInstance(runtimeRoom);
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
  const activeInstance = resolveActiveSceneInstance(runtimeRoom);
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
  const activeInstance = resolveActiveSceneInstance(runtimeRoom);
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
