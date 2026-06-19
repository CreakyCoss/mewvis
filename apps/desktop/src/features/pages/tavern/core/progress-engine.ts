import type {
  TavernCondition,
  TavernEntityRef,
  TavernFactEvent,
  TavernRoom,
  TavernOutcomeEvent,
  TavernProgressCheckpoint,
  TavernSceneOutcomeDefinition,
  TavernStatusDefinition,
  TavernStatusEvent,
  TavernStatusRule,
  TavernStatusSnapshot,
  TavernStatusTargetRef,
  TavernStatusValue,
  TavernTaskDefinition,
  TavernTaskEvent,
  TavernTaskState,
} from "../types";

const createProgressId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const tavernEntityRefKey = (entity: TavernEntityRef): string => {
  switch (entity.type) {
    case "user":
      return `user:${entity.userId}`;
    case "character":
      return `character:${entity.characterId}`;
    case "team":
      return `team:${entity.teamId}`;
    case "faction":
      return `faction:${entity.factionId}`;
    case "party":
      return `party:${entity.partyId}`;
    case "scene":
      return `scene:${entity.sceneId}`;
    case "global":
      return "global";
  }
};

export const tavernRelationshipKey = (
  subject: TavernEntityRef,
  object: TavernEntityRef,
) => `relationship:${tavernEntityRefKey(subject)}->${tavernEntityRefKey(object)}`;

export const tavernStatusTargetKey = (target: TavernStatusTargetRef) => {
  switch (target.type) {
    case "global":
      return "global";
    case "scene":
      return target.sceneId ? `scene:${target.sceneId}` : "scene";
    case "party":
      return `party:${target.partyId}`;
    case "character":
      return `character:${target.characterId}`;
    case "relationship":
      return tavernRelationshipKey(target.subject, target.object);
  }
};

export const createEmptyTavernStatusSnapshot = (
  turnId = "initial",
  updatedAt = Date.now(),
): TavernStatusSnapshot => ({
  turnId,
  global: {},
  scene: {},
  parties: {},
  characters: {},
  relationships: {},
  updatedAt,
});

const isNumberValue = (value: TavernStatusValue): value is number =>
  typeof value === "number" && Number.isFinite(value);

const clampNumber = (value: number, min?: number, max?: number) => {
  let nextValue = value;
  if (typeof min === "number") {
    nextValue = Math.max(min, nextValue);
  }
  if (typeof max === "number") {
    nextValue = Math.min(max, nextValue);
  }
  return nextValue;
};

export const getTavernStatusSnapshotValue = (
  snapshot: TavernStatusSnapshot,
  target: TavernStatusTargetRef,
  statusId: string,
): TavernStatusValue => {
  switch (target.type) {
    case "global":
      return snapshot.global[statusId] ?? null;
    case "scene":
      return snapshot.scene[statusId] ?? null;
    case "party":
      return snapshot.parties[target.partyId]?.[statusId] ?? null;
    case "character":
      return snapshot.characters[target.characterId]?.[statusId] ?? null;
    case "relationship":
      return snapshot.relationships[tavernRelationshipKey(target.subject, target.object)]?.[statusId] ?? null;
  }
};

export const setTavernStatusSnapshotValue = (
  snapshot: TavernStatusSnapshot,
  target: TavernStatusTargetRef,
  statusId: string,
  value: TavernStatusValue,
): TavernStatusSnapshot => {
  if (target.type === "global") {
    return {
      ...snapshot,
      global: {
        ...snapshot.global,
        [statusId]: value,
      },
    };
  }

  if (target.type === "scene") {
    return {
      ...snapshot,
      scene: {
        ...snapshot.scene,
        [statusId]: value,
      },
    };
  }

  if (target.type === "party") {
    return {
      ...snapshot,
      parties: {
        ...snapshot.parties,
        [target.partyId]: {
          ...(snapshot.parties[target.partyId] ?? {}),
          [statusId]: value,
        },
      },
    };
  }

  if (target.type === "character") {
    return {
      ...snapshot,
      characters: {
        ...snapshot.characters,
        [target.characterId]: {
          ...(snapshot.characters[target.characterId] ?? {}),
          [statusId]: value,
        },
      },
    };
  }

  const relationshipKey = tavernRelationshipKey(target.subject, target.object);
  return {
    ...snapshot,
    relationships: {
      ...snapshot.relationships,
      [relationshipKey]: {
        ...(snapshot.relationships[relationshipKey] ?? {}),
        [statusId]: value,
      },
    },
  };
};

