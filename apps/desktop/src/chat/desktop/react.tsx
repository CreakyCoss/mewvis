import { createContext, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";
import { ChatEnvironment } from "../react";
import { sessionKey, type ChatSession } from "../core";
import type { ChatInputFile } from "../react";
import type { DesktopChatService, DesktopSessionInput, DesktopRecordView, ReadOnlyChatHistory } from "./service";
import { useDesktopApprovals } from "./approvals";

const Context = createContext<DesktopChatService | null>(null);
export function DesktopChatEnvironment({
  service,
  children,
  files,
}: PropsWithChildren<{
  service: DesktopChatService;
  files?: (session: ChatSession) => ChatInputFile[];
}>) {
  const approvals = useDesktopApprovals(service);
  const persistence = useMemo(
    () => (session: ChatSession, viewId: string) => (viewId === "main" ? service.viewPersistence(session) : undefined),
    [service],
  );
  return (
    <Context.Provider value={service}>
      <ChatEnvironment persistence={persistence} files={files} renderBeforeComposer={approvals.renderBeforeComposer}>
        {children}
        {approvals.background}
      </ChatEnvironment>
    </Context.Provider>
  );
}
export function useDesktopChatService() {
  const service = useContext(Context);
  if (!service) throw new Error("缺少 DesktopChatEnvironment");
  return service;
}
export function useDesktopChatSession(input: DesktopSessionInput | null) {
  const service = useDesktopChatService();
  const open = useMemo(
    () => async (input: DesktopSessionInput) => ({ session: await service.openSession(input) }),
    [service],
  );
  return useSession(input, open);
}
export function useDesktopChatRecord(input: DesktopSessionInput | null) {
  const service = useDesktopChatService();
  return useSession(input, service.openRecord, service);
}
function useSession(
  input: DesktopSessionInput | null,
  open: (input: DesktopSessionInput) => Promise<DesktopRecordView>,
  observeRecords?: DesktopChatService,
) {
  const key = input
    ? JSON.stringify([
        sessionKey(input.identity),
        input.workspacePath,
        input.workspaceId,
        input.origin,
        input.profile.id,
      ])
    : "";
  const [entry, setEntry] = useState<{
    key: string;
    session?: ChatSession;
    history?: ReadOnlyChatHistory;
    error?: string;
    connecting: boolean;
    retryError?: string;
  }>({ key: "", connecting: false });
  const [revision, setRevision] = useState(0);
  const pending = useRef<{ key: string; token: object; visibleUntil?: number } | null>(null);
  useEffect(() => {
    let attached = true;
    let generation = 0;
    let token: object;
    let finishFeedback = () => {};
    const connect = () => {
      if (!input) return;
      const current = ++generation;
      const requestToken = (token = {});
      const visibleUntil = pending.current?.key === key ? pending.current.visibleUntil : undefined;
      pending.current = { key, token: requestToken, visibleUntil };
      finishFeedback();
      const remaining = Math.max(0, (visibleUntil ?? 0) - performance.now());
      // Only manual retries have a minimum feedback duration; execution starts immediately.
      const feedback = remaining
        ? new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, remaining);
            finishFeedback = () => {
              clearTimeout(timer);
              resolve();
            };
          })
        : Promise.resolve();
      setEntry((previous) => ({
        ...(previous.key === key ? previous : { key }),
        connecting: true,
        retryError: undefined,
        error: undefined,
      }));
      void open(input)
        .then(async (view) => {
          await feedback;
          if (attached && current === generation) {
            setEntry((previous) => ({
              key,
              ...view,
              connecting: false,
              retryError: previous.key === key && previous.history ? view.history?.reason : undefined,
            }));
          }
        })
        .catch(async (error) => {
          await feedback;
          if (attached && current === generation) {
            const message = error instanceof Error ? error.message : String(error);
            setEntry((previous) => ({
              key,
              history: previous.key === key ? previous.history : undefined,
              connecting: false,
              error: message,
              retryError: previous.key === key && previous.history ? message : undefined,
            }));
          }
        })
        .finally(() => {
          if (pending.current?.token === requestToken) pending.current = null;
        });
    };
    const detach = input ? observeRecords?.subscribeRecord(input, connect) : undefined;
    connect();
    return () => {
      attached = false;
      finishFeedback();
      if (pending.current?.token === token) pending.current = null;
      detach?.();
    };
    // The identity is stable; constructing a new descriptor does not re-open or close a session.
  }, [open, key, input?.profile, observeRecords, revision]);
  return {
    ...(entry.key === key ? entry : { key, connecting: Boolean(input) }),
    reload: () => {
      if (!input || pending.current?.key === key) return;
      // Guard consecutive clicks before React commits the disabled button.
      pending.current = { key, token: {}, visibleUntil: performance.now() + 400 };
      setEntry((previous) => ({
        ...(previous.key === key ? previous : { key }),
        connecting: true,
        retryError: undefined,
        error: undefined,
      }));
      setRevision((value) => value + 1);
    },
  };
}
