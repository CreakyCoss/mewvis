import type {
  PluginChatEvent,
  PluginChatCreateInput,
  PluginChatRequest,
  ChatContext,
  ChatSession,
  PluginChatSummary,
} from "@isle/plugin-sdk/chat";
import type { DesktopChatService } from "./service";
import type { ChatProfile } from "./catalog";

type Access = { workspacePath: string; knowledge: boolean };
type SessionInput = PluginChatCreateInput & { chatId: string };
type Entry = { input: SessionInput; profile: ChatProfile; session: ChatSession; revision: number; detach(): void };
type Options = {
  authorize(pluginId: string, workspaceId: string): Promise<Access>;
  workspaces?: (pluginId: string) => Promise<{ id: string; name: string; isDefault: boolean }[]>;
  tools?: (pluginId: string) => Promise<string[]>;
};
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("聊天参数必须是对象");
  return value as Record<string, unknown>;
};
const only = (value: Record<string, unknown>, keys: string[]) => {
  if (Object.keys(value).some((key) => !keys.includes(key))) throw new Error("包含不支持的聊天参数");
};
const string = (value: unknown, max = 256) => {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error("聊天参数字符串无效");
  return value;
};
const strings = (value: unknown) => {
  if (!Array.isArray(value) || value.length > 256) throw new Error("能力选择必须是数组");
  return [...new Set(value.map((item) => string(item)))];
};
function context(value: unknown): ChatContext {
  const input = record(value);
  only(input, ["systemPrompt", "requestContext", "runtimeInstruction"]);
  for (const value of Object.values(input))
    if (typeof value !== "string" || value.length > 64_000) throw new Error("场景上下文无效");
  return input;
}
function parseCreate(value: unknown): PluginChatCreateInput {
  const input = record(value);
  only(input, ["workspaceId", "sceneId", "profile"]);
  const profile = record(input.profile);
  only(profile, ["id", "systemPrompt", "context", "allowedToolNames", "useKnowledge"]);
  if (profile.useKnowledge !== undefined && typeof profile.useKnowledge !== "boolean")
    throw new Error("useKnowledge 必须是布尔值");
  return {
    workspaceId: string(input.workspaceId),
    sceneId: string(input.sceneId),
    profile: {
      id: string(profile.id),
      systemPrompt: string(profile.systemPrompt, 64_000),
      context: profile.context === undefined ? undefined : context(profile.context),
      allowedToolNames: profile.allowedToolNames === undefined ? undefined : strings(profile.allowedToolNames),
      useKnowledge: profile.useKnowledge === true,
    },
  };
}
function parseSaved(pluginId: string, workspaceId: string, chatId: string, value: unknown): SessionInput {
  const source = record(value);
  const origin = record(source.origin);
  only(origin, ["kind", "pluginId", "sceneId"]);
  if (origin.kind !== "plugin" || origin.pluginId !== pluginId || source.workspaceId !== workspaceId)
    throw new Error("未找到属于当前插件和工作区的聊天记录");
  return { ...parseCreate({ workspaceId, sceneId: origin.sceneId, profile: source.profile }), chatId };
}

