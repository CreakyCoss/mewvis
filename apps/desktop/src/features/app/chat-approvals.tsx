import { useEffect, useReducer, useState } from "react";
import type { ChatSession, ChatPendingApproval } from "@isle/chat-contracts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { chatService } from "./chat-service";

/** Rendered by the host, including approvals from background and headless plugin sessions. */
export function ChatApprovals() {
  const [, refresh] = useReducer((value) => value + 1, 0);
  useEffect(() => chatService.subscribe(() => refresh()), []);
  const session = chatService.listSessions().find((item) => item.getSnapshot().pendingApproval);
  const approval = session?.getSnapshot().pendingApproval;
  return session && approval ? <Approval key={approval.approvalId} session={session} approval={approval} /> : null;
}

function Approval({ session, approval }: { session: ChatSession; approval: ChatPendingApproval }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);
  const remaining = Math.max(0, Math.ceil((approval.expiresAt - now) / 1_000));
  const answer = async (approved: boolean) => {
    setBusy(true);
    setError("");
    try {
      await chatService.answerApproval(session, approval.approvalId, approved);
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open>
      <DialogContent
        showCloseButton={false}
        className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>允许这次操作？</DialogTitle>
          <DialogDescription>
            {session.getSnapshot().title || "当前会话"} · {approval.summary}
          </DialogDescription>
        </DialogHeader>
        <p className="break-words text-sm">{approval.reason}</p>
        <pre
          className="max-h-[45vh] overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-xs"
          tabIndex={0}
        >
          {approval.details}
        </pre>
        <p className="text-xs text-muted-foreground">
          仅批准本次操作及以上参数。{remaining > 0 ? `剩余 ${remaining} 秒，超时自动拒绝。` : "授权已超时。"}
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={busy} onClick={() => void session.stop()}>
            停止任务
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => void answer(false)}>
            拒绝
          </Button>
          <Button disabled={busy || remaining === 0} onClick={() => void answer(true)}>
            批准这一次
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