const statusDefinitionById = (definitions: TavernStatusDefinition[]) =>
  new Map(definitions.map((definition) => [definition.id, definition]));

const defaultStatusValue = (
  definitions: Map<string, TavernStatusDefinition>,
  statusId: string,
) => definitions.get(statusId)?.defaultValue ?? null;

export const applyTavernStatusEventsToSnapshot = ({
  snapshot,
  events,
}: {
  snapshot: TavernStatusSnapshot;
  events: TavernStatusEvent[];
}): TavernStatusSnapshot => events
  .filter((event) => event.status === "applied")
  .reduce((currentSnapshot, event) => setTavernStatusSnapshotValue(
    currentSnapshot,
    event.target,
    event.statusId,
    event.after,
  ), snapshot);

const resolveRuleTarget = (
  factEvent: TavernFactEvent,
  rule: TavernStatusRule,
): TavernStatusTargetRef | null => {
  const targetMode = rule.apply.target ?? "eventTarget";

  if (targetMode === "eventTarget") {
    const target = factEvent.target;
    if (!target) {
      return null;
    }
    if (target.type === "character") {
      return { type: "character", characterId: target.characterId };
    }
    if (target.type === "party") {
      return { type: "party", partyId: target.partyId };
    }
    if (target.type === "scene") {
      return { type: "scene", sceneId: target.sceneId };
    }
    if (target.type === "global") {
      return { type: "global" };
    }
    return null;
  }

  if (targetMode === "eventActor") {
    const actor = factEvent.actor;
    if (actor?.type === "character") {
      return { type: "character", characterId: actor.characterId };
    }
    return null;
  }

  if (targetMode === "relationshipActorToTarget" && factEvent.actor && factEvent.target) {
    return {
      type: "relationship",
      subject: factEvent.actor,
      object: factEvent.target,
    };
  }

  if (targetMode === "relationshipTargetToActor" && factEvent.actor && factEvent.target) {
    return {
      type: "relationship",
      subject: factEvent.target,
      object: factEvent.actor,
    };
  }

  return null;
};

const computeRuleValue = ({
  before,
  definition,
  factEvent,
  rule,
}: {
  before: TavernStatusValue;
  definition: TavernStatusDefinition;
  factEvent: TavernFactEvent;
  rule: TavernStatusRule;
}) => {
  const rawValue = factEvent.value ??
    (factEvent.intensity ? rule.apply.valueByIntensity?.[factEvent.intensity] : undefined) ??
    rule.apply.value;

  if (rule.apply.op === "set") {
    return rawValue ?? definition.defaultValue;
  }

  const numericBefore = isNumberValue(before)
    ? before
    : isNumberValue(definition.defaultValue)
    ? definition.defaultValue
    : 0;
  const numericDelta = typeof rawValue === "number" ? rawValue : 0;
  const [ruleMin, ruleMax] = rule.apply.clamp ?? [];
  return clampNumber(
    numericBefore + numericDelta,
    typeof ruleMin === "number" ? ruleMin : definition.min,
    typeof ruleMax === "number" ? ruleMax : definition.max,
  );
};