/** One host owner, many authenticated connections. Plugin code never chooses its principal or disk path. */
export function createPluginChatHost(service: DesktopChatService, options: Options) {
  const entries = new Map<string, Entry>();
  const opening = new Map<string, Promise<void>>();
  const preparing = new Map<ChatSession, AbortController>();
  const authorize = async (pluginId: string, input: PluginChatCreateInput, ownedToolNames: readonly string[]) => {
    const result = await options.authorize(pluginId, input.workspaceId);
    if (input.profile.useKnowledge && !result.knowledge) throw new Error("插件未获授权使用知识库");
    if (input.profile.allowedToolNames?.some((name) => !ownedToolNames.includes(name)))
      throw new Error("插件不能选择其他插件或宿主工具");
    return result;
  };
  const open = async (pluginId: string, input: SessionInput, ownedToolNames: readonly string[], allowed: Access) => {
    input.profile.allowedToolNames ??= [...ownedToolNames];
    const key = JSON.stringify([pluginId, input.workspaceId, input.chatId]);
    if (opening.has(key)) await opening.get(key);
    let entry = entries.get(key);
    if (entry?.session.getSnapshot().phase === "closed") {
      entry.detach();
      entries.delete(key);
      entry = undefined;
    }
    if (!entry) {
      const promise = (async () => {
        const id = input.chatId;
        const profile: ChatProfile = {
          id: input.profile.id,
          systemPrompt: () => input.profile.systemPrompt,
          useKnowledge: input.profile.useKnowledge,
          allowedToolNames: input.profile.allowedToolNames,
          authorize: async () => {
            const current = await options.authorize(pluginId, input.workspaceId);
            if (current.workspacePath !== allowed.workspacePath || (input.profile.useKnowledge && !current.knowledge))
              throw new Error("插件会话授权已变化");
          },
          context: async () => input.profile.context ?? {},
        };
        const session = await service.openSession({
          identity: { scope: `plugin:${pluginId}:workspace:${input.workspaceId}`, id },
          workspacePath: allowed.workspacePath,
          profile,
          workspaceId: input.workspaceId,
          origin: { kind: "plugin", pluginId, sceneId: input.sceneId },
          profileSnapshot: () => input.profile,
        });
        const next = { input, profile, session, revision: 0, detach: () => {} };
        next.detach = session.subscribe(() => {
          next.revision++;
          if (session.getSnapshot().phase === "closed" && entries.get(key) === next) {
            entries.delete(key);
            next.detach();
          }
        });
        entries.set(key, next);
      })().finally(() => opening.delete(key));
      opening.set(key, promise);
      await promise;
    } else if (
      entry.input.sceneId !== input.sceneId ||
      JSON.stringify({ ...entry.input.profile, context: undefined }) !==
        JSON.stringify({ ...input.profile, context: undefined })
    ) {
      throw new Error("同一会话不能更换场景配置；动态上下文请使用 setContext");
    }
    const result = entries.get(key)!;
    return result;
  };
  return {
    async restoreSession(workspacePath: string, chatId: string, value: unknown): Promise<ChatSession> {
      const source = record(value);
      const origin = record(source.origin);
      const pluginId = string(origin.pluginId);
      if (new TextEncoder().encode(JSON.stringify(source)).byteLength > 256 * 1024)
        throw new Error("插件聊天来源信息无效");
      const input = parseSaved(pluginId, string(source.workspaceId), chatId, source);
      if (!options.tools) throw new Error("当前宿主不支持恢复插件聊天");
      const ownedToolNames = await options.tools(pluginId);
      const allowed = await authorize(pluginId, input, ownedToolNames);
      if (allowed.workspacePath !== workspacePath) throw new Error("插件聊天工作区与记录不匹配");
      return (await open(pluginId, input, ownedToolNames, allowed)).session;
    },
    async revoke(pluginId: string) {
      const results = [];
      for (const [key, entry] of entries)
        if (JSON.parse(key)[0] === pluginId) {
          preparing.get(entry.session)?.abort();
          results.push(await service.closeSession(entry.session.identity));
        }
      return results;
    },
    connect(pluginId: string, ownedToolNames: readonly string[], emit: (event: PluginChatEvent) => void) {
      const handles = new Map<string, Entry>();
      const watches = new Map<string, { id: string; detach(): void }>();
      const requestedWatches = new Map<string, string>();
      let disposed = false;
      const envelope = (handle: string, watchId?: string): PluginChatEvent => {
        const entry = handles.get(handle)!;
        return { handle, revision: entry.revision, snapshot: entry.session.getSnapshot(), watchId };
      };
      const detach = () => {
        watches.forEach((watch) => watch.detach());
        watches.clear();
        requestedWatches.clear();
      };
      const access = async (input: PluginChatCreateInput) => {
        const result = await authorize(pluginId, input, ownedToolNames);
        if (disposed) throw new Error("插件连接已断开");
        return result;
      };
      return {
        async request(request: PluginChatRequest): Promise<unknown> {
          if (disposed) throw new Error("插件连接已断开");
          only(record(request), ["method", "handle", "input", "watchId"]);
          string(request.method, 64);
          if (new TextEncoder().encode(JSON.stringify(request)).byteLength > 256 * 1024)
            throw new Error("聊天请求超过 256 KiB");
          if (request.method === "workspaces") return options.workspaces?.(pluginId) ?? [];
          if (request.method === "list") {
            const input = record(request.input);
            only(input, ["workspaceId"]);
            const workspaceId = string(input.workspaceId);
            const allowed = await options.authorize(pluginId, workspaceId);
            const records = await service.listRecords(allowed.workspacePath);
            const summaries: PluginChatSummary[] = [];
            for (const item of records) {
              const origin = item.origin;
              if (
                origin?.kind !== "plugin" ||
                origin.pluginId !== pluginId ||
                item.workspaceId !== workspaceId ||
                typeof origin.sceneId !== "string" ||
                !origin.sceneId.trim()
              )
                continue;
              summaries.push({
                chatId: item.id,
                sceneId: origin.sceneId,
                title: item.title,
                createdAt: item.createdAt,
                updatedAt: item.updatedAt,
                messageCount: item.messageCount,
              });
            }
            const current = await options.authorize(pluginId, workspaceId);
            if (disposed || current.workspacePath !== allowed.workspacePath) throw new Error("插件授权或连接已变化");
            return summaries.sort((a, b) => b.updatedAt - a.updatedAt || b.chatId.localeCompare(a.chatId));
          }
          if (request.method === "detach") {
            disposed = true;
            detach();
            handles.clear();
            return null;
          }
          if (request.method === "create" || request.method === "open") {
            let input: SessionInput;
            if (request.method === "create") {
              input = { ...parseCreate(request.input), chatId: crypto.randomUUID() };
            } else {
              const requested = record(request.input);
              only(requested, ["workspaceId", "chatId"]);
              const workspaceId = string(requested.workspaceId);
              const chatId = string(requested.chatId);
              const allowed = await options.authorize(pluginId, workspaceId);
              const saved = await service.loadRecordSource(allowed.workspacePath, chatId);
              if (saved === undefined) throw new Error("未找到聊天记录");
              input = parseSaved(pluginId, workspaceId, chatId, saved);
            }
            const allowed = await access(input);
            const entry = await open(pluginId, input, ownedToolNames, allowed);
            if (disposed) throw new Error("插件连接已断开");
            const handle = [...handles].find(([, candidate]) => candidate === entry)?.[0] ?? crypto.randomUUID();
            handles.set(handle, entry);
            return envelope(handle);
          }
          const handle = string(request.handle);
          const entry = handles.get(handle);
          if (!entry) throw new Error("插件会话句柄无效或不属于当前连接");
          if (request.method === "watch") requestedWatches.set(handle, string(request.watchId));
          if (request.method === "unwatch") {
            if (requestedWatches.get(handle) === request.watchId) requestedWatches.delete(handle);
            if (watches.get(handle)?.id === request.watchId) {
              watches.get(handle)?.detach();
              watches.delete(handle);
            }
            return null;
          }
          if (request.method === "stop" || request.method === "close") {
            preparing.get(entry.session)?.abort();
            const result =
              request.method === "stop"
                ? await entry.session.stop()
                : service.getSession(entry.session.identity) === entry.session
                  ? await service.closeSession(entry.session.identity)
                  : { ok: true };
            return { result, event: envelope(handle) };
          }
          // Authorization is cancellable too; stop must not be overtaken by a late check.
          let preparation: AbortController | undefined;
          if (request.method === "send") {
            if (preparing.has(entry.session))
              return { result: { status: "rejected", reason: "正在准备请求" }, event: envelope(handle) };
            preparation = new AbortController();
            preparing.set(entry.session, preparation);
          }
          let allowed: Access | null;
          try {
            allowed = await Promise.race([
              access(entry.input),
              ...(preparation
                ? [
                    new Promise<null>((resolve) =>
                      preparation!.signal.addEventListener("abort", () => resolve(null), { once: true }),
                    ),
                  ]
                : []),
            ]);
          } finally {
            if (preparation && preparing.get(entry.session) === preparation) preparing.delete(entry.session);
          }
          if (!allowed || preparation?.signal.aborted)
            return { result: { status: "cancelled" }, event: envelope(handle) };
          if (service.getLocation(entry.session)?.workspacePath !== allowed.workspacePath)
            throw new Error("工作区位置已变化，请关闭并重新打开会话");
          const session = entry.session;
          if (request.method === "snapshot") return envelope(handle);
          if (request.method === "watch") {
            const id = string(request.watchId);
            if (requestedWatches.get(handle) !== id) return envelope(handle, id);
            watches.get(handle)?.detach();
            watches.set(handle, {
              id,
              detach: session.subscribe(() => {
                if (!disposed) emit(envelope(handle, id));
              }),
            });
            return envelope(handle, id);
          }
          let result: unknown;
          switch (request.method) {
            case "send": {
              const input = record(request.input);
              only(input, ["text", "blocks", "requestId"]);
              string(input.text, 128_000);
              if (input.requestId !== undefined) string(input.requestId);
              if (input.blocks !== undefined) {
                if (!Array.isArray(input.blocks) || input.blocks.length > 256) throw new Error("消息引用无效");
                for (const block of input.blocks) {
                  const part = record(block);
                  if (part.type === "text") {
                    only(part, ["type", "content"]);
                    if (typeof part.content !== "string") throw new Error("文本块无效");
                  } else if (part.type === "file-reference") {
                    only(part, ["type", "path"]);
                    const path = string(part.path, 4096);
                    if (
                      path.startsWith("/") ||
                      path.includes("\\") ||
                      path.includes(":") ||
                      path.split("/").includes("..")
                    )
                      throw new Error("文件引用必须位于授权工作区内");
                  } else if (part.type === "skill-reference") {
                    only(part, ["type", "skillKey", "name"]);
                    string(part.skillKey);
                    string(part.name);
                  } else throw new Error("不支持的消息块");
                }
              }
              result = await session.send(input as Parameters<ChatSession["send"]>[0]);
              break;
            }
            case "updateConfig": {
              if (preparing.has(session)) throw new Error("正在准备请求，不能修改运行配置");
              const patch = record(request.input);
              const resources = session.getSnapshot().resources;
              const scalar = { selectedModelId: resources.models, selectedAgentId: resources.agents };
              const arrays = {
                selectedToolNames: resources.tools?.map((x) => x.value),
                selectedSkillKeys: resources.skillGroups?.flatMap((x) => x.skills.map((s) => s.key)),
                selectedKnowledgeCollectionIds: resources.knowledgeCollections?.map((x) => x.value),
              };
              only(patch, [...Object.keys(scalar), ...Object.keys(arrays)]);
              for (const [key, choices] of Object.entries(scalar))
                if (
                  key in patch &&
                  !(key === "selectedAgentId" && patch[key] === "") &&
                  !choices?.some((choice) => choice.value === patch[key])
                )
                  throw new Error("模型或角色不可用");
              for (const [key, choices] of Object.entries(arrays))
                if (key in patch && strings(patch[key]).some((id) => !choices?.includes(id)))
                  throw new Error("能力不可用或未授权");
              result = await session.updateConfig(patch);
              break;
            }
            case "answer": {
              const input = record(request.input);
              only(input, ["questionId", "answer"]);
              result = await session.answer({
                questionId: string(input.questionId),
                answer: string(input.answer, 64_000),
              });
              break;
            }
            case "setContext":
              if (preparing.has(session) || session.getSnapshot().activeTaskId)
                throw new Error("运行期间不能修改场景上下文");
              entry.input.profile.context = structuredClone(context(request.input));
              await service.viewPersistence(session)?.saveProfile();
              result = { ok: true };
              break;

            case "refreshResources":
              result = await session.refreshResources();
              break;
            case "retryInitialization":
              result = await session.retryInitialization();
              break;
            case "retrySave":
              result = await session.retrySave();
              break;
            case "flush":
              result = await session.flush();
              break;

            default:
              throw new Error("不支持的聊天操作");
          }
          return { result: result ?? null, event: envelope(handle) };
        },
        dispose() {
          disposed = true;
          detach();
          handles.clear();
        },
      };
    },
  };
}
