import { Activity, CheckCircle2, Circle, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getTavernStatusSnapshotValue,
} from "../core";
import type {
  TavernCharacter,
  TavernEntityRef,
  TavernProgressView,
  TavernRoom,
  TavernStatusDefinition,
  TavernStatusTargetRef,
  TavernStatusValue,
} from "../types";

type TavernProgressPanelProps = {
  activeRoom: TavernRoom;
  roomCharacters: TavernCharacter[];
  activeCharacter: TavernCharacter | null;
  placement: TavernProgressView["placement"];
  ownerCharacter?: TavernCharacter;
  className?: string;
};

type ResolvedStatusTarget = {
  key: string;
  label: string;
  target: TavernStatusTargetRef;
};

const userRef: TavernEntityRef = { type: "user", userId: "user" };

const valueEquals = (left: TavernStatusValue, right: TavernStatusValue) =>
  Array.isArray(left) || Array.isArray(right)
    ? JSON.stringify(left ?? null) === JSON.stringify(right ?? null)
    : left === right;

const formatStatusValue = (value: TavernStatusValue) => {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join("、") : "无";
  }
  if (typeof value === "boolean") {
    return value ? "是" : "否";
  }
  if (value === null || value === "") {
    return "未记录";
  }
  return String(value);
};

const numericPercent = (value: TavernStatusValue, definition: TavernStatusDefinition) => {
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

const toneClass = (
  value: TavernStatusValue,
  item: Extract<TavernProgressView["items"][number], { type: "status" }>,
) => {
  if (typeof value !== "number") {
    return "bg-primary";
  }
  const tone = item.thresholds?.find((threshold) =>
    (typeof threshold.lte !== "number" || value <= threshold.lte) &&
    (typeof threshold.gte !== "number" || value >= threshold.gte)
  )?.tone;
  switch (tone) {
    case "danger":
      return "bg-destructive";
    case "warning":
      return "bg-amber-500";
    case "success":
      return "bg-emerald-500";
    case "info":
      return "bg-sky-500";
    default:
      return "bg-primary";
  }
};

const characterRef = (character: TavernCharacter): TavernEntityRef => ({
  type: "character",
  characterId: character.id,
});

const statusTargetKey = (target: TavernStatusTargetRef) => {
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
      return `relationship:${JSON.stringify(target.subject)}->${JSON.stringify(target.object)}`;
  }
};

const resolveStatusTargets = ({
  view,
  definition,
  activeRoom,
  roomCharacters,
  activeCharacter,
  ownerCharacter,
}: {
  view: TavernProgressView;
  definition: TavernStatusDefinition;
  activeRoom: TavernRoom;
  roomCharacters: TavernCharacter[];
  activeCharacter: TavernCharacter | null;
  ownerCharacter?: TavernCharacter;
}): ResolvedStatusTarget[] => {
  if (definition.scope === "global") {
    return [{ key: "global", label: "全局", target: { type: "global" } }];
  }
  if (definition.scope === "scene") {
    return [{
      key: `scene:${activeRoom.activeSceneId ?? "current"}`,
      label: "场景",
      target: { type: "scene", sceneId: activeRoom.activeSceneId },
    }];
  }
  if (definition.scope === "party" && view.ownerBinding === "party") {
    return [{ key: "party:main", label: "队伍", target: { type: "party", partyId: "main" } }];
  }
  if (definition.scope === "character") {
    const characters = ownerCharacter
      ? [ownerCharacter]
      : view.ownerBinding === "allCharacters"
      ? roomCharacters
      : activeCharacter
      ? [activeCharacter]
      : [];
    return characters.map((character) => ({
      key: `character:${character.id}`,
      label: character.name,
      target: { type: "character", characterId: character.id },
    }));
  }
  if (definition.scope === "relationship") {
    if (view.ownerBinding === "activeCharacterToUser" && activeCharacter) {
      return [{
        key: `relationship:${activeCharacter.id}->user`,
        label: `${activeCharacter.name} 对你`,
        target: {
          type: "relationship",
          subject: characterRef(activeCharacter),
          object: userRef,
        },
      }];
    }
    if (view.ownerBinding === "activeCharacterOutgoing" && activeCharacter) {
      return roomCharacters
        .filter((character) => character.id !== activeCharacter.id)
        .map((character) => ({
          key: `relationship:${activeCharacter.id}->${character.id}`,
          label: `${activeCharacter.name} 对 ${character.name}`,
          target: {
            type: "relationship",
            subject: characterRef(activeCharacter),
            object: characterRef(character),
          },
        }));
    }
    if (view.ownerBinding === "currentUser") {
      return roomCharacters.map((character) => ({
        key: `relationship:user->${character.id}`,
        label: `你对 ${character.name}`,
        target: {
          type: "relationship",
          subject: userRef,
          object: characterRef(character),
        },
      }));
    }
    if (view.ownerBinding === "allCharacterPairs") {
      return roomCharacters.flatMap((subject) =>
        roomCharacters
          .filter((object) => object.id !== subject.id)
          .map((object) => ({
            key: `relationship:${subject.id}->${object.id}`,
            label: `${subject.name} 对 ${object.name}`,
            target: {
              type: "relationship",
              subject: characterRef(subject),
              object: characterRef(object),
            },
          }))
      );
    }
    if (ownerCharacter) {
      return [{
        key: `relationship:${ownerCharacter.id}->user`,
        label: `${ownerCharacter.name} 对你`,
        target: {
          type: "relationship",
          subject: characterRef(ownerCharacter),
          object: userRef,
        },
      }];
    }
  }
  return [];
};

