import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  projectTavernSceneOntoRoom,
  syncTavernRoomActiveScene,
} from "@/features/pages/taverns/tavern/runtime/active-scene-runtime";
import {
  isTavernProgressVisibilityVisibleToUser,
  resolveTavernPendingOutcomeEvent,
} from "@/features/pages/taverns/tavern/core";
import { useTavernPageContext } from "@/features/pages/taverns/components/context";
import {
  formatConditionSummary,
  formatEntityRef,
  outcomeEndSceneLabels,
  outcomeStatusLabels,
  taskScopeLabels,
  taskStatusLabels,
} from "../helpers";
import {
  EmptyDetailState,
  PlotDataSheet,
  type PlotDataDialogProps,
} from "./shared";

export const TasksOutcomesDialog = ({ bind, isBusy }: PlotDataDialogProps) => {
  const {
    activeRoom,
    roomCharacters,
    patchRoom,
    reportError,
    appendProgressCheckpointToRoom,
  } = useTavernPageContext();
  const characterNameById = new Map(roomCharacters.map((character) => [character.id, character.name]));
  const visibleTaskDefinitions = activeRoom?.taskDefinitions.filter((task) =>
    isTavernProgressVisibilityVisibleToUser(task.visibility)
  ) ?? [];
  const visibleSceneOutcomes = activeRoom?.sceneOutcomes.filter((outcome) =>
    isTavernProgressVisibilityVisibleToUser(outcome.visibility)
  ) ?? [];
  const recentTaskEvents = activeRoom?.taskEvents
    .filter((event) => {
      const task = activeRoom.taskDefinitions.find((definition) => definition.id === event.taskId);
      return task ? isTavernProgressVisibilityVisibleToUser(task.visibility) : true;
    })
    .slice(-8)
    .reverse() ?? [];

  const resolvePendingOutcome = (
    outcomeEventId: string,
    resolution: "applied" | "dismissed",
  ) => {
    if (!activeRoom) {
      return;
    }
    const progressPatch = resolveTavernPendingOutcomeEvent({
      room: activeRoom,
      outcomeEventId,
      resolution,
    });
    if (!progressPatch) {
      reportError("未找到可处理的待确认结局事件。");
      return;
    }

    const progressedRoom = appendProgressCheckpointToRoom(
      syncTavernRoomActiveScene({
        ...projectTavernSceneOntoRoom(activeRoom),
        ...progressPatch,
        updatedAt: Date.now(),
      }),
      "manual",
      activeRoom.statusSnapshot.turnId,
    );
    patchRoom(activeRoom.id, {
      ...progressPatch,
      statusCheckpoints: progressedRoom.statusCheckpoints,
    });
    toast.success(resolution === "applied" ? "结局已应用，复盘视角可用。" : "结局已忽略。");
  };

  return (
    <PlotDataSheet
      bind={bind}
      title="任务与结局"
      description="查看个人、团队、全局任务与场景胜负条件。"
    >
      <div className="space-y-5">
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-medium">任务</div>
            <span className="rounded-md bg-current/10 px-2 py-0.5 text-[11px] text-current/70">
              {visibleTaskDefinitions.length} 个
            </span>
          </div>
          {visibleTaskDefinitions.length > 0 ? (
            <div className="space-y-3">
              {visibleTaskDefinitions.map((task) => {
                const state = activeRoom?.taskSnapshot[task.id];
                const status = state?.status ?? task.lifecycle.initialStatus;
                const progressText = state?.progress
                  ? `${state.progress.current}/${state.progress.target}`
                  : task.progress?.target
                  ? `0/${task.progress.target}`
                  : "";
                return (
                  <div key={task.id} className="rounded-md border bg-current/[0.065] dark:bg-current/[0.09] p-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium">{task.title}</span>
                      <span className="rounded-md bg-current/10 px-1.5 py-0.5 text-[11px] text-current/70">
                        {taskScopeLabels[task.scope]}
                      </span>
                      <span className="rounded-md bg-current/10 px-1.5 py-0.5 text-[11px] text-current/70">
                        {taskStatusLabels[status]}
                      </span>
                      {task.required && (
                        <span className="rounded-md bg-current/10 px-1.5 py-0.5 text-[11px] text-current/70">
                          必做
                        </span>
                      )}
                      {task.optional && (
                        <span className="rounded-md bg-current/10 px-1.5 py-0.5 text-[11px] text-current/70">
                          支线
                        </span>
                      )}
                    </div>
                    {task.description?.trim() && (
                      <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-current/70">
                        {task.description}
                      </div>
                    )}
                    <div className="mt-2 grid gap-1.5 text-xs text-current/70">
                      {progressText && <div>进度：{progressText}</div>}
                      <div>
                        负责人：{formatEntityRef(task.owner, characterNameById)}
                      </div>
                      {task.participants?.length ? (
                        <div>
                          参与者：{task.participants.map((entity) =>
                            formatEntityRef(entity, characterNameById)
                          ).join("、")}
                        </div>
                      ) : null}
                      <div>开始：{formatConditionSummary(task.lifecycle.startCondition, characterNameById)}</div>
                      <div>完成：{formatConditionSummary(task.lifecycle.completeCondition, characterNameById)}</div>
                      <div>失败：{formatConditionSummary(task.lifecycle.failCondition, characterNameById)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyDetailState>暂无可见任务。</EmptyDetailState>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-medium">结局条件</div>
            <span className="rounded-md bg-current/10 px-2 py-0.5 text-[11px] text-current/70">
              {visibleSceneOutcomes.length} 个
            </span>
          </div>
          {visibleSceneOutcomes.length > 0 ? (
            <div className="space-y-3">
              {visibleSceneOutcomes.map((outcome) => {
                const event = activeRoom?.outcomeEvents.find((candidate) =>
                  candidate.outcomeId === outcome.id && candidate.status !== "dismissed"
                );
                return (
                  <div key={outcome.id} className="space-y-3 rounded-md border bg-current/[0.065] dark:bg-current/[0.09] p-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium">{outcome.label}</span>
                      <span className="rounded-md bg-current/10 px-1.5 py-0.5 text-[11px] text-current/70">
                        {outcomeEndSceneLabels[outcome.endScene]}
                      </span>
                      <span className="rounded-md bg-current/10 px-1.5 py-0.5 text-[11px] text-current/70">
                        优先级 {outcome.priority}
                      </span>
                      {event && (
                        <span className="rounded-md bg-current/10 px-1.5 py-0.5 text-[11px] text-current/70">
                          {outcomeStatusLabels[event.status]}
                        </span>
                      )}
                    </div>
                    <div className="grid gap-1.5 text-xs text-current/70">
                      <div>胜利：{outcome.winner?.map((entity) => formatEntityRef(entity, characterNameById)).join("、") || "未指定"}</div>
                      <div>失败：{outcome.loser?.map((entity) => formatEntityRef(entity, characterNameById)).join("、") || "未指定"}</div>
                      <div>条件：{formatConditionSummary(outcome.condition, characterNameById)}</div>
                    </div>
                    {event?.status === "pending" && (
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          disabled={isBusy}
                          onClick={() => resolvePendingOutcome(event.id, "applied")}
                        >
                          <Check className="size-3.5" />
                          应用结局
                        </Button>
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          disabled={isBusy}
                          onClick={() => resolvePendingOutcome(event.id, "dismissed")}
                        >
                          <X className="size-3.5" />
                          忽略
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyDetailState>暂无可见结局条件。</EmptyDetailState>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-medium">最近任务事件</div>
            <span className="rounded-md bg-current/10 px-2 py-0.5 text-[11px] text-current/70">
              {recentTaskEvents.length} 条
            </span>
          </div>
          {recentTaskEvents.length > 0 ? (
            <div className="space-y-3">
              {recentTaskEvents.map((event) => {
                const task = activeRoom?.taskDefinitions.find((definition) => definition.id === event.taskId);
                return (
                  <div key={event.id} className="rounded-md border bg-current/[0.065] dark:bg-current/[0.09] p-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium">{task?.title ?? event.taskId}</span>
                      <span className="rounded-md bg-current/10 px-1.5 py-0.5 text-[11px] text-current/70">
                        {event.type}
                      </span>
                      <span className="rounded-md bg-current/10 px-1.5 py-0.5 text-[11px] text-current/70">
                        {taskStatusLabels[event.after.status]}
                      </span>
                    </div>
                    <div className="mt-2 whitespace-pre-wrap text-xs leading-5 text-current/70">
                      {event.reason}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyDetailState>暂无任务事件。</EmptyDetailState>
          )}
        </section>
      </div>
    </PlotDataSheet>
  );
};
