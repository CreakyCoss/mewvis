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
  return (
    <div
      role="status"
      className="flex items-center gap-3 rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <strong>{activity.title}</strong>
          <span className="text-muted-foreground">
            {
              {
                running: "执行中",
                pausing: "暂停中",
                paused: "已暂停",
                cancelling: "取消中",
                completed: "已完成",
                failed: "失败",
                cancelled: "已取消",
              }[activity.state]
            }
          </span>
        </div>
        <ol className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
          {activity.steps.map((step, index) => (
            <li
              key={step.id}
              className={
                step.state === "running" ? "font-medium text-primary" : ""
              }
            >
              {index + 1}. {step.title} ·{" "}
              {
                {
                  pending: "等待",
                  running: "执行中",
                  completed: "完成",
                  failed: "失败",
                  cancelled: "取消",
                }[step.state]
              }
            </li>
          ))}
        </ol>
        {activity.state === "pausing" ? (
          <p className="mt-1">当前步骤完成后暂停</p>
        ) : activity.state === "paused" ? (
          <p className="mt-1">已完成的步骤会保留，继续后执行下一步</p>
        ) : activity.detail ? (
          <p className="mt-1 break-words">{activity.detail}</p>
        ) : null}
      </div>
      {active(activity.state) ? (
        <div className="flex shrink-0 items-center gap-1">
          {activity.state !== "cancelling" &&
          activity.pausable &&
          (activity.state === "running" ? item.canPause : item.canResume) ? (
            <button
              type="button"
              className="rounded px-2 py-1 hover:bg-accent disabled:opacity-50"
              disabled={item.pendingAction !== null || item.cancelling}
              onClick={() =>
                void (activity.state === "running"
                  ? item.pause()
                  : item.resume())
              }
            >
              {activity.state === "running"
                ? "暂停"
                : activity.state === "pausing"
                  ? "撤回暂停"
                  : "继续"}
            </button>
          ) : null}
          <button
            type="button"
            className="rounded px-2 py-1 hover:bg-accent disabled:opacity-50"
            disabled={item.pendingAction !== null || item.cancelling}
            onClick={() => void item.cancel()}
          >
            {item.cancelling
              ? "取消中"
              : activity.state === "cancelling"
                ? "重试取消"
                : "取消"}
          </button>
        </div>
      ) : null}
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
