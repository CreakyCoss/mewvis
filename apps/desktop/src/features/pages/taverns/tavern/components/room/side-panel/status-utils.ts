import {
  getTavernStatusSnapshotValue,
} from "../../../core";
import type {
  TavernCharacter,
  TavernProgressView,
  TavernRoom,
  TavernStatusDefinition,
  TavernStatusTargetRef,
  TavernStatusValue,
} from "../../../types";
import type {
  ResolvedStatusMetric,
  StatusProgressItem,
} from "./types";

export const getProgressStatusItems = (
  views: TavernProgressView[],
  placement: TavernProgressView["placement"],
) =>
  views
    .filter((view) => view.placement === placement)
    .flatMap((view) =>
      view.items.flatMap((item) => item.type === "status" ? [item] : [])
    );

export const numericStatusPercent = (
  value: TavernStatusValue,
  definition: TavernStatusDefinition,
) => {
  if (typeof value !== "number") {
    return 0;
  }
  const min = typeof definition.min === "number" ? definition.min : 0;
  const max = typeof definition.max === "number" ? definition.max : 100;
  if (max <= min) {
    return 0;
  }
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
};

const resolveStatusTarget = (
  definition: TavernStatusDefinition,
  activeRoom: TavernRoom,
  ownerCharacter?: TavernCharacter,
): TavernStatusTargetRef | null => {
  switch (definition.scope) {
    case "global":
      return { type: "global" };
    case "scene":
      return { type: "scene", sceneId: activeRoom.activeSceneId };
    case "party":
      return { type: "party", partyId: "main" };
    case "character":
      return ownerCharacter ? { type: "character", characterId: ownerCharacter.id } : null;
    case "relationship":
      return null;
  }
};

export const createResolvedStatusMetric = ({
  activeRoom,
  definition,
  item,
  ownerCharacter,
}: {
  activeRoom: TavernRoom;
  definition: TavernStatusDefinition;
  item: StatusProgressItem;
  ownerCharacter?: TavernCharacter;
}): ResolvedStatusMetric | null => {
  const target = resolveStatusTarget(definition, activeRoom, ownerCharacter);
  if (!target) {
    return null;
  }
  const value = getTavernStatusSnapshotValue(
    activeRoom.statusSnapshot,
    target,
    definition.id,
  ) ?? definition.defaultValue;
  return {
    key: `${definition.id}:${ownerCharacter?.id ?? "room"}`,
    definition,
    item,
    value,
    percent: numericStatusPercent(value, definition),
  };
};

export const createFallbackStatusItem = (statusId: string): StatusProgressItem => ({
  type: "status",
  statusId,
  display: "bar",
});
