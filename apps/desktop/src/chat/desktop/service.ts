import { createAgentClient } from "@/agent-client/runtime";
import {
  createChatSession,
  sessionKey,
  type ChatSession,
  type SessionIdentity,
  type OperationResult,
  type ChatMessage,
  type ChatContext,
} from "../core";
import { listChats, type ChatRecord, type ChatOrigin } from "@/api/chat";
import { createDesktopCatalog, type ChatProfile } from "./catalog";
import { createDesktopRuntime } from "./runtime";
import { createDesktopStorage, type ChatRecordSource, sameOrigin, type ViewPreferences } from "./storage";

export type DesktopSessionInput = {
  identity: SessionIdentity;
  workspacePath: string;
  profile: ChatProfile;
  workspaceId: string;
  origin: ChatOrigin;
  profileData?: ChatRecordSource["profile"];
};
/** Resolves and authorizes a scene. Only the service opens or reuses its session. */
export type ResolveChatRecord = (
  workspacePath: string,
  chatId: string,
  source: unknown,
) => Promise<DesktopSessionInput>;
export type ReadOnlyChatHistory = {
  messages: ChatMessage[];
  preferences: ViewPreferences;
  reason: string;
  canRetry: boolean;
};
export type DesktopRecordView =
  { session: ChatSession; history?: never } | { session?: never; history: ReadOnlyChatHistory };
type Storage = ReturnType<typeof createDesktopStorage>;
type SessionEntry = {
  input: DesktopSessionInput;
  source: ChatRecordSource;
  storage: Storage;
  opening: Promise<ChatSession>;
  session?: ChatSession;
  closing?: Promise<OperationResult>;
  detach?: () => void;
};
const addressOf = (workspacePath: string, chatId: string) => JSON.stringify([workspacePath, chatId]);
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
const ok = { ok: true } as const;

