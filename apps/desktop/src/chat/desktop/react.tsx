import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { ChatEnvironment } from "../react";
import { sessionKey, type ChatSession } from "../core";
import type { ChatInputFile } from "../react";
import type { DesktopChatService, DesktopSessionInput, DesktopRecordView, ReadOnlyChatHistory } from "./service";

const Context = createContext<DesktopChatService | null>(null);
const RecordContext = createContext<((input: DesktopSessionInput) => Promise<DesktopRecordView>) | null>(null);
export function DesktopChatEnvironment({
  service,
  children,
  files,
  openRecord = service.openRecord,
}: PropsWithChildren<{
  service: DesktopChatService;
  files?: (session: ChatSession) => ChatInputFile[];
  openRecord?: (input: DesktopSessionInput) => Promise<DesktopRecordView>;
}>) {
  const persistence = useMemo(
    () => (session: ChatSession, viewId: string) => (viewId === "main" ? service.viewPersistence(session) : undefined),
    [service],
  );
  return (
    <Context.Provider value={service}>
      <RecordContext.Provider value={openRecord}>
        <ChatEnvironment persistence={persistence} files={files}>
          {children}
        </ChatEnvironment>
      </RecordContext.Provider>
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
  const openRecord = useContext(RecordContext) ?? service.openRecord;
  return useSession(input, openRecord, service);
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
  }>({ key: "" });
  const [revision, reload] = useState(0);
  useEffect(() => {
    let attached = true;
    let generation = 0;
    let observed: ChatSession | undefined;
    const connect = () => {
      if (!input) return;
      const current = ++generation;
      void open(input)
        .then((view) => {
          if (attached && current === generation) {
            observed = view.session ?? observed;
            setEntry((previous) =>
              view.session && previous.key === key && previous.session === view.session ? previous : { key, ...view },
            );
          }
        })
        .catch((error) => {
          if (attached && current === generation) {
            const message = error instanceof Error ? error.message : String(error);
            setEntry((previous) =>
              previous.key === key && previous.error === message ? previous : { key, error: message },
            );
          }
        });
    };
    const detach = observeRecords?.subscribe((session) => {
      if (
        input &&
        session !== observed &&
        session.getSnapshot().phase !== "closed" &&
        session.identity.id === input.identity.id &&
        observeRecords.getLocation(session)?.workspacePath === input.workspacePath
      ) {
        observed = session;
        connect();
      }
    });
    const detachRecords = observeRecords?.subscribeRecordChanges(connect);
    connect();
    return () => {
      attached = false;
      detach?.();
      detachRecords?.();
    };
    // The identity is stable; constructing a new descriptor does not re-open or close a session.
  }, [open, key, input?.profile, observeRecords, revision]);
  return { ...(entry.key === key ? entry : { key }), reload: () => reload((value) => value + 1) };
}
