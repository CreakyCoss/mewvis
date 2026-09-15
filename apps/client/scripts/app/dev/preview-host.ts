import type { IsleToolRisk } from "@isle/app-sdk";
import type { ApplicationChatEvent } from "@isle/app-sdk/chat";
import { agentPermissionOptions } from "../../../src/agent-client/wire";
// Development adapter compiled into @isle/app-dev. Uses the real session engine with memory-only resources.
import {
  createChatSession,
  createChatService,
  type ChatRuntime,
  type ChatRecord,
  type ChatResources,
  type ChatSession,
} from "../../../src/chat/core";
import { createApplicationChatHost } from "../../../src/chat/desktop/application";
import type { DesktopChatService, DesktopSessionInput } from "../../../src/chat/desktop/service";
import type { ChatMeta } from "../../../src/api/chat";
import {
  createApplicationDataClient,
  type ApplicationDataTransport,
  type ApplicationStorageValue,
  type ApplicationWorkspace,
} from "@isle/app-sdk/data";

export function createPreviewChat(options: {
  name: string;
  permissions: readonly string[];
  tools: { name: string; description: string; risk?: IsleToolRisk }[];
  executeTool(name: string, args: Record<string, unknown>): Promise<{ value: unknown }>;
}) {
  type Listener = Parameters<ChatRuntime["subscribe"]>[0];
  type Event = Parameters<Listener>[0]["event"];
  type WithoutTask<T> = T extends unknown ? Omit<T, "taskId"> : never;
  const listeners = new Set<Listener>();
  const sources = new Map<string, () => unknown>();
  const records = new Map<string, ChatRecord>();
  const metadata = new Map<string, ChatMeta & { workspacePath: string }>();
  const locations = new Map<string, { workspacePath: string }>();
  const timers = new Map<string, ReturnType<typeof setInterval>>();
  const businessData = new Map<string, ApplicationStorageValue>();
  const workspaces: ApplicationWorkspace[] = [
    { id: "preview", name: "调试工作区", path: "/memory/preview", isDefault: true },
    { id: "alternate", name: "隔离工作区", path: "/memory/alternate", isDefault: false },
  ];
  const data: ApplicationDataTransport = {
    version: 1,
    async request(request) {
      const permission = request.method.startsWith("storage.") ? "application-data" : "application-workspaces";
      if (!options.permissions.includes(permission))
        return { ok: false, error: { code: "PERMISSION_DENIED", message: `应用未声明 ${permission} 权限` } };
      switch (request.method) {
        case "storage.getItem":
          return { ok: true, value: structuredClone(businessData.get(request.params.key) ?? null) };
        case "storage.setItem":
          businessData.set(request.params.key, structuredClone(request.params.value));
          return { ok: true, value: null };
        case "storage.removeItem":
          businessData.delete(request.params.key);
          return { ok: true, value: null };
        case "storage.clear":
          businessData.clear();
          return { ok: true, value: null };
        case "storage.keys":
          return { ok: true, value: [...businessData.keys()] };
        case "workspaces.list":
          return { ok: true, value: structuredClone(workspaces) };
        case "workspaces.get": {
          const workspace = workspaces.find((item) => item.id === request.params.id);
          return workspace
            ? { ok: true, value: { ...workspace } }
            : { ok: false, error: { code: "WORKSPACE_NOT_FOUND", message: "未找到预览工作区" } };
        }
        case "workspaces.create": {
          if (!request.params.name.trim() || request.params.path !== undefined)
            return {
              ok: false,
              error: { code: "INVALID_ARGUMENT", message: "内存预览只支持命名的虚拟目录，真实目录请在 Isle 中选择" },
            };
          const id = crypto.randomUUID();
          const workspace = { id, name: request.params.name.trim(), path: `/memory/${id}`, isDefault: false };
          workspaces.push(workspace);
          return { ok: true, value: { ...workspace } };
        }
      }
    },
  };
  let dispatches = 0;
  let writes = 0;
  let gate: Promise<void> | undefined;
  let resume: (() => void) | undefined;
  const emit = (taskId: string, event: WithoutTask<Event>) =>
    listeners.forEach((listener) => listener({ taskId, event: { ...event, taskId } as Event }));
  const finishTimer = (taskId: string) => {
    clearInterval(timers.get(taskId));
    timers.delete(taskId);
  };
  const resources: ChatResources = {
    permissionOptions: structuredClone([...agentPermissionOptions]),
    models: ["preview-model", "alternate-model"].map((value, index) => ({
      value,
      label: index ? "备用预览模型" : "预览模型",
      selectedLabel: index ? "备用预览" : "预览模型",
      description: "内存模拟，不调用真实模型",
      isDefault: !index,
    })),
    tools: options.tools.map((tool) => ({
      value: tool.name,
      label: tool.name,
      description: tool.description,
      isDefault: true,
    })),
    skillGroups: [
      {
        value: "preview-skills",
        label: "预览技能组",
        description: "仅用于目录选择演示",
        isDefault: true,
        skills: [{ key: "preview-skill", name: "preview-skill", label: "预览技能", description: "" }],
      },
    ],
    knowledgeCollections: [
      { value: "preview-knowledge", label: "预览知识库", description: "仅用于目录选择演示", isDefault: true },
    ],
  };
  const manager = createChatService(
    async ({ identity, workspacePath, workspaceId, origin, profileData, profile }: DesktopSessionInput) => {
      const key = JSON.stringify(identity);
      sources.set(JSON.stringify([workspacePath, identity.id]), () => ({
        workspaceId,
        origin,
        profile: profileData,
      }));
      locations.set(key, { workspacePath });
      const runtime: ChatRuntime = {
        authorize: async () => {
          await profile.authorize?.();
        },
        subscribe: async (listener) => {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
        prepare: async (turn, signal) => {
          signal.throwIfAborted();
          return {
            dispatch: async () => {
              signal.throwIfAborted();
              dispatches++;
              emit(turn.taskId, { type: "thinking_delta", delta: "这是一段模拟思考，正在检查共享会话与展示组件。" });
              const toolName = options.tools.find(
                (tool) => !profileData?.allowedToolNames || profileData.allowedToolNames.includes(tool.name),
              )?.name;
              if (toolName && (turn.input.text.includes("工具") || turn.input.text.includes(toolName))) {
                const args = { text: "Hello Isle 👋" };
                const toolCallId = `${turn.taskId}-tool`;
                emit(turn.taskId, { type: "tool_execution_start", toolCallId, toolName, args });
                let result: unknown;
                let isError = false;
                try {
                  result = (await options.executeTool(toolName, args)).value;
                } catch (error) {
                  result = String(error);
                  isError = true;
                }
                signal.throwIfAborted();
                emit(turn.taskId, { type: "tool_execution_end", toolCallId, toolName, result, isError });
              }
              if (turn.input.text.includes("追问")) {
                emit(turn.taskId, {
                  type: "question",
                  questionId: `${turn.taskId}-question`,
                  question: "预览追问：你希望回复详细还是简洁？",
                  expiresAt: Date.now() + 3 * 60_000,
                });
                return;
              }
              const text = `### 聊天调试台已连接\n\n这条回复由 **内存预览** 生成。正式安装后，相同界面会使用所选宿主模型。\n\n| 检查项 | 结果 |\n| --- | --- |\n| 流式文本 | 正常 |\n| 工作区隔离 | ${workspacePath.split("/").at(-1)} |\n\n\`\`\`ts\nconst session = await chat.openSession(input);\n\`\`\`\n\n${turn.context.requestContext ? `本轮上下文：${turn.context.requestContext}` : "可以切换界面、打开双视图或尝试停止。"}`;
              let offset = 0;
              const interval = setInterval(
                () => {
                  if (offset >= text.length) {
                    finishTimer(turn.taskId);
                    emit(turn.taskId, { type: "done", text });
                    return;
                  }
                  emit(turn.taskId, { type: "text_delta", delta: text.slice(offset, (offset += 16)) });
                },
                turn.input.text.includes("十个") ? 600 : 90,
              );
              timers.set(turn.taskId, interval);
            },
          };
        },
        abort: async (taskId) => finishTimer(taskId),
        answer: async (taskId, questionId, answer) => {
          emit(taskId, { type: "question_answered", questionId, answer });
          emit(taskId, { type: "text_delta", delta: `已收到预览回答：${answer}` });
          emit(taskId, { type: "done", text: `已收到预览回答：${answer}` });
        },
        release: async () => {},
      };
      return createChatSession({
        identity,
        runtime,
        context: { prepare: async () => profileData?.context ?? {} },
        catalog: {
          load: async () => ({
            ...structuredClone(resources),
            tools: resources.tools?.filter(
              (tool) => !profileData?.allowedToolNames || profileData.allowedToolNames.includes(tool.value),
            ),
          }),
        },
        storage: {
          load: async () => records.get(key) ?? null,
          save: async (record) => {
            writes++;
            records.set(key, structuredClone(record));
            metadata.set(key, {
              id: identity.id,
              path: "",
              workspacePath,
              title: record.title,
              createdAt: metadata.get(key)?.createdAt ?? Date.now(),
              updatedAt: Date.now(),
              messageCount: record.messages.length,
              workspaceId,
              origin,
            });
          },
        },
      });
    },
  );
  const service = {
    ...manager,
    getLocation: (session: ChatSession) => locations.get(JSON.stringify(session.identity)),
    viewPersistence: () => undefined,
    updateContext: async (session: any, context: any) => {
      if (session.getSnapshot().activeTaskId) throw new Error("运行期间不能修改场景上下文");
      const location = locations.get(JSON.stringify(session.identity));
      const source = sources.get(JSON.stringify([location!.workspacePath, session.identity.id]))?.() as any;
      if (source?.profile) source.profile.context = structuredClone(context);
    },
    closeApplication: async (applicationId: string) =>
      Promise.all(
        manager
          .listSessions()
          .filter((session) => session.identity.scope.startsWith(`application:${applicationId}:workspace:`))
          .map((session) => manager.closeSession(session.identity)),
      ),
    loadRecordSource: async (workspacePath: string, chatId: string) =>
      structuredClone(sources.get(JSON.stringify([workspacePath, chatId]))?.()),
    listRecords: async (workspacePath: string) =>
      [...metadata.values()].filter((item) => item.workspacePath === workspacePath),
  } as unknown as DesktopChatService;
  const dataClient = createApplicationDataClient(data);
  const host = createApplicationChatHost(service, {
    toolCatalog: async () => {
      if (!options.permissions.includes("chat")) throw new Error("应用未声明 chat 权限");
      return options.tools.map((tool) => ({
        name: tool.name,
        label: tool.name,
        description: tool.description ?? "",
        source: "application" as const,
        risk: tool.risk,
        enabled: true,
      }));
    },
    authorize: async (_applicationId, workspaceId) => {
      await gate;
      if (!options.permissions.includes("chat")) throw new Error("应用未声明 chat 权限");
      const workspace = await dataClient.workspaces.get(workspaceId);
      return { workspacePath: workspace.path, knowledge: options.permissions.includes("chat-knowledge") };
    },
  });

  const observers = new Set<(event: ApplicationChatEvent) => void>();
  const connection = host.connect(
    options.name,
    options.tools.map((tool) => tool.name),
    (event) => observers.forEach((listener) => listener(event)),
  );
  return {
    data,
    transport: {
      request: connection.request,
      subscribe(listener: (event: ApplicationChatEvent) => void) {
        observers.add(listener);
        return () => {
          observers.delete(listener);
        };
      },
    },
    stats: () => ({ sessions: manager.listSessions().length, subscriptions: listeners.size, dispatches, writes }),
    pause(paused: boolean) {
      if (paused)
        gate ??= new Promise((done) => {
          resume = done;
        });
      else {
        gate = undefined;
        resume?.();
      }
    },
    async dispose() {
      resume?.();
      connection.dispose();
      observers.clear();
      for (const taskId of timers.keys()) finishTimer(taskId);
      await Promise.all(manager.listSessions().map((session) => manager.closeSession(session.identity)));
    },
  };
}
