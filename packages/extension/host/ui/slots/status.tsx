import { useEffect, useState, type ReactNode } from "react";
import { uiSlotDefinitions, type UISessionContext } from "../index.js";
import { ExtensionSlot, type SlotItem } from "./index";
import type { UIContributionFor } from "../index.js";
import type { ExtensionActivitySnapshot } from "../../services/contracts.js";
import { useViewTransport } from "../views/transport-context";

type Contribution = SlotItem<
  UIContributionFor<typeof uiSlotDefinitions.composerStatus>
>;
export type StatusSlotItem = Contribution & {
  activity: ExtensionActivitySnapshot;
  cancel(): Promise<void>;
  cancelling: boolean;
};
function DefaultStatus({ item }: { item: StatusSlotItem }) {
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
        {activity.detail ? (
          <p className="mt-1 break-words">{activity.detail}</p>
        ) : null}
      </div>
      {activity.state === "running" ? (
        <button
          type="button"
          className="shrink-0 rounded px-2 py-1 hover:bg-accent disabled:opacity-50"
          disabled={item.cancelling}
          onClick={() => void item.cancel()}
        >
          {item.cancelling ? "取消中" : "取消"}
        </button>
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
  const [activity, setActivity] = useState<ExtensionActivitySnapshot | null>(
    null,
  );
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancel, setCancel] = useState<() => Promise<void>>(
    () => async () => {},
  );
  useEffect(() => {
    let closed = false,
      token: string | undefined,
      requestId = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending: Promise<unknown> = Promise.resolve();
    setActivity(null);
    setError("");
    setCancelling(false);
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
    const poll = async () => {
      try {
        const snapshot = await query("activity.read", {});
        if (!closed) {
          setActivity(snapshot as ExtensionActivitySnapshot | null);
          setError("");
        }
      } catch (caught) {
        if (!closed) setError(String(caught));
      } finally {
        if (!closed) timer = setTimeout(poll, 800);
      }
    };
    void transport
      .open({ id: item.extensionId!, contributionId: item.id, ...context })
      .then((lease) => {
        token = lease.token;
        if (closed) {
          void transport.close(token);
          return;
        }
        setCancel(() => async () => {
          setCancelling(true);
          try {
            const current = (await query(
              "activity.read",
              {},
            )) as ExtensionActivitySnapshot | null;
            if (current?.state === "running")
              await query("activity.cancel", { id: current.id });
          } catch (caught) {
            if (!closed) setError(String(caught));
          } finally {
            if (!closed) setCancelling(false);
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
  const value = { ...item, activity, cancel, cancelling };
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
/** Structured activity data; the page can replace its presentation without owning the data source. */
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