export const deriveTavernStatusEventsFromFacts = ({
  factEvents,
  rules,
  definitions,
  snapshot,
  turnId,
  createdAt = Date.now(),
}: {
  factEvents: TavernFactEvent[];
  rules: TavernStatusRule[];
  definitions: TavernStatusDefinition[];
  snapshot: TavernStatusSnapshot;
  turnId: string;
  createdAt?: number;
}): TavernStatusEvent[] => {
  const definitionsById = statusDefinitionById(definitions);
  return factEvents.flatMap((factEvent) => rules.flatMap((rule): TavernStatusEvent[] => {
    if (rule.when.eventType !== factEvent.type) {
      return [];
    }

    const definition = definitionsById.get(rule.apply.statusId);
    if (!definition || definition.scope !== rule.when.targetScope) {
      return [];
    }

    if (
      definition.updatePolicy.allowedEventTypes?.length &&
      !definition.updatePolicy.allowedEventTypes.includes(factEvent.type)
    ) {
      return [];
    }

    const threshold = definition.updatePolicy.confidenceThreshold ?? 0;
    if (factEvent.confidence < threshold) {
      return [];
    }

    if (rule.safeguards?.requireExplicitEvidence && !factEvent.evidence.trim()) {
      return [];
    }

    const target = resolveRuleTarget(factEvent, rule);
    if (!target) {
      return [];
    }

    const before = getTavernStatusSnapshotValue(snapshot, target, definition.id) ??
      defaultStatusValue(definitionsById, definition.id);
    const after = computeRuleValue({
      before,
      definition,
      factEvent,
      rule,
    });
    const delta = isNumberValue(after) && isNumberValue(before)
      ? after - before
      : undefined;
    const maxDelta = rule.safeguards?.maxDeltaPerTurn ?? definition.updatePolicy.maxDeltaPerTurn;
    const requiresReview = typeof delta === "number" && (
      (typeof maxDelta === "number" && Math.abs(delta) > maxDelta) ||
      (typeof rule.safeguards?.manualReviewAboveDelta === "number" &&
        Math.abs(delta) >= rule.safeguards.manualReviewAboveDelta) ||
      (typeof definition.updatePolicy.manualReviewAboveDelta === "number" &&
        Math.abs(delta) >= definition.updatePolicy.manualReviewAboveDelta)
    );

    return [{
      id: createProgressId("status-event"),
      turnId,
      sourceFactEventIds: [factEvent.id],
      sourceMessageIds: factEvent.sourceMessageIds,
      target,
      statusId: definition.id,
      before,
      after,
      ...(typeof delta === "number" ? { delta } : {}),
      reason: `${factEvent.evidence} -> ${rule.label}`,
      confidence: factEvent.confidence,
      visibility: definition.visibility,
      ruleId: rule.id,
      status: requiresReview ? "pending" : "applied",
      createdBy: "rule_engine",
      createdAt,
    }];
  }));
};

const entityMatches = (left: TavernEntityRef | undefined, right: TavernEntityRef | undefined) =>
  !right || (left ? tavernEntityRefKey(left) === tavernEntityRefKey(right) : false);

type TavernStatusCondition = {
  status: string;
  target: TavernStatusTargetRef;
  gte?: number;
  lte?: number;
  equals?: TavernStatusValue;
  notEquals?: TavernStatusValue;
  crossing?: "up" | "down";
};

const isTavernStatusCondition = (condition: TavernCondition): condition is TavernStatusCondition =>
  "status" in condition && "target" in condition && !("task" in condition);

const isTavernTaskCondition = (
  condition: TavernCondition,
): condition is Extract<TavernCondition, { task: string }> =>
  "task" in condition && typeof condition.task === "string";

const compareStatusValue = (
  current: TavernStatusValue,
  previous: TavernStatusValue,
  condition: TavernStatusCondition,
) => {
  if (typeof condition.equals !== "undefined" && current !== condition.equals) {
    return false;
  }
  if (typeof condition.notEquals !== "undefined" && current === condition.notEquals) {
    return false;
  }
  if (typeof condition.gte === "number" && (!isNumberValue(current) || current < condition.gte)) {
    return false;
  }
  if (typeof condition.lte === "number" && (!isNumberValue(current) || current > condition.lte)) {
    return false;
  }
  if (condition.crossing === "up" && typeof condition.gte === "number") {
    return isNumberValue(previous) && isNumberValue(current) &&
      previous < condition.gte &&
      current >= condition.gte;
  }
  if (condition.crossing === "down" && typeof condition.lte === "number") {
    return isNumberValue(previous) && isNumberValue(current) &&
      previous > condition.lte &&
      current <= condition.lte;
  }
  return true;
};

