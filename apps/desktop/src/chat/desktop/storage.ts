import { loadChat, saveChat, setChatUnread, type ChatRecord as ApiRecord, type ChatOrigin } from "@/api/chat";
import type { ChatRecord, ChatRunConfig, ChatStorage } from "../core";
import type { PluginChatProfile } from "@isle/plugin-sdk/chat";

export type ChatRecordSource = { workspaceId: string; origin: ChatOrigin; profile?: PluginChatProfile };
export const sameOrigin = (a: ChatOrigin | undefined, b: ChatOrigin) =>
  a?.kind === b.kind &&
  a.sceneId === b.sceneId &&
  (a.kind !== "plugin" || (b.kind === "plugin" && a.pluginId === b.pluginId));

export type ViewPreferences = { showThinkingProcess: boolean; showToolCallProcess: boolean };
const configKeys = [
  "selectedModelId",
  "thinkingLevel",
  "selectedAgentId",
  "selectedSkillKeys",
  "selectedKnowledgeCollectionIds",
  "permissionMode",
] as const;
export const readRunConfig = (options: Record<string, unknown>): Partial<ChatRunConfig> => {
  const config: Record<string, unknown> = {};
  for (const key of configKeys) {
    const value = options[key];
    if (key === "permissionMode" || key === "thinkingLevel") {
      // The session normalizes saved selections against the returned catalog.
      if (value === null || typeof value === "string") config[key] = value;
    } else if (key === "selectedModelId" || key === "selectedAgentId") {
      if (typeof value === "string") config[key] = value;
    } else if (Array.isArray(value) && value.every((item) => typeof item === "string")) config[key] = value;
  }
  return config;
};
export function createDesktopStorage(
  workspacePath: string,
  chatId: string,
  saved: (record: ApiRecord) => void,
  readSource?: () => ChatRecordSource | undefined,
) {
  let current: ApiRecord<ChatRecord["messages"][number], Record<string, unknown>> | null = null;
  let writePending = false;
  let unreadPending = false;
  let loaded = false;
  let loading: Promise<void> | undefined;
  let queue = Promise.resolve();
  let preferences: ViewPreferences = { showThinkingProcess: true, showToolCallProcess: true };
  const load = async () => {
    if (loaded) return;
    loading ??= loadChat<ChatRecord["messages"][number], Record<string, unknown>>(workspacePath, chatId)
      .then((record) => {
        if (record && !Array.isArray(record.messages)) throw new Error("聊天消息格式无效，已保留原文件");
        current = record;
        preferences = {
          showThinkingProcess: record?.options?.showThinkingProcess !== false,
          showToolCallProcess: record?.options?.showToolCallProcess !== false,
        };
        loaded = true;
      })
      .finally(() => {
        loading = undefined;
      });
    await loading;
  };
  const enqueue = (work: () => Promise<void>) => {
    const result = queue.then(work);
    queue = result.catch(() => undefined);
    return result;
  };
  const write = async () => {
    if (!current) return;
    writePending = true;
    const source = structuredClone(readSource?.());
    const workspaceId = source?.workspaceId ?? current.workspaceId;
    const origin = source?.origin ?? current.origin;
    if (!workspaceId || !origin) throw new Error("聊天缺少工作区或来源信息，无法保存");
    if (current.origin && (current.workspaceId !== workspaceId || !sameOrigin(current.origin, origin)))
      throw new Error("不能更改已有聊天的工作区或来源");
    const record = await saveChat({
      workspacePath,
      chatId,
      workspaceId,
      origin,
      title: current.title,
      messages: current.messages,
      options: { ...current.options, ...preferences, ...(source?.profile ? { profile: source.profile } : {}) },
      isUnread: current.isUnread,
    });
    current = record;
    writePending = false;
    unreadPending = false;
    saved(record);
  };
  const writeUnread = async () => {
    if (!current) return;
    unreadPending = true;
    await setChatUnread({ workspacePath, chatId, isUnread: current.isUnread ?? false });
    unreadPending = false;
  };
  const flush = () =>
    enqueue(async () => {
      if (writePending) await write();
      else if (unreadPending) await writeUnread();
    });
  const storage: ChatStorage = {
    flush,
    async load() {
      await load();
      return current
        ? { title: current.title, messages: current.messages, config: readRunConfig(current.options ?? {}) }
        : null;
    },
    save(record) {
      return enqueue(async () => {
        await load();
        // Opening a new composer and choosing capabilities does not create an empty history entry.
        if (!current && !record.messages.length) return;
        current = {
          id: chatId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          ...current,
          title: record.title,
          messages: record.messages,
          options: { ...current?.options, ...record.config, ...preferences },
        };
        await write();
      });
    },
  };
  return {
    storage,
    async loadSource(): Promise<unknown> {
      await load();
      return current
        ? {
            workspaceId: current.workspaceId,
            origin: current.origin,
            profile: current.options?.profile,
          }
        : undefined;
    },
    saveProfile() {
      return enqueue(async () => {
        await load();
        if (!writePending && JSON.stringify(current?.options?.profile) === JSON.stringify(readSource?.()?.profile))
          return;
        await write();
      });
    },
    async loadPreferences() {
      await load();
      return preferences;
    },
    savePreferences(value: ViewPreferences) {
      return enqueue(async () => {
        await load();
        preferences = { ...value };
        await write();
      });
    },
    setUnread(value: boolean) {
      return enqueue(async () => {
        await load();
        if (current) {
          current = { ...current, isUnread: value };
          await writeUnread();
        }
      });
    },
    flush,
  };
}
