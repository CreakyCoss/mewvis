import { useSyncExternalStore, type PropsWithChildren } from "react";
import { getConnectionState, observeConnection } from "@/transport/events";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "design-system/components/ui/dialog";
import { Button } from "design-system/components/ui/button";

type ConfirmationRequest = {
  id: number;
  title: string;
  description: string;
  resolve: (value: boolean) => void;
};
let nextId = 0;
const queue: ConfirmationRequest[] = [];
const listeners = new Set<() => void>();
const getConfirmation = () => queue[0] ?? null;
function observeConfirmations(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function finishConfirmation(request: ConfirmationRequest, value: boolean) {
  const index = queue.indexOf(request);
  if (index < 0) return;
  queue.splice(index, 1);
  request.resolve(value);
  listeners.forEach((listener) => listener());
}
export function confirmWorkspaceShare(title: string, description: string, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const cancel = () => finishConfirmation(request, false);
    const request: ConfirmationRequest = {
      id: ++nextId,
      title,
      description,
      resolve(value) {
        signal.removeEventListener("abort", cancel);
        resolve(value);
      },
    };
    signal.addEventListener("abort", cancel, { once: true });
    queue.push(request);
    listeners.forEach((listener) => listener());
  });
}

export function SystemFeedback({ children }: PropsWithChildren) {
  return (
    <>
      {children}
      <SystemDialogs />
      <BackendConnectionNotice />
    </>
  );
}

function SystemDialogs() {
  const request = useSyncExternalStore(observeConfirmations, getConfirmation, () => null);
  if (!request) return null;
  return (
    <Dialog
      key={request.id}
      open
      onOpenChange={(open) => {
        if (!open) finishConfirmation(request, false);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{request.title}</DialogTitle>
          <DialogDescription>{request.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => finishConfirmation(request, false)}>
            取消
          </Button>
          <Button onClick={() => finishConfirmation(request, true)}>允许共享</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BackendConnectionNotice() {
  const state = useSyncExternalStore(observeConnection, getConnectionState, () => "connecting");
  if (state === "connected" || state === "connecting") return null;
  return (
    <div
      role="alert"
      className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-3 border-b bg-background px-4 py-2 text-sm shadow"
    >
      <span>
        {state === "reload-required"
          ? "后端已重启或部分事件已过期。请刷新页面重新读取已保存的数据；未保存的编辑请先复制保留。"
          : state === "unavailable"
            ? "无法订阅后端事件。请检查服务后刷新页面。"
            : "与后端的事件连接已断开，正在尝试重连。"}
      </span>
      <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
        刷新页面
      </Button>
    </div>
  );
}