export const evaluateTavernCondition = ({
  condition,
  snapshot,
  previousSnapshot,
  factEvents,
  taskSnapshot,
  flags = {},
}: {
  condition: TavernCondition;
  snapshot: TavernStatusSnapshot;
  previousSnapshot?: TavernStatusSnapshot;
  factEvents: TavernFactEvent[];
  taskSnapshot: Record<string, TavernTaskState>;
  flags?: Record<string, TavernStatusValue>;
}): boolean => {
  if ("all" in condition) {
    return condition.all.every((item) => evaluateTavernCondition({
      condition: item,
      snapshot,
      previousSnapshot,
      factEvents,
      taskSnapshot,
      flags,
    }));
  }
  if ("any" in condition) {
    return condition.any.some((item) => evaluateTavernCondition({
      condition: item,
      snapshot,
      previousSnapshot,
      factEvents,
      taskSnapshot,
      flags,
    }));
  }
  if ("not" in condition) {
    return !evaluateTavernCondition({
      condition: condition.not,
      snapshot,
      previousSnapshot,
      factEvents,
      taskSnapshot,
      flags,
    });
  }
  if (isTavernStatusCondition(condition)) {
    return compareStatusValue(
      getTavernStatusSnapshotValue(snapshot, condition.target, condition.status),
      previousSnapshot
        ? getTavernStatusSnapshotValue(previousSnapshot, condition.target, condition.status)
        : null,
      condition,
    );
  }
  if ("factEvent" in condition) {
    const matches = factEvents.filter((event) =>
      event.type === condition.factEvent &&
      entityMatches(event.actor, condition.actor) &&
      entityMatches(event.target, condition.target)
    );
    return matches.length >= (condition.countGte ?? 1);
  }
  if (isTavernTaskCondition(condition)) {
    const taskState = taskSnapshot[condition.task];
    if (!taskState || taskState.status !== condition.status) {
      return false;
    }
    return entityMatches(taskState.owner, condition.owner);
  }
  if ("flag" in condition) {
    return flags[condition.flag] === condition.equals;
  }
  return false;
};

const createInitialTaskState = (
  task: TavernTaskDefinition,
  createdAt: number,
): TavernTaskState => ({
  taskId: task.id,
  owner: task.owner,
  status: task.lifecycle.initialStatus,
  progress: task.progress?.target
    ? { current: 0, target: task.progress.target }
    : undefined,
  updatedAt: createdAt,
});

export const updateTavernTasks = ({
  taskDefinitions,
  taskSnapshot,
  snapshot,
  previousSnapshot,
  factEvents,
  sourceStatusEventIds,
  turnId,
  createdAt = Date.now(),
}: {
  taskDefinitions: TavernTaskDefinition[];
  taskSnapshot: Record<string, TavernTaskState>;
  snapshot: TavernStatusSnapshot;
  previousSnapshot?: TavernStatusSnapshot;
  factEvents: TavernFactEvent[];
  sourceStatusEventIds: string[];
  turnId: string;
  createdAt?: number;
}): {
  taskSnapshot: Record<string, TavernTaskState>;
  taskEvents: TavernTaskEvent[];
} => {
  let nextTaskSnapshot = { ...taskSnapshot };
  const taskEvents: TavernTaskEvent[] = [];

  for (const task of taskDefinitions) {
    const currentState = nextTaskSnapshot[task.id] ?? createInitialTaskState(task, createdAt);
    let nextState = currentState;
    const conditionInput = {
      snapshot,
      previousSnapshot,
      factEvents,
      taskSnapshot: nextTaskSnapshot,
    };

    if (
      currentState.status === "inactive" &&
      task.lifecycle.startCondition &&
      evaluateTavernCondition({ condition: task.lifecycle.startCondition, ...conditionInput })
    ) {
      nextState = {
        ...currentState,
        status: "active",
        updatedTurnId: turnId,
        updatedAt: createdAt,
      };
      taskEvents.push({
        id: createProgressId("task-event"),
        turnId,
        taskId: task.id,
        owner: task.owner,
        type: "activated",
        before: currentState,
        after: nextState,
        sourceFactEventIds: factEvents.map((event) => event.id),
        sourceStatusEventIds,
        reason: `${task.title} 已激活。`,
        createdAt,
      });
    }

    if (
      nextState.status === "active" &&
      task.lifecycle.failCondition &&
      evaluateTavernCondition({ condition: task.lifecycle.failCondition, ...conditionInput })
    ) {
      const failedState = {
        ...nextState,
        status: "failed" as const,
        updatedTurnId: turnId,
        updatedAt: createdAt,
      };
      taskEvents.push({
        id: createProgressId("task-event"),
        turnId,
        taskId: task.id,
        owner: task.owner,
        type: "failed",
        before: nextState,
        after: failedState,
        sourceFactEventIds: factEvents.map((event) => event.id),
        sourceStatusEventIds,
        reason: `${task.title} 失败。`,
        createdAt,
      });
      nextState = failedState;
    }

    if (
      nextState.status === "active" &&
      evaluateTavernCondition({ condition: task.lifecycle.completeCondition, ...conditionInput })
    ) {
      const completedState = {
        ...nextState,
        status: "completed" as const,
        progress: nextState.progress
          ? { ...nextState.progress, current: nextState.progress.target }
          : nextState.progress,
        updatedTurnId: turnId,
        updatedAt: createdAt,
      };
      taskEvents.push({
        id: createProgressId("task-event"),
        turnId,
        taskId: task.id,
        owner: task.owner,
        type: "completed",
        before: nextState,
        after: completedState,
        sourceFactEventIds: factEvents.map((event) => event.id),
        sourceStatusEventIds,
        reason: `${task.title} 已完成。`,
        createdAt,
      });
      nextState = completedState;
    }

    nextTaskSnapshot = {
      ...nextTaskSnapshot,
      [task.id]: nextState,
    };
  }

  return {
    taskSnapshot: nextTaskSnapshot,
    taskEvents,
  };
};

