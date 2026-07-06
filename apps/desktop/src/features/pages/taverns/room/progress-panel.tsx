import { Activity, CheckCircle2, Circle, Heart, Swords, Trophy } from "lucide-react";
import { resolveAvatar } from "@/assets/avatars";
import { cn } from "@/lib/utils";
import {
  getTavernStatusSnapshotValue,
  isTavernProgressVisibilityVisibleToUser,
} from "@/features/pages/taverns/tavern/core";
import type {
  TavernCharacter,
  TavernEntityRef,
  TavernProgressView,
  TavernRoom,
  TavernStatusDefinition,
  TavernStatusTargetRef,
  TavernStatusValue,
} from "@/features/pages/taverns/manage/model";
import type { VisualPresetDefinition } from "@/features/pages/taverns/tavern/visual-presets";
import { useTavernRoomContext } from "@/features/pages/taverns/room/context";

type ProgressPanelProps = {
  placement: TavernProgressView["placement"];
  ownerCharacter?: TavernCharacter;
  className?: string;
};

type ResolvedStatusTarget = {
  key: string;
  label: string;
  target: TavernStatusTargetRef;
  character?: TavernCharacter;
};

type ResolvedStatusItem = {
  key: string;
  definition: TavernStatusDefinition;
  item: Extract<TavernProgressView["items"][number], { type: "status" }>;
  target: ResolvedStatusTarget;
  value: TavernStatusValue;
  delta: number;
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
  const tone = item.thresholds?.find(
    (threshold) =>
      (typeof threshold.lte !== "number" || value <= threshold.lte) &&
      (typeof threshold.gte !== "number" || value >= threshold.gte),
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

const taskStatusLabel = (status: string) => {
  switch (status) {
    case "inactive":
      return "未激活";
    case "active":
      return "进行中";
    case "completed":
      return "完成";
    case "failed":
      return "失败";
    default:
      return status;
  }
};

const outcomeStatusLabel = (status: string) => {
  switch (status) {
    case "pending":
      return "待确认";
    case "applied":
      return "已触发";
    case "dismissed":
      return "已忽略";
    default:
      return status;
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
    return [
      {
        key: `scene:${activeRoom.activeSceneId ?? "current"}`,
        label: "场景",
        target: { type: "scene", sceneId: activeRoom.activeSceneId },
      },
    ];
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
      character,
    }));
  }
  if (definition.scope === "relationship") {
    if (
      view.ownerBinding === "allCharactersToUser" ||
      (view.ownerBinding === "activeCharacterToUser" && view.placement === "composerBelow")
    ) {
      return roomCharacters.map((character) => ({
        key: `relationship:${character.id}->user`,
        label: `${character.name} 对你`,
        character,
        target: {
          type: "relationship",
          subject: characterRef(character),
          object: userRef,
        },
      }));
    }
    if (view.ownerBinding === "activeCharacterToUser" && activeCharacter) {
      return [
        {
          key: `relationship:${activeCharacter.id}->user`,
          label: `${activeCharacter.name} 对你`,
          character: activeCharacter,
          target: {
            type: "relationship",
            subject: characterRef(activeCharacter),
            object: userRef,
          },
        },
      ];
    }
    if (view.ownerBinding === "activeCharacterOutgoing" && activeCharacter) {
      return roomCharacters
        .filter((character) => character.id !== activeCharacter.id)
        .map((character) => ({
          key: `relationship:${activeCharacter.id}->${character.id}`,
          label: `${activeCharacter.name} 对 ${character.name}`,
          character: activeCharacter,
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
        character,
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
            character: subject,
            target: {
              type: "relationship",
              subject: characterRef(subject),
              object: characterRef(object),
            },
          })),
      );
    }
    if (ownerCharacter) {
      return [
        {
          key: `relationship:${ownerCharacter.id}->user`,
          label: `${ownerCharacter.name} 对你`,
          character: ownerCharacter,
          target: {
            type: "relationship",
            subject: characterRef(ownerCharacter),
            object: userRef,
          },
        },
      ];
    }
  }
  return [];
};

