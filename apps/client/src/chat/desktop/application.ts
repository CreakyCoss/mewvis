import type {
  ApplicationChatEvent,
  ApplicationChatCreateInput,
  ApplicationChatRequest,
  ApplicationChatSummary,
  ApplicationModelOption,
} from "@isle/app-sdk/chat";
import type { ChatContext, ChatSession } from "../core";
import type { DesktopChatService, DesktopSessionInput } from "./service";
import type { ChatProfile } from "./catalog";
import type { ApplicationTool } from "@isle/app-sdk/tools";

type Access = { workspacePath: string; knowledge: boolean };
type SessionInput = ApplicationChatCreateInput & { chatId: string };
type Entry = { session: ChatSession; input: SessionInput };
type Options = {
  models?: (applicationId: string) => Promise<ApplicationModelOption[]>;
  deleteRecord?: (workspacePath: string, chatId: string) => Promise<unknown>;
  authorize(applicationId: string, workspaceId: string): Promise<Access>;
  tools?: (applicationId: string) => Promise<string[]>;
  toolCatalog?: (applicationId: string) => Promise<ApplicationTool[]>;
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
function sceneSkills(value: unknown): NonNullable<ApplicationChatCreateInput["profile"]["skills"]> {
  if (!Array.isArray(value) || value.length > 64) throw new Error("场景技能列表无效");
  const keys = new Set<string>();
  return value.map((item) => {
    const skill = record(item);
    only(skill, ["key", "name", "label", "description", "content"]);
    const key = string(skill.key);
    if (keys.has(key)) throw new Error("场景技能重复");
    keys.add(key);
    return {
      key,
      name: string(skill.name),
      description: string(skill.description, 4096),
      content: string(skill.content, 64000),
      ...(skill.label === undefined ? {} : { label: string(skill.label) }),
    };
  });
}
function sceneSkillGroup(value: unknown) {
  const group = record(value);
  only(group, ["label", "description"]);
  return {
    label: string(group.label),
    ...(group.description === undefined ? {} : { description: string(group.description, 4096) }),
  };
}
function parseCreate(value: unknown): ApplicationChatCreateInput {
  const input = record(value);
  only(input, ["workspaceId", "sceneId", "profile"]);
  const profile = record(input.profile);
  only(profile, [
    "id",
    "systemPrompt",
    "context",
    "allowedToolNames",
    "useKnowledge",
    "introduction",
    "skills",
    "skillGroup",
  ]);
  if (profile.useKnowledge !== undefined && typeof profile.useKnowledge !== "boolean")
    throw new Error("useKnowledge 必须是布尔值");
  return {
    workspaceId: string(input.workspaceId),
    sceneId: string(input.sceneId),
    profile: {
      id: string(profile.id),
      ...(profile.skills === undefined ? {} : { skills: sceneSkills(profile.skills) }),
      ...(profile.skillGroup === undefined ? {} : { skillGroup: sceneSkillGroup(profile.skillGroup) }),
      ...(profile.introduction === undefined ? {} : { introduction: string(profile.introduction, 16000) }),
      systemPrompt: string(profile.systemPrompt, 64_000),
      context: profile.context === undefined ? undefined : context(profile.context),
      allowedToolNames: profile.allowedToolNames === undefined ? undefined : strings(profile.allowedToolNames),
      useKnowledge: profile.useKnowledge === true,
    },
  };
}
function parseSaved(applicationId: string, workspaceId: string, chatId: string, value: unknown): SessionInput {
  const source = record(value);
  const origin = record(source.origin);
  only(origin, ["kind", "applicationId", "sceneId"]);
  if (origin.kind !== "application" || origin.applicationId !== applicationId || source.workspaceId !== workspaceId)
    throw new Error("未找到属于当前应用和工作区的聊天记录");
  return { ...parseCreate({ workspaceId, sceneId: origin.sceneId, profile: source.profile }), chatId };
}

/** One host owner, many authenticated connections. Application code never chooses its principal or disk path. */
export function createApplicationChatHost(service: DesktopChatService, options: Options) {
  const revisions = new WeakMap<ChatSession, { snapshot: ReturnType<ChatSession["getSnapshot"]>; revision: number }>();
  const revisionOf = (session: ChatSession) => {
    const snapshot = session.getSnapshot();
    const previous = revisions.get(session);
    if (previous?.snapshot === snapshot) return previous.revision;
    const revision = (previous?.revision ?? -1) + 1;
    revisions.set(session, { snapshot, revision });
    return revision;
  };
  const authorize = async (
    applicationId: string,
    input: ApplicationChatCreateInput,
    assignedToolNames: readonly string[],
  ) => {
    const result = await options.authorize(applicationId, input.workspaceId);
    if (input.profile.useKnowledge && !result.knowledge) throw new Error("应用未获授权使用知识库");
    const catalog = options.toolCatalog ? await options.toolCatalog(applicationId) : undefined;
    const toolNames = catalog
      ? catalog.map((tool) => tool.name)
      : options.tools
        ? await options.tools(applicationId)
        : assignedToolNames;
    const effectiveNames = toolNames.filter(
      (name) =>
        (!catalog || catalog.some((tool) => tool.name === name && tool.enabled)) &&
        (!input.profile.allowedToolNames || input.profile.allowedToolNames.includes(name)),
    );
    return { ...result, toolNames, effectiveNames, catalog };
  };
  const resolveInput = (
    applicationId: string,
    input: SessionInput,
    assignedToolNames: readonly string[],
    allowed: Awaited<ReturnType<typeof authorize>>,
  ): DesktopSessionInput => {
    let effectiveNames = allowed.effectiveNames;
    const profile: ChatProfile = {
      id: input.profile.id,
      skills: input.profile.skills?.map((skill) => ({ ...skill, source: "system", path: "" })),
      skillGroup: input.profile.skillGroup,
      initialMessages: input.profile.introduction
        ? [
            {
              id: `introduction:${input.chatId}`,
              role: "assistant",
              status: "done",
              createdAt: Date.now(),
              blocks: [{ id: `introduction-text:${input.chatId}`, type: "text", content: input.profile.introduction }],
            },
          ]
        : undefined,
      systemPrompt: () => input.profile.systemPrompt,
      useKnowledge: input.profile.useKnowledge,
      resolveToolNames: () => effectiveNames,
      toolCatalog: options.toolCatalog
        ? async () => {
            const current = await authorize(applicationId, input, assignedToolNames);
            if (current.workspacePath !== allowed.workspacePath) throw new Error("应用会话授权已变化");
            effectiveNames = current.effectiveNames;
            return current.catalog!.filter((tool) => effectiveNames.includes(tool.name));
          }
        : undefined,
      authorize: async () => {
        const current = await authorize(applicationId, input, assignedToolNames);
        if (current.workspacePath !== allowed.workspacePath) throw new Error("应用会话授权已变化");
        effectiveNames = current.effectiveNames;
      },
    };
    return {
      identity: { scope: `application:${applicationId}:workspace:${input.workspaceId}`, id: input.chatId },
      workspacePath: allowed.workspacePath,
      workspaceId: input.workspaceId,
      origin: { kind: "application", applicationId, sceneId: input.sceneId },
      profile,
      profileData: input.profile,
    };
  };
  return {
    async resolveSession(workspacePath: string, chatId: string, value: unknown): Promise<DesktopSessionInput> {
      const source = record(value);
      const origin = record(source.origin);
      const applicationId = string(origin.applicationId);
      if (new TextEncoder().encode(JSON.stringify(source)).byteLength > 256 * 1024)
        throw new Error("应用聊天来源信息无效");
      const input = parseSaved(applicationId, string(source.workspaceId), chatId, source);
      if (!options.tools && !options.toolCatalog) throw new Error("当前宿主不支持恢复应用聊天");
      const allowed = await authorize(applicationId, input, []);
      if (allowed.workspacePath !== workspacePath) throw new Error("应用聊天工作区与记录不匹配");
      return resolveInput(applicationId, input, allowed.toolNames, allowed);
    },
    revoke: (applicationId: string) => service.closeApplication(applicationId),
    connect(applicationId: string, assignedToolNames: readonly string[], emit: (event: ApplicationChatEvent) => void) {
      const handles = new Map<string, Entry>();
      const watches = new Map<string, { id: string; detach(): void }>();
      const requestedWatches = new Map<string, string>();
      let disposed = false;
      const envelope = (handle: string, watchId?: string): ApplicationChatEvent => {
        const entry = handles.get(handle)!;
        return { handle, revision: revisionOf(entry.session), snapshot: entry.session.getSnapshot(), watchId };
      };
      const detach = () => {
        watches.forEach((watch) => watch.detach());
        watches.clear();
        requestedWatches.clear();
      };
      const access = async (input: ApplicationChatCreateInput) => {
        const result = await authorize(applicationId, input, assignedToolNames);
        if (disposed) throw new Error("应用连接已断开");
        return result;
      };
      return {
        async request(request: ApplicationChatRequest): Promise<unknown> {
          if (disposed) throw new Error("应用连接已断开");
          only(record(request), ["method", "handle", "input", "watchId"]);
          string(request.method, 64);
          if (new TextEncoder().encode(JSON.stringify(request)).byteLength > 256 * 1024)
            throw new Error("聊天请求超过 256 KiB");
          if (request.method === "models") {
            only(record(request), ["method"]);
            if (!options.models) throw new Error("当前宿主不支持应用模型目录");
            const result = await options.models(applicationId);
            if (disposed) throw new Error("应用连接已断开");
            return result;
          }
          if (request.method === "delete") {
            const requested = record(request.input);
            only(requested, ["workspaceId", "chatId"]);
            const workspaceId = string(requested.workspaceId);
            const chatId = string(requested.chatId);
            const allowed = await options.authorize(applicationId, workspaceId);
            const source = await service.loadRecordSource(allowed.workspacePath, chatId);
            const input = parseSaved(applicationId, workspaceId, chatId, source);
            if (!options.deleteRecord) throw new Error("当前宿主不支持删除应用会话");
            const identity = { scope: `application:${applicationId}:workspace:${workspaceId}`, id: chatId };
            if (service.getSession(identity)) {
              const closed = await service.closeSession(identity);
              if (!closed.ok) throw new Error(closed.error);
            }
            const current = await access(input);
            if (current.workspacePath !== allowed.workspacePath) throw new Error("应用工作区已变化");
            await options.deleteRecord(allowed.workspacePath, chatId);
            return null;
          }
          if (request.method === "tools") {
            only(record(request), ["method"]);
            if (!options.toolCatalog) throw new Error("当前宿主不支持应用工具目录");
            const catalog = await options.toolCatalog(applicationId);
            if (disposed) throw new Error("应用连接已断开");
            return catalog;
          }
          if (request.method === "workspaces") throw new Error("请通过 @isle/app-sdk/data 查询应用工作区");
          if (request.method === "list") {
            const input = record(request.input);
            only(input, ["workspaceId"]);
            const workspaceId = string(input.workspaceId);
            const allowed = await options.authorize(applicationId, workspaceId);
            const records = await service.listRecords(allowed.workspacePath);
            const summaries: ApplicationChatSummary[] = [];
            for (const item of records) {
              const origin = item.origin;
              if (
                origin?.kind !== "application" ||
                origin.applicationId !== applicationId ||
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
            const current = await options.authorize(applicationId, workspaceId);
            if (disposed || current.workspacePath !== allowed.workspacePath) throw new Error("应用授权或连接已变化");
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
              const allowed = await options.authorize(applicationId, workspaceId);
              const saved = await service.loadRecordSource(allowed.workspacePath, chatId);
              if (saved === undefined) throw new Error("未找到聊天记录");
              input = parseSaved(applicationId, workspaceId, chatId, saved);
            }
            const allowed = await access(input);
            const session = await service.openSession(resolveInput(applicationId, input, assignedToolNames, allowed));
            const entry = { session, input };
            if (disposed) throw new Error("应用连接已断开");
            const handle =
              [...handles].find(([, candidate]) => candidate.session === session)?.[0] ?? crypto.randomUUID();
            handles.set(handle, entry);
            return envelope(handle);
          }
          const handle = string(request.handle);
          const entry = handles.get(handle);
          if (!entry) throw new Error("应用会话句柄无效或不属于当前连接");
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
            const result =
              request.method === "stop"
                ? await entry.session.stop()
                : service.getSession(entry.session.identity) === entry.session
                  ? await service.closeSession(entry.session.identity)
                  : { ok: true };
            return { result, event: envelope(handle) };
          }
          const session = entry.session;
          // send reserves a core turn before awaiting authorization. stop cancels that same turn.
          // Other operations still authorize the authenticated connection before accessing a snapshot or configuration.
          if (request.method !== "send") {
            const allowed = await access(entry.input);
            if (service.getLocation(session)?.workspacePath !== allowed.workspacePath)
              throw new Error("工作区位置已变化，请关闭并重新打开会话");
          }
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
              const patch = record(request.input);
              const resources = session.getSnapshot().resources;
              const scalar = { selectedModelId: resources.models, selectedAgentId: resources.agents };
              const arrays = {
                selectedSkillKeys: resources.skillGroups?.flatMap((x) => x.skills.map((s) => s.key)),
                selectedKnowledgeCollectionIds: resources.knowledgeCollections?.map((x) => x.value),
              };
              only(patch, ["permissionMode", "thinkingLevel", ...Object.keys(scalar), ...Object.keys(arrays)]);
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
                answer: input.answer === null ? null : string(input.answer, 64_000),
              });
              break;
            }
            case "setContext":
              await service.updateContext(session, context(request.input));
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