export const evaluateTavernSceneOutcomes = ({
  outcomes,
  snapshot,
  previousSnapshot,
  factEvents,
  taskSnapshot,
  sourceTaskEventIds,
  sourceStatusEventIds,
  existingOutcomeEvents,
  turnId,
  createdAt = Date.now(),
}: {
  outcomes: TavernSceneOutcomeDefinition[];
  snapshot: TavernStatusSnapshot;
  previousSnapshot?: TavernStatusSnapshot;
  factEvents: TavernFactEvent[];
  taskSnapshot: Record<string, TavernTaskState>;
  sourceTaskEventIds: string[];
  sourceStatusEventIds: string[];
  existingOutcomeEvents: TavernOutcomeEvent[];
  turnId: string;
  createdAt?: number;
}): TavernOutcomeEvent[] => {
  const firedOutcomeIds = new Set(existingOutcomeEvents.map((event) => event.outcomeId));
  return outcomes
    .filter((outcome) => !outcome.exclusive || !firedOutcomeIds.has(outcome.id))
    .filter((outcome) => evaluateTavernCondition({
      condition: outcome.condition,
      snapshot,
      previousSnapshot,
      factEvents,
      taskSnapshot,
    }))
    .sort((left, right) => right.priority - left.priority)
    .flatMap((outcome): TavernOutcomeEvent[] => [{
      id: createProgressId("outcome-event"),
      turnId,
      outcomeId: outcome.id,
      winners: outcome.winner ?? [],
      losers: outcome.loser ?? [],
      sourceTaskEventIds,
      sourceStatusEventIds,
      status: outcome.endScene === "auto" ? "applied" : "pending",
      createdAt,
    }]);
};

const sortByCreatedAt = <T extends { createdAt: number }>(items: T[]) =>
  [...items].sort((left, right) => left.createdAt - right.createdAt);

export const createTavernProgressCheckpoint = ({
  room,
  turnId = room.statusSnapshot.turnId,
  reason,
  createdAt = Date.now(),
}: {
  room: Pick<
    TavernRoom,
    | "factEvents"
    | "statusEvents"
    | "statusSnapshot"
    | "taskEvents"
    | "taskSnapshot"
    | "outcomeEvents"
  >;
  turnId?: string;
  reason: TavernProgressCheckpoint["reason"];
  createdAt?: number;
}): TavernProgressCheckpoint => ({
  id: createProgressId("progress-checkpoint"),
  turnId,
  statusSnapshot: room.statusSnapshot,
  taskSnapshot: room.taskSnapshot,
  includedFactEventIds: room.factEvents.map((event) => event.id),
  includedStatusEventIds: room.statusEvents.map((event) => event.id),
  includedTaskEventIds: room.taskEvents.map((event) => event.id),
  includedOutcomeEventIds: room.outcomeEvents.map((event) => event.id),
  reason,
  createdAt,
});

const getLatestProgressCheckpoint = (
  checkpoints: TavernProgressCheckpoint[],
  checkpointId?: string,
) => {
  if (checkpointId) {
    return checkpoints.find((checkpoint) => checkpoint.id === checkpointId) ?? null;
  }
  return sortByCreatedAt(checkpoints).at(-1) ?? null;
};

