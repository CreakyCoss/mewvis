import type { ChatSession, OperationResult, SessionIdentity } from "@isle/chat-contracts";
import { errorText, sessionKey } from "./contracts";

/** Ownership is independent of subscriptions and React mount lifetimes. */
export function createChatService<T extends { identity: SessionIdentity }>(create: (input: T) => Promise<ChatSession>) {
  const opening = new Map<string, Promise<ChatSession>>();
  const closing = new Map<string, Promise<OperationResult>>();
  const sessions = new Map<string, ChatSession>();
  const detach = new Map<string, () => void>();
  const listeners = new Set<(session: ChatSession) => void>();
  const service = {
    openSession(input: T): Promise<ChatSession> {
      const key = sessionKey(input.identity);
      const pendingClose = closing.get(key);
      if (pendingClose)
        return pendingClose.then((result) => {
          if (!result.ok) throw new Error(result.error);
          return service.openSession(input);
        });
      if (sessions.get(key)?.getSnapshot().phase === "closed") {
        detach.get(key)?.();
        detach.delete(key);
        sessions.delete(key);
        opening.delete(key);
      }
      const existing = opening.get(key);
      if (existing) return existing;
      const promise = create(input)
        .then((session) => {
          sessions.set(key, session);
          detach.set(
            key,
            session.subscribe(() => {
              for (const listener of listeners) listener(session);
            }),
          );
          for (const listener of listeners) listener(session);
          return session;
        })
        .catch((error) => {
          opening.delete(key);
          throw error;
        });
      opening.set(key, promise);
      return promise;
    },
    listSessions() {
      return [...sessions.values()];
    },
    getSession(identity: SessionIdentity) {
      return sessions.get(sessionKey(identity));
    },
    subscribe(listener: (session: ChatSession) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    closeSession(identity: SessionIdentity): Promise<OperationResult> {
      const key = sessionKey(identity);
      const existingClose = closing.get(key);
      if (existingClose) return existingClose;
      const pending = opening.get(key);
      if (!pending) return Promise.resolve({ ok: true });
      const close = (async () => {
        try {
          const session = await pending;
          const result = await session.close();
          if (result.ok && sessions.get(key) === session) {
            detach.get(key)?.();
            detach.delete(key);
            opening.delete(key);
            sessions.delete(key);
          }
          return result;
        } catch (error) {
          return { ok: false, error: errorText(error) } as const;
        }
      })().finally(() => {
        closing.delete(key);
      });
      closing.set(key, close);
      return close;
    },
  };
  return service;
}
