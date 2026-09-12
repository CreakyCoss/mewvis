import { useCallback, useEffect, useId, useReducer, useRef, useState, useSyncExternalStore } from "react";
import { ChevronDownIcon, ChevronUpIcon, ShieldCheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChatPendingApproval, ChatSession } from "../core";
import type { DesktopChatService } from "./service";

/** Approval actions stay in the desktop host, including for headless and iframe application sessions. */
export function useDesktopApprovals(service: DesktopChatService) {
  const [, refresh] = useReducer((value) => value + 1, 0);
  const visible = useRef(new Map<ChatSession, number>());
  useEffect(() => service.subscribe(() => refresh()), [service]);
  const register = useCallback((session: ChatSession) => {
    visible.current.set(session, (visible.current.get(session) ?? 0) + 1);
    refresh();
    return () => {
      const count = (visible.current.get(session) ?? 1) - 1;
      if (count) visible.current.set(session, count);
      else visible.current.delete(session);
      refresh();
    };
  }, []);
  const renderBeforeComposer = useCallback(
    (session: ChatSession) => <InlineApproval session={session} service={service} register={register} />,
    [service, register],
  );
  const waiting = service
    .listSessions()
    .filter((session) => !visible.current.has(session) && session.getSnapshot().pendingApproval);
  const session = waiting[0];
  return {
    renderBeforeComposer,
    background: session ? (
      <aside
        aria-label="后台会话审批"
        className="fixed right-4 bottom-4 z-40 w-[min(28rem,calc(100vw-2rem))] drop-shadow-lg"
      >
        <ApprovalCard
          key={session.getSnapshot().pendingApproval!.approvalId}
          session={session}
          approval={session.getSnapshot().pendingApproval!}
          service={service}
          title={`${session.getSnapshot().title || "后台会话"}${waiting.length > 1 ? ` · 共 ${waiting.length} 项待审批` : ""}`}
        />
      </aside>
    ) : null,
  };
}

function InlineApproval({
  session,
  service,
  register,
}: {
  session: ChatSession;
  service: DesktopChatService;
  register(session: ChatSession): () => void;
}) {
  useEffect(() => register(session), [session, register]);
  const approval = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot).pendingApproval;
  return approval ? (
    <div className="mx-auto mb-3 w-full max-w-[69rem]">
      <ApprovalCard key={approval.approvalId} session={session} approval={approval} service={service} />
    </div>
  ) : null;
}

function ApprovalCard({
  session,
  approval,
  service,
  title,
}: {
  session: ChatSession;
  approval: ChatPendingApproval;
  service: DesktopChatService;
  title?: string;
}) {
  const detailsId = useId();
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);
  const remaining = Math.max(0, Math.ceil((approval.expiresAt - now) / 1_000));
  const answer = async (approved: boolean) => {
    if (busy || !remaining) return;
    setBusy(true);
    setError("");
    try {
      await service.answerApproval(session, approval.approvalId, approved);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      aria-label="操作审批"
      className="overflow-hidden rounded-xl border border-primary/20 bg-card text-card-foreground shadow-sm"
    >
      {expanded ? (
        <div
          id={detailsId}
          role="region"
          aria-label="完整审批信息"
          tabIndex={0}
          className="max-h-[min(40dvh,18rem)] space-y-3 overflow-auto border-b border-border/60 bg-muted/30 p-3 text-xs"
        >
          {title ? <p className="break-words font-medium">{title}</p> : null}
          <p className="whitespace-pre-wrap break-words leading-5">{approval.reason}</p>
          <pre className="whitespace-pre-wrap break-all rounded-lg border border-border/60 bg-background p-3 font-mono leading-5">
            {approval.details}
          </pre>
          <div className="flex items-center justify-between gap-3 text-muted-foreground">
            <span>仅授权本次操作及以上参数。</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 shrink-0 text-xs"
              disabled={busy}
              onClick={() => void session.stop()}
            >
              停止任务
            </Button>
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
        <ShieldCheckIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1 basis-40">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span role="status" className="shrink-0 font-medium">
              需要批准
            </span>
            <span className="truncate text-muted-foreground" title={approval.summary}>
              {approval.summary}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground" title={title || approval.reason}>
            {title || approval.reason}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs tabular-nums text-muted-foreground" title="一分钟内未批准将自动拒绝">
            {remaining > 0 ? `${remaining}s` : "已超时"}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2 text-xs"
            aria-label={expanded ? "收起审批信息" : "查看完整审批信息"}
            aria-expanded={expanded}
            aria-controls={detailsId}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "收起" : "详情"}
            {expanded ? (
              <ChevronDownIcon aria-hidden="true" className="size-3.5" />
            ) : (
              <ChevronUpIcon aria-hidden="true" className="size-3.5" />
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 px-3 text-xs"
            disabled={busy || !remaining}
            onClick={() => void answer(false)}
          >
            拒绝
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8 px-3 text-xs"
            disabled={busy || !remaining}
            onClick={() => void answer(true)}
          >
            批准一次
          </Button>
        </div>
      </div>
      {error ? (
        <p role="alert" className="border-t border-border/60 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