export const rebuildTavernProgressFromHistory = ({
  room,
  checkpointId,
  createdAt = Date.now(),
}: {
  room: TavernRoom;
  checkpointId?: string;
  createdAt?: number;
}): Pick<
  TavernRoom,
  | "previousStatusSnapshot"
  | "statusSnapshot"
  | "taskSnapshot"
> => {
  const checkpoint = getLatestProgressCheckpoint(room.statusCheckpoints, checkpointId);
  const includedStatusEventIds = new Set(checkpoint?.includedStatusEventIds ?? []);
  const includedTaskEventIds = new Set(checkpoint?.includedTaskEventIds ?? []);
  let previousStatusSnapshot = checkpoint?.statusSnapshot ?? createEmptyTavernStatusSnapshot("rebuild-base", createdAt);
  let statusSnapshot = previousStatusSnapshot;

  for (const statusEvent of sortByCreatedAt(
    room.statusEvents.filter((event) => !includedStatusEventIds.has(event.id)),
  )) {
    previousStatusSnapshot = statusSnapshot;
    statusSnapshot = {
      ...applyTavernStatusEventsToSnapshot({
        snapshot: statusSnapshot,
        events: [statusEvent],
      }),
      turnId: statusEvent.turnId,
      updatedAt: statusEvent.createdAt,
    };
  }

  let taskSnapshot = { ...(checkpoint?.taskSnapshot ?? {}) };
  for (const taskEvent of sortByCreatedAt(
    room.taskEvents.filter((event) => !includedTaskEventIds.has(event.id)),
  )) {
    taskSnapshot = {
      ...taskSnapshot,
      [taskEvent.taskId]: taskEvent.after,
    };
  }

  return {
    previousStatusSnapshot,
    statusSnapshot: {
      ...statusSnapshot,
      updatedAt: createdAt,
    },
    taskSnapshot,
  };
};

export const advanceTavernProgressFromFactEvents = ({
  room,
  factEvents,
  turnId,
  createdAt = Date.now(),
}: {
  room: TavernRoom;
  factEvents: TavernFactEvent[];
  turnId: string;
  createdAt?: number;
}): Pick<
  TavernRoom,
  | "factEvents"
  | "statusEvents"
  | "previousStatusSnapshot"
  | "statusSnapshot"
  | "taskEvents"
  | "taskSnapshot"
  | "outcomeEvents"
> => {
  const previousStatusSnapshot = room.statusSnapshot;
  const derivedStatusEvents = deriveTavernStatusEventsFromFacts({
    factEvents,
    rules: room.statusRules,
    definitions: room.statusDefinitions,
    snapshot: previousStatusSnapshot,
    turnId,
    createdAt,
  });
  const statusEvents = room.progressTracker.applyMode === "auto"
    ? derivedStatusEvents.map((event) => (
        event.status === "pending" ? { ...event, status: "applied" as const } : event
      ))
    : derivedStatusEvents;
  const statusSnapshot = {
    ...applyTavernStatusEventsToSnapshot({
      snapshot: previousStatusSnapshot,
      events: statusEvents,
    }),
    turnId,
    updatedAt: createdAt,
  };
  const taskResult = updateTavernTasks({
    taskDefinitions: room.taskDefinitions,
    taskSnapshot: room.taskSnapshot,
    snapshot: statusSnapshot,
    previousSnapshot: previousStatusSnapshot,
    factEvents,
    sourceStatusEventIds: statusEvents.map((event) => event.id),
    turnId,
    createdAt,
  });
  const outcomeEvents = evaluateTavernSceneOutcomes({
    outcomes: room.sceneOutcomes,
    snapshot: statusSnapshot,
    previousSnapshot: previousStatusSnapshot,
    factEvents,
    taskSnapshot: taskResult.taskSnapshot,
    sourceTaskEventIds: taskResult.taskEvents.map((event) => event.id),
    sourceStatusEventIds: statusEvents.map((event) => event.id),
    existingOutcomeEvents: room.outcomeEvents,
    turnId,
    createdAt,
  });

  return {
    factEvents: [...room.factEvents, ...factEvents],
    statusEvents: [...room.statusEvents, ...statusEvents],
    previousStatusSnapshot,
    statusSnapshot,
    taskEvents: [...room.taskEvents, ...taskResult.taskEvents],
    taskSnapshot: taskResult.taskSnapshot,
    outcomeEvents: [...room.outcomeEvents, ...outcomeEvents],
  };
};
