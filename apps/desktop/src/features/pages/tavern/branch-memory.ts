import {
  createRouteScopedSceneInstanceId,
} from "./story-runtime";
import type {
  TavernMemoryEntry,
  TavernRoom,
  TavernSceneInstance,
  TavernSecretReveal,
} from "./types";

export const collectUniqueTrimmedLines = (values: Array<string | undefined>) => {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed)) {
      return [];
    }

    seen.add(trimmed);
    return [trimmed];
  });
};

export const formatTavernMemoryBlocks = (
  blocks: Array<{ title: string; lines: string[] }>,
) => blocks
  .flatMap((block) => {
    const lines = collectUniqueTrimmedLines(block.lines);
    return lines.length > 0 ? [`【${block.title}】\n${lines.join("\n")}`] : [];
  })
  .join("\n\n");

const tavernSecretRevealAppliesToInstance = (
  reveal: TavernSecretReveal,
  instance: TavernSceneInstance,
) => {
  switch (reveal.scope.type) {
    case "scene":
      return reveal.scope.sceneId === instance.sceneId;
    case "node":
      return reveal.scope.nodeId === instance.nodeId;
    case "sceneInstance":
      return reveal.scope.sceneInstanceId === instance.id;
    case "run":
      return instance.runIds.includes(reveal.scope.runId);
  }
};

export const getTavernBranchSecretReveals = (
  pathInstances: TavernSceneInstance[],
) => pathInstances.flatMap((instance) =>
  instance.secretReveals.filter((reveal) =>
    pathInstances.some((pathInstance) => tavernSecretRevealAppliesToInstance(reveal, pathInstance))
  )
);

const findTavernSecretReveal = (
  secretId: string | undefined,
  reveals: TavernSecretReveal[],
  characterId?: string,
) => {
  if (!secretId) {
    return null;
  }

  return reveals.find((reveal) =>
    reveal.secretId === secretId &&
    (
      reveal.visibility === "public" ||
      (characterId ? reveal.targetCharacterIds.includes(characterId) : false)
    )
  ) ?? null;
};

export const resolveSceneMemoryEntryText = (
  entry: TavernMemoryEntry,
  reveals: TavernSecretReveal[],
) => {
  const text = entry.text.trim();
  if (!text) {
    return "";
  }

  if (entry.visibility === "public" || entry.visibility === "character_known") {
    return text;
  }

  const reveal = findTavernSecretReveal(entry.secretId, reveals);
  return reveal?.visibility === "public" ? text : "";
};

export const resolveCharacterMemoryEntryText = (
  entry: TavernMemoryEntry,
  reveals: TavernSecretReveal[],
  characterId: string,
) => {
  const text = entry.text.trim();
  if (!text) {
    return "";
  }

  if (
    entry.visibility === "public" ||
    entry.visibleToCharacterIds?.includes(characterId) ||
    (entry.visibility === "private_self" && entry.ownerCharacterId === characterId)
  ) {
    return text;
  }

  return findTavernSecretReveal(entry.secretId, reveals, characterId) ? text : "";
};

export const getTavernBranchPathInstances = (
  room: TavernRoom,
  activeInstance: TavernSceneInstance,
) => {
  const upstreamPathNodePrefixes = activeInstance.pathNodeIds
    .slice(0, -1)
    .map((_, index) => activeInstance.pathNodeIds.slice(0, index + 1));
  const upstreamInstances = upstreamPathNodePrefixes.flatMap((pathNodeIds) => {
    const instanceId = createRouteScopedSceneInstanceId(room.id, pathNodeIds);
    const instance = room.sceneInstances.find((item) => item.id === instanceId) ??
      room.sceneInstances.find((item) =>
        item.pathNodeIds.length === pathNodeIds.length &&
        item.pathNodeIds.every((nodeId, index) => nodeId === pathNodeIds[index])
      );
    return instance ? [instance] : [];
  });

  return { upstreamInstances, pathInstances: [...upstreamInstances, activeInstance] };
};
