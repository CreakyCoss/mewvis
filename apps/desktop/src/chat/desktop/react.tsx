import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { ChatEnvironment } from "../react";
import { sessionKey, type ChatSession } from "../core";
import type { ChatInputFile } from "../react";
import type { DesktopChatService, DesktopSessionInput } from "./service";

const Context = createContext<DesktopChatService | null>(null);
export function DesktopChatEnvironment({
  service,
  children,
  files,
}: PropsWithChildren<{ service: DesktopChatService; files?: (session: ChatSession) => ChatInputFile[] }>) {
  const persistence = useMemo(
    () => (session: ChatSession, viewId: string) => (viewId === "main" ? service.viewPersistence(session) : undefined),
    [service],
  );
  return (
    <Context.Provider value={service}>
      <ChatEnvironment persistence={persistence} files={files}>
        {children}
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
  const key = input ? JSON.stringify([sessionKey(input.identity), input.workspacePath, input.profile.id]) : "";
  const [entry, setEntry] = useState<{ key: string; session?: ChatSession; error?: string }>({ key: "" });
  useEffect(() => {
    let attached = true;
    if (input)
      void service
        .openSession(input)
        .then((session) => {
          if (attached)
            setEntry((previous) =>
              previous.key === key && previous.session === session ? previous : { key, session },
            );
        })
        .catch((error) => {
          if (attached) {
            const message = error instanceof Error ? error.message : String(error);
            setEntry((previous) =>
              previous.key === key && previous.error === message ? previous : { key, error: message },
            );
          }
        });
    return () => {
      attached = false;
    };
    // The identity is stable; constructing a new descriptor does not re-open or close a session.
  }, [service, key, input?.profile]);
  return entry.key === key ? entry : { key };
}