export function createDesktopChatService({ resolveRecord }: { resolveRecord?: ResolveChatRecord } = {}) {
  const client = createAgentClient();
  // One entry owns the entire desktop session; the second map is only a disk-address index.
  const sessions = new Map<string, SessionEntry>();
  const owners = new Map<string, SessionEntry>();
  const stores = new Map<string, Storage>();
  const listeners = new Set<(session: ChatSession) => void>();
  const savedListeners = new Set<(input: { workspacePath: string; record: ChatRecord }) => void>();
  const recordListeners = new Map<string, Set<() => void>>();
  const notifyRecord = (address: string) => recordListeners.get(address)?.forEach((listener) => listener());
  const storageFor = (workspacePath: string, chatId: string) => {
    const address = addressOf(workspacePath, chatId);
    let storage = stores.get(address);
    if (!storage) {
      storage = createDesktopStorage(
        workspacePath,
        chatId,
        (record) => savedListeners.forEach((listener) => listener({ workspacePath, record })),
        () => owners.get(address)?.source,
      );
      stores.set(address, storage);
    }
    return storage;
  };
  const loadRecordSource = async (workspacePath: string, chatId: string): Promise<unknown> =>
    structuredClone(owners.get(addressOf(workspacePath, chatId))?.source) ??
    (await storageFor(workspacePath, chatId).loadSource());
  const forget = (entry: SessionEntry) => {
    const { workspacePath, identity } = entry.input;
    const address = addressOf(workspacePath, identity.id);
    entry.detach?.();
    if (sessions.get(sessionKey(identity)) === entry) sessions.delete(sessionKey(identity));
    if (owners.get(address) === entry) owners.delete(address);
    stores.delete(address);
  };
  const validateInput = (entry: SessionEntry, input: DesktopSessionInput) => {
    if (entry.input.workspacePath !== input.workspacePath || entry.input.profile.id !== input.profile.id)
      throw new Error("同一会话身份不能切换存储位置或场景");
    if (entry.source.workspaceId !== input.workspaceId || !sameOrigin(entry.source.origin, input.origin))
      throw new Error("已有聊天的工作区或来源不匹配");
    if (
      entry.source.profile &&
      input.profileData &&
      JSON.stringify({ ...entry.source.profile, context: undefined }) !==
        JSON.stringify({ ...input.profileData, context: undefined })
    )
      throw new Error("同一会话不能更换场景配置；动态上下文请使用 setContext");
  };

  // Opening, ownership reservation and rollback stay together. Concurrent callers share this promise.
  function openSession(input: DesktopSessionInput): Promise<ChatSession> {
    const key = sessionKey(input.identity);
    const address = addressOf(input.workspacePath, input.identity.id);
    const existing = sessions.get(key);
    if (existing?.closing)
      return existing.closing.then((result) => {
        if (!result.ok) throw new Error(result.error);
        return openSession(input);
      });
    if (existing?.session?.getSnapshot().phase === "closed") {
      forget(existing);
      return openSession(input);
    }
    if (existing) {
      try {
        validateInput(existing, input);
      } catch (error) {
        return Promise.reject(error);
      }
      const changed = !existing.source.profile && existing.input.profile !== input.profile;
      if (changed) existing.input.profile = input.profile;
      return changed
        ? existing.opening.then(async (session) => {
            await session.refreshResources();
            return session;
          })
        : existing.opening;
    }
    const owner = owners.get(address);
    if (owner?.closing)
      return owner.closing.then((result) => {
        if (!result.ok) throw new Error(result.error);
        return openSession(input);
      });
    if (owner)
      return Promise.reject(
        new Error(
          owner.source.workspaceId !== input.workspaceId || !sameOrigin(owner.source.origin, input.origin)
            ? "已有聊天的工作区或来源不匹配"
            : "该聊天记录已由其他作用域持有",
        ),
      );
    const source: ChatRecordSource = structuredClone({
      workspaceId: input.workspaceId,
      origin: input.origin,
      profile: input.profileData,
    });
    const entry: SessionEntry = {
      input: { ...input },
      source,
      storage: storageFor(input.workspacePath, input.identity.id),
      opening: undefined!,
    };
    if (source.profile) entry.input.profile = { ...input.profile, context: async () => source.profile?.context ?? {} };
    sessions.set(key, entry);
    owners.set(address, entry);
    entry.opening = Promise.resolve()
      .then(async () => {
        const saved = (await entry.storage.loadSource()) as Partial<ChatRecordSource> | undefined;
        if (saved && (saved.workspaceId !== input.workspaceId || !sameOrigin(saved.origin, input.origin)))
          throw new Error("已有聊天的工作区或来源不匹配");
        const readProfile = () => entry.input.profile;
        const catalog = createDesktopCatalog(client, readProfile);
        const { runtime, context } = createDesktopRuntime(
          client,
          input.workspacePath,
          input.identity.id,
          catalog,
          readProfile,
        );
        const session = await createChatSession({
          identity: input.identity,
          runtime,
          context,
          catalog,
          storage: entry.storage.storage,
          initialMessages: input.profile.initialMessages,
        });
        entry.session = session;
        entry.detach = session.subscribe(() => listeners.forEach((listener) => listener(session)));
        listeners.forEach((listener) => listener(session));
        notifyRecord(address);
        return session;
      })
      .catch((error) => {
        forget(entry);
        throw error;
      });
    return entry.opening;
  }

  // Scene resolvers supply configuration, never call back into openSession.
  async function openRecord(input: DesktopSessionInput): Promise<DesktopRecordView> {
    const { workspacePath, identity } = input;
    const address = addressOf(workspacePath, identity.id);
    const closing = owners.get(address)?.closing;
    let canRetry = true;
    try {
      if (closing) {
        const result = await closing;
        if (!result.ok) throw new Error(result.error);
      }
      const source = (await loadRecordSource(workspacePath, identity.id)) as Partial<ChatRecordSource> | undefined;
      let resolved = input;
      if (source) {
        if (!source.origin || !source.workspaceId) {
          canRetry = false;
          throw new Error("聊天缺少有效的来源信息");
        }
        const matchesBuiltin =
          source.origin.kind === "builtin" &&
          input.origin.kind === "builtin" &&
          source.workspaceId === input.workspaceId &&
          sameOrigin(source.origin, input.origin);
        if (!matchesBuiltin) {
          if (!resolveRecord) {
            canRetry = false;
            throw new Error("当前宿主不支持恢复此聊天的场景");
          }
          resolved = await resolveRecord(workspacePath, identity.id, source);
          if (
            resolved.workspacePath !== workspacePath ||
            resolved.identity.id !== identity.id ||
            resolved.workspaceId !== source.workspaceId ||
            !sameOrigin(source.origin, resolved.origin)
          )
            throw new Error("恢复的聊天配置与记录来源不匹配");
        }
      }
      return { session: await openSession(resolved) };
    } catch (error) {
      const current = owners.get(address)?.session;
      const storage = storageFor(workspacePath, identity.id);
      const record = current ? current.getSnapshot() : await storage.storage.load();
      return {
        history: {
          messages: structuredClone(record?.messages ?? []),
          preferences: await storage.loadPreferences(),
          reason: errorText(error),
          canRetry,
        },
      };
    }
  }

  function closeSession(identity: SessionIdentity): Promise<OperationResult> {
    const entry = sessions.get(sessionKey(identity));
    if (!entry) return Promise.resolve(ok);
    if (entry.closing) return entry.closing;
    entry.closing = (async () => {
      try {
        const session = await entry.opening;
        const result = await session.close();
        if (!result.ok) return result;
        await entry.storage.flush();
        forget(entry);
        return ok;
      } catch (error) {
        return { ok: false, error: errorText(error) } as const;
      }
    })().finally(() => {
      entry.closing = undefined;
    });
    return entry.closing;
  }
  async function closeWhere(predicate: (entry: SessionEntry) => boolean) {
    for (const entry of [...sessions.values()]) {
      if (!predicate(entry)) continue;
      const result = await closeSession(entry.input.identity);
      if (!result.ok) return result;
    }
    return ok;
  }
  const entryFor = (session: ChatSession) => {
    const entry = sessions.get(sessionKey(session.identity));
    return entry?.session === session ? entry : undefined;
  };

  return {
    openSession,
    openRecord,
    async answerApproval(session: ChatSession, approvalId: string, approved: boolean) {
      const snapshot = session.getSnapshot();
      if (
        !entryFor(session) ||
        snapshot.pendingApproval?.approvalId !== approvalId ||
        snapshot.activeTaskId !== snapshot.pendingApproval.taskId ||
        snapshot.phase !== "waiting"
      )
        throw new Error("审批已失效，请等待当前操作");
      await client.tasks.answerApproval({ taskId: snapshot.pendingApproval.taskId, approvalId, approved });
    },
    closeSession,
    loadRecordSource,
    listRecords: listChats,
    listSessions: () => [...sessions.values()].flatMap((entry) => (entry.session ? [entry.session] : [])),
    getSession: (identity: SessionIdentity) => sessions.get(sessionKey(identity))?.session,
    subscribe(listener: (session: ChatSession) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    subscribeRecord(input: DesktopSessionInput, listener: () => void) {
      const address = addressOf(input.workspacePath, input.identity.id);
      let observers = recordListeners.get(address);
      if (!observers) recordListeners.set(address, (observers = new Set()));
      observers.add(listener);
      return () => {
        observers.delete(listener);
        if (!observers.size) recordListeners.delete(address);
      };
    },
    invalidateRecords() {
      recordListeners.forEach((observers) => observers.forEach((listener) => listener()));
    },
    closeRecord(workspacePath: string, chatId: string) {
      const owner = owners.get(addressOf(workspacePath, chatId));
      return owner ? closeSession(owner.input.identity) : Promise.resolve(ok);
    },
    closeWorkspace: (workspacePath: string) => closeWhere((entry) => entry.input.workspacePath === workspacePath),
    closeAll: () => closeWhere(() => true),
    async closePlugin(pluginId: string) {
      const entries = [...sessions.values()].filter(
        ({ source }) => source.origin.kind === "plugin" && source.origin.pluginId === pluginId,
      );
      return Promise.all(entries.map((entry) => closeSession(entry.input.identity)));
    },
    refreshResources() {
      return Promise.all([...sessions.values()].map(async (entry) => (await entry.opening).refreshResources()));
    },
    getLocation(session: ChatSession) {
      const input = entryFor(session)?.input;
      return input
        ? { workspacePath: input.workspacePath, chatId: input.identity.id, profileId: input.profile.id }
        : undefined;
    },
    viewPersistence(session: ChatSession) {
      const storage = entryFor(session)?.storage;
      return storage
        ? { loadPreferences: storage.loadPreferences, savePreferences: storage.savePreferences }
        : undefined;
    },
    async updateContext(session: ChatSession, context: ChatContext) {
      const entry = entryFor(session);
      if (!entry?.source.profile) throw new Error("当前会话不支持更新插件上下文");
      if (session.getSnapshot().phase !== "idle" || entry.closing) throw new Error("当前无法修改场景上下文");
      entry.source.profile.context = structuredClone(context);
      await entry.storage.saveProfile();
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
}
export type DesktopChatService = ReturnType<typeof createDesktopChatService>;
