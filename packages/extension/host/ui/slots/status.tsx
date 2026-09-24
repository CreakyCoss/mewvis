import {
  PauseIcon,
  PlayIcon,
  XIcon,
  LoaderCircleIcon,
  ChevronDownIcon,
  CheckIcon,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "design-system/components/ui/popover";
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
  const current =
    activity.steps.find((step) => step.state === "running") ??
    activity.steps.find((step) => step.state === "pending");
  const position = current
    ? activity.steps.indexOf(current) + 1
    : activity.steps.length;
  const pauseLabel = paused ? "继续" : pausing ? "撤回暂停" : "暂停";
  const cancelLabel = item.cancelling
    ? "取消中"
    : activity.state === "cancelling"
      ? "重试取消"
      : "取消";
  const stateLabel = paused
    ? "已暂停"
    : pausing
      ? "暂停中"
      : activity.state === "cancelling"
        ? "取消中"
        : "执行中";
  const summary = pausing
    ? "当前步骤完成后暂停"
    : paused
      ? `已暂停${current ? ` · 下一步：${current.title}` : ""}`
      : activity.state === "cancelling"
        ? "正在取消流程"
        : (current?.title ?? activity.detail ?? "正在收尾");
  const stepLabels = {
    pending: "待执行",
    running: "执行中",
    completed: "已完成",
    failed: "失败",
    cancelled: "已取消",
  };
  return (
    <div
      role="status"
      aria-label={`${activity.title} · ${stateLabel}`}
      className="mx-auto mb-4 flex min-h-11 w-[96%] min-w-0 items-center gap-2 rounded-full bg-surface-raised px-3 py-1.5 text-sm shadow-[var(--shadow-floating)] sm:gap-3 sm:px-4"
    >
      {paused ? (
        <PauseIcon
          className="size-3 shrink-0 text-primary"
          aria-hidden="true"
        />
      ) : (
        <LoaderCircleIcon
          className="size-3 shrink-0 animate-spin text-primary motion-reduce:animate-none"
          strokeWidth={1.5}
          aria-hidden="true"
        />
      )}
      <span
        className="max-w-[22%] shrink-0 truncate font-medium text-foreground"
        title={activity.title}
      >
        {activity.title}
      </span>
      {current?.actor ? (
        <span
          className="flex min-w-0 max-w-[30%] shrink-0 items-center rounded-full bg-primary/8 px-2 py-1 text-[11px] leading-4 text-primary"
          title={current.actor.name}
        >
          <span className="truncate">{current.actor.name}</span>
        </span>
      ) : null}
      <span
        className="min-w-0 flex-1 truncate text-muted-foreground"
        title={summary}
      >
        {activity.state === "running" && current ? (
          <span className="mr-1.5 text-muted-foreground/75">正在</span>
        ) : null}
        {summary}
      </span>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="查看流程步骤"
            title="查看流程步骤"
            className="flex h-8 shrink-0 items-center gap-1 rounded-full px-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {activity.steps.length > 0 ? (
              <span className="tabular-nums">
                {position}/{activity.steps.length}
              </span>
            ) : null}
            <ChevronDownIcon className="size-3" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="end"
          sideOffset={12}
          aria-label={`${activity.title} · 流程步骤`}
          className="max-h-[min(26rem,var(--radix-popover-content-available-height))] w-[22.5rem] max-w-[calc(100vw-2rem)] gap-0 overflow-hidden rounded-2xl border-border/50 p-0"
        >
          <div className="shrink-0 border-b border-border/50 px-5 py-4">
            <div className="flex items-start gap-3">
              <h3 className="min-w-0 flex-1 text-sm font-medium text-foreground [overflow-wrap:anywhere]">
                {activity.title}
              </h3>
              <span className="shrink-0 pt-0.5 text-[11px] text-muted-foreground">
                {stateLabel}
              </span>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              已完成{" "}
              {
                activity.steps.filter((step) => step.state === "completed")
                  .length
              }{" "}
              / {activity.steps.length} 步
            </p>
          </div>
          <ol
            aria-label="流程步骤"
            className="min-h-0 overflow-y-auto px-5 py-4"
          >
            {activity.steps.map((step, index) => {
              const waitingToResume = paused && current?.id === step.id;
              const running = step.state === "running";
              const completed = step.state === "completed";
              const failed = step.state === "failed";
              return (
                <li
                  key={step.id}
                  aria-current={running || waitingToResume ? "step" : undefined}
                  className="relative flex gap-3 pb-5 last:pb-0"
                >
                  {index < activity.steps.length - 1 ? (
                    <span
                      aria-hidden="true"
                      className="absolute bottom-0 left-3 top-7 border-l border-border/60"
                    />
                  ) : null}
                  <span
                    aria-hidden="true"
                    className={`relative flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] tabular-nums ${failed ? "bg-destructive/10 text-destructive" : running || waitingToResume || completed ? "bg-primary/8 text-primary" : "bg-muted/70 text-muted-foreground"}`}
                  >
                    {completed ? (
                      <CheckIcon className="size-3" />
                    ) : waitingToResume ? (
                      <PauseIcon className="size-3" />
                    ) : running ? (
                      <LoaderCircleIcon
                        className="size-3 animate-spin motion-reduce:animate-none"
                        strokeWidth={1.5}
                      />
                    ) : failed || step.state === "cancelled" ? (
                      <XIcon className="size-3" />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p
                      className={`text-sm leading-5 [overflow-wrap:anywhere] ${running || waitingToResume ? "font-medium text-foreground" : "text-muted-foreground"}`}
                    >
                      {step.title}
                    </p>
                    <p
                      className={`mt-1 text-[11px] leading-4 [overflow-wrap:anywhere] ${failed ? "text-destructive" : running || waitingToResume ? "text-primary" : "text-muted-foreground"}`}
                    >
                      {waitingToResume ? "等待继续" : stepLabels[step.state]}
                      {step.actor ? (
                        <span className="text-muted-foreground">
                          {" · "}
                          {step.actor.name}
                        </span>
                      ) : null}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
          {pausing ||
          activity.state === "cancelling" ||
          (activity.detail && activity.detail !== current?.title) ? (
            <p className="max-h-24 shrink-0 overflow-y-auto border-t border-border/50 bg-muted/25 px-5 py-3 text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
              {pausing || activity.state === "cancelling"
                ? summary
                : activity.detail}
            </p>
          ) : null}
        </PopoverContent>
      </Popover>
      <div className="flex shrink-0 items-center gap-0.5 border-l border-border/70 pl-1.5 sm:pl-2">
        {activity.state !== "cancelling" &&
        activity.pausable &&
        (activity.state === "running" ? item.canPause : item.canResume) ? (
          <button
            type="button"
            aria-label={pauseLabel}
            title={pauseLabel}
            className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
            disabled={item.pendingAction !== null || item.cancelling}
            onClick={() =>
              void (activity.state === "running" ? item.pause() : item.resume())
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
          className="flex size-8 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
          disabled={item.pendingAction !== null || item.cancelling}
          onClick={() => void item.cancel()}
        >
          {item.cancelling ? (
            <LoaderCircleIcon
              className="size-3 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : (
            <XIcon className="size-3.5" aria-hidden="true" />
          )}
        </button>
      </div>
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
