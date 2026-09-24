import {
  PauseIcon,
  PlayIcon,
  XIcon,
  LoaderCircleIcon,
  WorkflowIcon,
} from "lucide-react";
import { useHostExecution } from "../runtime/execution-context";
import { useEffect, useState, type ReactNode } from "react";
import {
  uiSlotDefinitions,
  type UISessionContext,
  type UIContributionFor,
} from "../index.js";
import { ExtensionSlot, type SlotItem } from "./index";
import type { ExtensionActivitySnapshot } from "../../services/contracts.js";
import { useViewTransport } from "../views/transport-context";

type Contribution = SlotItem<
  UIContributionFor<typeof uiSlotDefinitions.composerStatus>
>;
type Action = "pause" | "resume" | "cancel";
export type StatusSlotItem = Contribution & {
  activity: ExtensionActivitySnapshot;
  pause(): Promise<void>;
  resume(): Promise<void>;
  cancel(): Promise<void>;
  canPause: boolean;
  canResume: boolean;
  pendingAction: Action | null;
  cancelling: boolean;
};
const active = (state: ExtensionActivitySnapshot["state"]) =>
  ["running", "pausing", "paused", "cancelling"].includes(state);
export function DefaultStatus({ item }: { item: StatusSlotItem }) {
  const { activity } = item;
  if (!active(activity.state)) return null;
  const paused = activity.state === "paused";
  const pausing = activity.state === "pausing";
  const completed = activity.steps.filter(
    (step) => step.state === "completed",
  ).length;
  const current =
    activity.steps.find((step) => step.state === "running") ??
    activity.steps.find((step) => step.state === "pending");
  const pauseLabel = paused ? "继续" : pausing ? "撤回暂停" : "暂停";
  const cancelLabel = item.cancelling
    ? "取消中"
    : activity.state === "cancelling"
      ? "重试取消"
      : "取消";
  const hint = pausing
    ? "当前步骤完成后暂停"
    : paused
      ? "准备好后，继续下一步"
      : activity.detail;
  return (
    <div role="status" className="rounded-2xl bg-muted/40 px-3.5 py-3 text-xs">
      <div className="flex items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/8 text-primary">
          {paused ? (
            <PauseIcon className="size-3.5" aria-hidden="true" />
          ) : (
            <WorkflowIcon className="size-4" aria-hidden="true" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-medium text-foreground">
              {activity.title}
            </span>
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {paused
                ? "已暂停"
                : pausing
                  ? "暂停中"
                  : activity.state === "cancelling"
                    ? "取消中"
                    : "执行中"}
            </span>
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-2 text-muted-foreground">
            <span className="truncate" title={hint || current?.title}>
              {hint && (paused || pausing)
                ? hint
                : (current?.title ?? "正在收尾")}
            </span>
            <span className="shrink-0 text-[11px] tabular-nums opacity-65">
              {completed} / {activity.steps.length}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {activity.state !== "cancelling" &&
          activity.pausable &&
          (activity.state === "running" ? item.canPause : item.canResume) ? (
            <button
              type="button"
              aria-label={pauseLabel}
              title={pauseLabel}
              className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
              disabled={item.pendingAction !== null || item.cancelling}
              onClick={() =>
                void (activity.state === "running"
                  ? item.pause()
                  : item.resume())
              }
            >
              {paused || pausing ? (
                <PlayIcon className="size-3.5" aria-hidden="true" />
              ) : (
                <PauseIcon className="size-3.5" aria-hidden="true" />
              )}
            </button>
          ) : null}
          <button
            type="button"
            aria-label={cancelLabel}
            title={cancelLabel}
            className="flex size-8 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-background/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
            disabled={item.pendingAction !== null || item.cancelling}
            onClick={() => void item.cancel()}
          >
            {item.cancelling ? (
              <LoaderCircleIcon
                className="size-3.5 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : (
              <XIcon className="size-3.5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
      <ol aria-label="流程步骤" className="mt-2.5 flex gap-1.5">
        {activity.steps.map((step) => {
          const label = `${step.title} · ${{ pending: "等待", running: "执行中", completed: "完成", failed: "失败", cancelled: "取消" }[step.state]}`;
          return (
            <li
              key={step.id}
              aria-label={label}
              title={label}
              className={`h-1 min-w-0 flex-1 rounded-full ${step.state === "completed" ? "bg-primary/50" : step.state === "running" ? "bg-primary/25" : "bg-foreground/6"}`}
            />
          );
        })}
      </ol>
    </div>
  );
}

function Activity({
  item,
  context,
  render,
}: {
  item: Contribution;
  context: UISessionContext;
  render?: (item: StatusSlotItem) => ReactNode;
}) {
  const transport = useViewTransport();
  const execution = useHostExecution(context);
  const [activity, setActivity] = useState<ExtensionActivitySnapshot | null>(
    null,
  );
  const [error, setError] = useState("");
  const [pendingAction, setPendingAction] = useState<Action | null>(null);
  const [support, setSupport] = useState({ canPause: false, canResume: false });
  const [act, setAct] = useState<(action: Action, id: string) => Promise<void>>(
    () => async () => {},
  );
  useEffect(() => {
    let closed = false,
      token: string | undefined,
      requestId = 0,
      controlling = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending: Promise<unknown> = Promise.resolve();
    setActivity(null);
    setError("");
    setPendingAction(null);
    setSupport({ canPause: false, canResume: false });
    const query = (method: string, input: unknown) => {
      const result = pending
        .catch(() => {})
        .then(() => {
          if (closed || !token) throw new Error("状态视图已关闭");
          return transport.query(token, method, input, ++requestId);
        });
      pending = result;
      return result;
    };
    const refresh = async () => {
      const snapshot = await query("activity.read", {});
      if (!closed) setActivity(snapshot as ExtensionActivitySnapshot | null);
    };
    const poll = async () => {
      try {
        await refresh();
      } catch (caught) {
        if (!closed) setError(String(caught));
      } finally {
        if (!closed) timer = setTimeout(poll, 800);
      }
    };
    void transport
      .open({
        id: item.extensionId!,
        contributionId: item.id,
        workspacePath: context.workspacePath,
        chatId: context.chatId,
      })
      .then((lease) => {
        token = lease.token;
        if (closed) {
          void transport.close(token);
          return;
        }
        const supports = (method: string) =>
          lease.capabilities.some(
            (capability) =>
              capability.capability === method &&
              capability.status === "available",
          );
        setSupport({
          canPause: supports("activity.pause"),
          canResume: supports("activity.resume"),
        });
        setAct(() => async (action: Action, id: string) => {
          if (closed || controlling) return;
          controlling = true;
          setPendingAction(action);
          setError("");
          try {
            await query(`activity.${action}`, { id });
            await refresh();
          } catch (caught) {
            if (!closed) setError(String(caught));
          } finally {
            controlling = false;
            if (!closed) setPendingAction(null);
          }
        });
        void poll();
      })
      .catch((caught) => {
        if (!closed) setError(String(caught));
      });
    return () => {
      closed = true;
      clearTimeout(timer);
      if (token) void transport.close(token).catch(() => {});
    };
  }, [
    transport,
    item.extensionId,
    item.id,
    item.revision,
    context.workspacePath,
    context.chatId,
  ]);
  if (!activity)
    return error ? (
      <p role="alert" className="text-xs text-destructive">
        {item.title}：{error}
      </p>
    ) : null;
  const shared =
    execution.snapshot?.taskId === activity.executionId
      ? execution.snapshot
      : undefined;
  if (!active(activity.state) || (shared && !active(shared.state))) return null;
  const control = async (action: "resume" | "cancel") => {
    if (!shared || !execution.source) return act(action, activity.id);
    setPendingAction(action);
    setError("");
    try {
      await execution.source[action](context, shared.taskId);
    } catch (caught) {
      setError(String(caught));
    } finally {
      setPendingAction(null);
    }
  };
  const value: StatusSlotItem = {
    ...item,
    ...support,
    activity: shared
      ? {
          ...activity,
          state: shared.state,
          ...(shared.state === "cancelled" || shared.state === "failed"
            ? {
                detail:
                  shared.state === "cancelled" ? "任务已取消" : "任务执行失败",
                steps: activity.steps.map((step) =>
                  step.state === "running"
                    ? { ...step, state: shared.state as "cancelled" | "failed" }
                    : step,
                ),
              }
            : {}),
        }
      : activity,
    pause: () => act("pause", activity.id),
    resume: () => control("resume"),
    cancel: () => control("cancel"),
    pendingAction,
    cancelling:
      pendingAction === "cancel" ||
      (shared?.state === "cancelling" && !shared.cancelError),
  };
  return (
    <>
      {render ? render(value) : <DefaultStatus item={value} />}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </>
  );
}
/** Structured activity data; pages can customize presentation without owning execution state. */
export function StatusSlot({
  context,
  render,
}: {
  context: UISessionContext;
  render?: (item: StatusSlotItem) => ReactNode;
}) {
  return (
    <ExtensionSlot
      definition={uiSlotDefinitions.composerStatus}
      context={context}
      render={(item) => (
        <Activity item={item} context={context} render={render} />
      )}
    />
  );
}