const TaskBadge = ({ title, status }: { title: string; status: string }) => {
  const done = status === "completed";
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-md bg-current/5 px-2.5 py-2 text-xs">
      {done ? (
        <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
      ) : (
        <Circle className="size-3.5 shrink-0 opacity-55" />
      )}
      <span className="min-w-0 flex-1 truncate">{title}</span>
      <span className="shrink-0 opacity-65">{taskStatusLabel(status)}</span>
    </div>
  );
};

const StatusMetric = ({ item }: { item: ResolvedStatusItem }) => {
  const showMeter = item.item.display === "bar" || item.item.display === "meter";
  return (
    <div className="min-w-0 flex-1 space-y-1.5">
      <div className="flex min-w-0 items-center justify-between gap-2 text-xs">
        <span className="min-w-0 truncate opacity-75">{item.definition.label}</span>
        <span className="shrink-0 tabular-nums opacity-80">
          {formatStatusValue(item.value)}
          {item.item.showDelta && item.delta !== 0 && (
            <span className={cn("ml-1", item.delta > 0 ? "text-emerald-500" : "text-destructive")}>
              {item.delta > 0 ? "+" : ""}
              {item.delta}
            </span>
          )}
        </span>
      </div>
      {showMeter && (
        <div className="h-1.5 overflow-hidden rounded-full bg-current/10">
          <div
            className={cn("h-full rounded-full", toneClass(item.value, item.item))}
            style={{ width: `${numericPercent(item.value, item.definition)}%` }}
          />
        </div>
      )}
    </div>
  );
};

const compactRelationshipLabel = (label: string) => label.replace(/\s*对你$/, "");

const isFavorabilityMetric = (metric: ResolvedStatusItem) =>
  metric.definition.id === "favorability" || /好感/.test(metric.definition.label);

const isHostilityMetric = (metric: ResolvedStatusItem) =>
  metric.definition.id === "hostility" || /敌对|仇恨|威胁/.test(metric.definition.label);

const numericMetricValue = (metric: ResolvedStatusItem) => (typeof metric.value === "number" ? metric.value : null);

const isRelationshipCardDanger = (metrics: ResolvedStatusItem[]) =>
  metrics.some((metric) => {
    const value = numericMetricValue(metric);
    if (value === null) {
      return false;
    }
    if (isFavorabilityMetric(metric)) {
      return value < 0;
    }
    if (isHostilityMetric(metric)) {
      return value > 0;
    }
    return false;
  });