const TaskBadge = ({
  title,
  status,
}: {
  title: string;
  status: string;
}) => {
  const done = status === "completed";
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-md bg-current/5 px-2.5 py-2 text-xs">
      {done ? (
        <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
      ) : (
        <Circle className="size-3.5 shrink-0 opacity-55" />
      )}
      <span className="min-w-0 flex-1 truncate">{title}</span>
      <span className="shrink-0 opacity-65">{status}</span>
    </div>
  );
};

export const TavernProgressPanel = ({
  activeRoom,
  roomCharacters,
  activeCharacter,
  placement,
  ownerCharacter,
  className,
}: TavernProgressPanelProps) => {
  if (!activeRoom.settings.statusTracking.enabled || !activeRoom.settings.statusTracking.visibleToUser) {
    return null;
  }

  const views = activeRoom.progressViews.filter((view) => view.placement === placement);
  if (views.length === 0) {
    return null;
  }

  const definitionById = new Map(activeRoom.statusDefinitions.map((definition) => [definition.id, definition]));
  const taskById = new Map(activeRoom.taskDefinitions.map((task) => [task.id, task]));
  const outcomeById = new Map(activeRoom.sceneOutcomes.map((outcome) => [outcome.id, outcome]));
  const renderedViews = views.flatMap((view) => {
    const rows = view.items.flatMap((item) => {
      if (item.type === "status") {
        const definition = definitionById.get(item.statusId);
        if (!definition) {
          return [];
        }
        return resolveStatusTargets({
          view,
          definition,
          activeRoom,
          roomCharacters,
          activeCharacter,
          ownerCharacter,
        }).flatMap((resolvedTarget) => {
          const current = getTavernStatusSnapshotValue(
            activeRoom.statusSnapshot,
            resolvedTarget.target,
            definition.id,
          );
          const previous = activeRoom.previousStatusSnapshot
            ? getTavernStatusSnapshotValue(activeRoom.previousStatusSnapshot, resolvedTarget.target, definition.id)
            : null;
          const value = current ?? definition.defaultValue;
          if (item.hiddenWhenDefault && valueEquals(value, definition.defaultValue)) {
            return [];
          }
          const delta = typeof value === "number" && typeof previous === "number"
            ? value - previous
            : 0;
          const showMeter = item.display === "bar" || item.display === "meter";
          const label = resolvedTarget.label === "场景" || resolvedTarget.label === "全局"
            ? definition.label
            : `${resolvedTarget.label} · ${definition.label}`;
          return [{
            key: `${view.id}:${definition.id}:${statusTargetKey(resolvedTarget.target)}`,
            content: (
              <div className="space-y-1.5 rounded-md bg-current/5 px-2.5 py-2 text-current">
                <div className="flex min-w-0 items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate font-medium">{label}</span>
                  <span className="shrink-0 tabular-nums opacity-75">
                    {formatStatusValue(value)}
                    {item.showDelta && delta !== 0 && (
                      <span className={cn("ml-1", delta > 0 ? "text-emerald-500" : "text-destructive")}>
                        {delta > 0 ? "+" : ""}{delta}
                      </span>
                    )}
                  </span>
                </div>
                {showMeter && (
                  <div className="h-1.5 overflow-hidden rounded-full bg-current/10">
                    <div
                      className={cn("h-full rounded-full", toneClass(value, item))}
                      style={{ width: `${numericPercent(value, definition)}%` }}
                    />
                  </div>
                )}
              </div>
            ),
          }];
        });
      }
      if (item.type === "task") {
        const task = taskById.get(item.taskId);
        const state = activeRoom.taskSnapshot[item.taskId];
        if (!task || !state) {
          return [];
        }
        return [{
          key: `${view.id}:task:${item.taskId}`,
          content: <TaskBadge title={task.title} status={state.status} />,
        }];
      }
      const outcome = outcomeById.get(item.outcomeId);
      const event = activeRoom.outcomeEvents.find((candidate) =>
        candidate.outcomeId === item.outcomeId && candidate.status !== "dismissed"
      );
      if (!outcome || !event) {
        return [];
      }
      return [{
        key: `${view.id}:outcome:${item.outcomeId}`,
        content: (
          <div className="flex min-w-0 items-center gap-2 rounded-md bg-current/5 px-2.5 py-2 text-xs">
            <Trophy className="size-3.5 shrink-0 text-amber-500" />
            <span className="min-w-0 flex-1 truncate">{outcome.label}</span>
            <span className="shrink-0 opacity-65">{event.status}</span>
          </div>
        ),
      }];
    });

    if (rows.length === 0) {
      return [];
    }

    return [{
      id: view.id,
      label: view.label,
      layout: view.layout,
      rows,
    }];
  });

  if (renderedViews.length === 0) {
    return null;
  }

  return (
    <div className={cn("space-y-3 text-current", className)}>
      {renderedViews.map((view) => (
        <section key={view.id} className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold opacity-80">
            <Activity className="size-3.5 text-primary" />
            {view.label}
          </div>
          <div className={cn(
            view.layout === "grid" || view.layout === "matrix"
              ? "grid grid-cols-1 gap-2 sm:grid-cols-2"
              : "space-y-2",
          )}>
            {view.rows.map((row) => (
              <div key={row.key}>{row.content}</div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};
