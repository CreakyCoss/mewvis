import { createAgentClient } from "@/agent-client/runtime";
import {
  createChatService,
  createChatSession,
  sessionKey,
  type ChatSession,
  type SessionIdentity,
  type OperationResult,
} from "../core";
import type { ChatRecord } from "@/api/chat";
import { createDesktopCatalog, type ChatProfile } from "./catalog";
import { createDesktopRuntime } from "./runtime";
import { createDesktopStorage } from "./storage";

export type DesktopSessionInput = { identity: SessionIdentity; workspacePath: string; profile: ChatProfile };
export function createDesktopChatService() {
  const client = createAgentClient();
  const stores = new Map<string, ReturnType<typeof createDesktopStorage>>();
  const locations = new Map<string, { workspacePath: string; chatId: string; profileId: string }>();
  const owners = new Map<string, string>();
  const profiles = new Map<string, ChatProfile>();
  const closing = new Map<string, Promise<OperationResult>>();
  const savedListeners = new Set<(input: { workspacePath: string; record: ChatRecord }) => void>();
  const storageFor = (workspacePath: string, chatId: string) => {
    const key = JSON.stringify([workspacePath, chatId]);
    let store = stores.get(key);
    if (!store) {
      store = createDesktopStorage(workspacePath, chatId, (record) => {
        for (const listener of savedListeners) listener({ workspacePath, record });
      });
      stores.set(key, store);
    }
    return store;
  };
  const manager = createChatService(async ({ identity, workspacePath, profile }: DesktopSessionInput) => {
    const location = JSON.stringify([workspacePath, identity.id]);
    const key = sessionKey(identity);
    if (owners.has(location) && owners.get(location) !== key) throw new Error("该聊天记录已由其他作用域持有");
    owners.set(location, key);
    locations.set(key, { workspacePath, chatId: identity.id, profileId: profile.id });
    profiles.set(key, profile);
    const readProfile = () => profiles.get(key) ?? profile;
    const catalog = createDesktopCatalog(client, readProfile);
    const { runtime, context } = createDesktopRuntime(client, workspacePath, identity.id, catalog, readProfile);
    return createChatSession({
      identity,
      runtime,
      context,
      catalog,
      storage: storageFor(workspacePath, identity.id).storage,
      initialMessages: profile.initialMessages,
    });
  });
  const service = {
    ...manager,
    async openSession(input: DesktopSessionInput) {
      const key = sessionKey(input.identity);
      const pendingClose = closing.get(key);
      if (pendingClose) {
        const result = await pendingClose;
        if (!result.ok) throw new Error(result.error);
      }
      const location = locations.get(key);
      if (location && (location.workspacePath !== input.workspacePath || location.profileId !== input.profile.id))
        return Promise.reject(new Error("同一会话身份不能切换存储位置或场景"));
      const profileChanged = profiles.has(key) && profiles.get(key) !== input.profile;
      if (profileChanged) profiles.set(key, input.profile);
      const session = await manager.openSession(input);
      if (profileChanged) await session.refreshResources();
      return session;
    },
    closeSession(identity: SessionIdentity): Promise<OperationResult> {
      const key = sessionKey(identity);
      const pending = closing.get(key);
      if (pending) return pending;
      const close = (async () => {
        try {
          const result = await manager.closeSession(identity);
          if (result.ok) {
            const location = locations.get(key);
            if (location) {
              const address = JSON.stringify([location.workspacePath, location.chatId]);
              await stores.get(address)?.flush();
              stores.delete(address);
              owners.delete(address);
            }
            locations.delete(key);
            profiles.delete(key);
          }
          return result;
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) } as const;
        }
      })().finally(() => {
        closing.delete(key);
      });
      closing.set(key, close);
      return close;
    },
    async closeWorkspace(workspacePath: string) {
      for (const [key, location] of locations) {
        if (location.workspacePath !== workspacePath) continue;
        const [scope, id] = JSON.parse(key) as [string, string];
        const result = await service.closeSession({ scope, id });
        if (!result.ok) return result;
      }
      return { ok: true } as const;
    },
    async closeAll() {
      for (const key of locations.keys()) {
        const [scope, id] = JSON.parse(key) as [string, string];
        const result = await service.closeSession({ scope, id });
        if (!result.ok) return result;
      }
      return { ok: true } as const;
    },
    refreshResources() {
      return Promise.all(manager.listSessions().map((session) => session.refreshResources()));
    },
    getLocation: (session: ChatSession) => locations.get(sessionKey(session.identity)),
    viewPersistence(session: ChatSession) {
      const location = locations.get(sessionKey(session.identity));
      return location ? storageFor(location.workspacePath, location.chatId) : undefined;
    },
    onSaved(listener: (input: { workspacePath: string; record: ChatRecord }) => void) {
      savedListeners.add(listener);
      return () => {
        savedListeners.delete(listener);
      };
    },
    setUnread: (workspacePath: string, chatId: string, value: boolean) =>
      storageFor(workspacePath, chatId).setUnread(value),
  };
  return service;
}
export type DesktopChatService = ReturnType<typeof createDesktopChatService>;