const RelationshipCompactCard = ({
  label,
  character,
  metrics,
  visualPreset,
}: {
  label: string;
  character?: TavernCharacter;
  metrics: ResolvedStatusItem[];
  visualPreset: VisualPresetDefinition;
}) => {
  const danger = isRelationshipCardDanger(metrics);
  const avatar = character ? resolveAvatar(character.avatar).src : null;
  const displayLabel = character?.name ?? compactRelationshipLabel(label).replace(/^你对\s*/, "");
  return (
    <div
      className={cn(
        visualPreset.tavern.sceneCard,
        "relative flex h-[34px] shrink-0 items-center overflow-hidden rounded-lg px-1.5 text-[11px] leading-none",
        danger && "border-destructive/20 bg-destructive/5 dark:border-destructive/24 dark:bg-destructive/8",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          danger ? "text-destructive" : visualPreset.tavern.sceneBadge,
          "pointer-events-none absolute inset-0 rounded-[inherit] bg-current/[0.12] ring-0",
        )}
        style={{
          backgroundColor: danger
            ? "color-mix(in srgb, currentColor 7%, transparent)"
            : "color-mix(in srgb, currentColor 14%, transparent)",
        }}
      />
      <div className="relative z-10 mr-1.5 size-6 shrink-0 overflow-hidden rounded-full border border-current/10 bg-muted">
        {avatar ? (
          <img src={avatar} alt="" className="size-full object-cover" draggable={false} />
        ) : (
          <div className="size-full bg-primary/10" />
        )}
      </div>
      <span className="relative z-10 max-w-20 truncate pr-1.5 text-[12px] font-semibold">{displayLabel}</span>
      <div className="relative z-10 h-4 w-px shrink-0 bg-current/10" />
      <div className="relative z-10 flex items-center">
        {metrics.map((metric) => {
          const isHostility = isHostilityMetric(metric);
          const isFavorability = isFavorabilityMetric(metric);
          const value = numericMetricValue(metric);
          const Icon = isHostility ? Swords : Heart;
          return (
            <div key={metric.key} className="flex items-center">
              <span
                className="inline-flex min-w-0 items-center gap-1 px-1.5 text-current/70"
                title={`${metric.definition.label} ${formatStatusValue(metric.value)}`}
              >
                <span
                  className={cn(
                    visualPreset.tavern.sceneBadge,
                    "inline-flex size-3 shrink-0 items-center justify-center bg-transparent p-0 ring-0 shadow-none",
                    isFavorability && (value ?? 0) < 0
                      ? "text-destructive/75"
                      : isHostility && (value ?? 0) > 0
                        ? "text-destructive/75"
                        : undefined,
                  )}
                >
                  <Icon className="size-3" fill="currentColor" strokeWidth={isHostility ? 2.7 : 0} />
                </span>
                <span className="whitespace-nowrap tabular-nums font-medium text-current">
                  {formatStatusValue(metric.value)}
                  {metric.item.showDelta && metric.delta !== 0 && (
                    <span
                      className={cn("ml-1 tabular-nums", metric.delta > 0 ? "text-emerald-500" : "text-destructive")}
                    >
                      {metric.delta > 0 ? "+" : ""}
                      {metric.delta}
                    </span>
                  )}
                </span>
              </span>
              {metric !== metrics[metrics.length - 1] && <div className="h-4 w-px shrink-0 bg-current/10" />}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const isGroupedRelationshipView = (view: TavernProgressView) =>
  view.kind === "status" &&
  view.items.some((item) => item.type === "status") &&
  (view.ownerBinding === "allCharactersToUser" ||
    view.ownerBinding === "activeCharacterToUser" ||
    view.ownerBinding === "currentUser");

const createGroupedRelationshipRows = ({
  view,
  activeRoom,
  roomCharacters,
  activeCharacter,
  ownerCharacter,
  definitionById,
  visualPreset,
}: {
  view: TavernProgressView;
  activeRoom: TavernRoom;
  roomCharacters: TavernCharacter[];
  activeCharacter: TavernCharacter | null;
  ownerCharacter?: TavernCharacter;
  definitionById: Map<string, TavernStatusDefinition>;
  visualPreset: VisualPresetDefinition;
}) => {
  const grouped = new Map<
    string,
    {
      label: string;
      character?: TavernCharacter;
      metrics: ResolvedStatusItem[];
    }
  >();

  for (const item of view.items) {
    if (item.type !== "status") {
      continue;
    }

    const definition = definitionById.get(item.statusId);
    if (
      !definition ||
      definition.scope !== "relationship" ||
      !isTavernProgressVisibilityVisibleToUser(definition.visibility)
    ) {
      continue;
    }

    const targets = resolveStatusTargets({
      view,
      definition,
      activeRoom,
      roomCharacters,
      activeCharacter,
      ownerCharacter,
    });
    for (const target of targets) {
      const current = getTavernStatusSnapshotValue(activeRoom.statusSnapshot, target.target, definition.id);
      const previous = activeRoom.previousStatusSnapshot
        ? getTavernStatusSnapshotValue(activeRoom.previousStatusSnapshot, target.target, definition.id)
        : null;
      const value = current ?? definition.defaultValue;
      if (item.hiddenWhenDefault && valueEquals(value, definition.defaultValue)) {
        continue;
      }

      const delta = typeof value === "number" && typeof previous === "number" ? value - previous : 0;
      const group = grouped.get(target.key) ?? {
        label: target.label,
        character: target.character,
        metrics: [],
      };
      if (!group.character && target.character) {
        group.character = target.character;
      }
      group.metrics.push({
        key: `${view.id}:${definition.id}:${statusTargetKey(target.target)}`,
        definition,
        item,
        target,
        value,
        delta,
      });
      grouped.set(target.key, group);
    }
  }

  const groups = Array.from(grouped.entries()).filter(([, group]) => group.metrics.length > 0);
  if (view.placement === "composerBelow") {
    if (groups.length === 0) {
      return [];
    }
    return [
      {
        key: `${view.id}:relationship-compact-strip`,
        content: (
          <div className="min-w-0 overflow-x-auto pb-0.5">
            <div className="flex min-w-max gap-2 pr-1">
              {groups.map(([key, group]) => (
                <RelationshipCompactCard
                  key={key}
                  label={group.label}
                  character={group.character}
                  metrics={group.metrics}
                  visualPreset={visualPreset}
                />
              ))}
            </div>
          </div>
        ),
      },
    ];
  }

  return groups
    .map(([key, group]) => {
      return [
        {
          key: `${view.id}:relationship-group:${key}`,
          content: (
            <div className="rounded-md bg-current/5 px-2.5 py-2 text-current">
              <div className="mb-2 truncate text-xs font-medium">{group.label}</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {group.metrics.map((metric) => (
                  <StatusMetric key={metric.key} item={metric} />
                ))}
              </div>
            </div>
          ),
        },
      ];
    })
    .flat();
};

export const ProgressPanel = ({ placement, ownerCharacter, className }: ProgressPanelProps) => {
  const { activeRoom, roomCharacters, activeCharacter, visualPreset } = useTavernRoomContext();
  if (!activeRoom) {
    return null;
  }

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
    const groupedRelationshipRows = isGroupedRelationshipView(view)
      ? createGroupedRelationshipRows({
          view,
          activeRoom,
          roomCharacters,
          activeCharacter,
          ownerCharacter,
          definitionById,
          visualPreset,
        })
      : [];
    const explicitRows =
      groupedRelationshipRows.length > 0
        ? []
        : view.items.flatMap((item) => {
            if (item.type === "status") {
              const definition = definitionById.get(item.statusId);
              if (!definition || !isTavernProgressVisibilityVisibleToUser(definition.visibility)) {
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
                  ? getTavernStatusSnapshotValue(
                      activeRoom.previousStatusSnapshot,
                      resolvedTarget.target,
                      definition.id,
                    )
                  : null;
                const value = current ?? definition.defaultValue;
                if (item.hiddenWhenDefault && valueEquals(value, definition.defaultValue)) {
                  return [];
                }
                const delta = typeof value === "number" && typeof previous === "number" ? value - previous : 0;
                const showMeter = item.display === "bar" || item.display === "meter";
                const label =
                  resolvedTarget.label === "场景" || resolvedTarget.label === "全局"
                    ? definition.label
                    : `${resolvedTarget.label} · ${definition.label}`;
                return [
                  {
                    key: `${view.id}:${definition.id}:${statusTargetKey(resolvedTarget.target)}`,
                    content: (
                      <div className="space-y-1.5 rounded-md bg-current/5 px-2.5 py-2 text-current">
                        <div className="flex min-w-0 items-center justify-between gap-2 text-xs">
                          <span className="min-w-0 truncate font-medium">{label}</span>
                          <span className="shrink-0 tabular-nums opacity-75">
                            {formatStatusValue(value)}
                            {item.showDelta && delta !== 0 && (
                              <span className={cn("ml-1", delta > 0 ? "text-emerald-500" : "text-destructive")}>
                                {delta > 0 ? "+" : ""}
                                {delta}
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
                  },
                ];
              });
            }
            if (item.type === "task") {
              const task = taskById.get(item.taskId);
              if (!task || !isTavernProgressVisibilityVisibleToUser(task.visibility)) {
                return [];
              }
              const state = activeRoom.taskSnapshot[item.taskId];
              const status = state?.status ?? task.lifecycle.initialStatus;
              if (status === "inactive") {
                return [];
              }
              return [
                {
                  key: `${view.id}:task:${item.taskId}`,
                  content: <TaskBadge title={task.title} status={status} />,
                },
              ];
            }
            const outcome = outcomeById.get(item.outcomeId);
            const event = activeRoom.outcomeEvents.find(
              (candidate) => candidate.outcomeId === item.outcomeId && candidate.status !== "dismissed",
            );
            if (!outcome || !event || !isTavernProgressVisibilityVisibleToUser(outcome.visibility)) {
              return [];
            }
            return [
              {
                key: `${view.id}:outcome:${item.outcomeId}`,
                content: (
                  <div className="flex min-w-0 items-center gap-2 rounded-md bg-current/5 px-2.5 py-2 text-xs">
                    <Trophy className="size-3.5 shrink-0 text-amber-500" />
                    <span className="min-w-0 flex-1 truncate">{outcome.label}</span>
                    <span className="shrink-0 opacity-65">{outcomeStatusLabel(event.status)}</span>
                  </div>
                ),
              },
            ];
          });
    const dynamicTaskRows =
      view.items.length === 0 && (view.kind === "task" || view.kind === "mixed")
        ? activeRoom.taskDefinitions.flatMap((task) => {
            if (!isTavernProgressVisibilityVisibleToUser(task.visibility)) {
              return [];
            }
            const state = activeRoom.taskSnapshot[task.id];
            const status = state?.status ?? task.lifecycle.initialStatus;
            if (status === "inactive") {
              return [];
            }
            return [
              {
                key: `${view.id}:dynamic-task:${task.id}`,
                content: <TaskBadge title={task.title} status={status} />,
              },
            ];
          })
        : [];
    const dynamicOutcomeRows =
      view.items.length === 0 && (view.kind === "outcome" || view.kind === "mixed")
        ? activeRoom.outcomeEvents.flatMap((event) => {
            if (event.status === "dismissed") {
              return [];
            }
            const outcome = outcomeById.get(event.outcomeId);
            if (!outcome || !isTavernProgressVisibilityVisibleToUser(outcome.visibility)) {
              return [];
            }
            return [
              {
                key: `${view.id}:dynamic-outcome:${event.outcomeId}:${event.id}`,
                content: (
                  <div className="flex min-w-0 items-center gap-2 rounded-md bg-current/5 px-2.5 py-2 text-xs">
                    <Trophy className="size-3.5 shrink-0 text-amber-500" />
                    <span className="min-w-0 flex-1 truncate">{outcome.label}</span>
                    <span className="shrink-0 opacity-65">{outcomeStatusLabel(event.status)}</span>
                  </div>
                ),
              },
            ];
          })
        : [];
    const rows = [...groupedRelationshipRows, ...explicitRows, ...dynamicTaskRows, ...dynamicOutcomeRows];

    if (rows.length === 0) {
      return [];
    }

    return [
      {
        id: view.id,
        label: view.label,
        layout: view.layout,
        hideLabel: placement === "composerBelow" && groupedRelationshipRows.length > 0,
        rows,
      },
    ];
  });

  if (renderedViews.length === 0) {
    return null;
  }

  return (
    <div className={cn("space-y-3 text-current", className)}>
      {renderedViews.map((view) => (
        <section key={view.id} className="space-y-2">
          {!view.hideLabel && (
            <div className="flex items-center gap-2 text-xs font-semibold opacity-80">
              <Activity className="size-3.5 text-primary" />
              {view.label}
            </div>
          )}
          <div
            className={cn(
              view.layout === "grid" || view.layout === "matrix"
                ? "grid grid-cols-1 gap-2 sm:grid-cols-2"
                : "space-y-2",
            )}
          >
            {view.rows.map((row) => (
              <div key={row.key}>{row.content}</div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};
