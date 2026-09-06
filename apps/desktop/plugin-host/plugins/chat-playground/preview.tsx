// Development-only host adapter. This file is not included in the plugin package.
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { isTauri } from "@tauri-apps/api/core";
import { PluginFrame } from "../../../src/features/pages/plugin-ui/plugin-frame";
import {
  createChatSession,
  createChatService,
  type ChatRuntime,
  type ChatRecord,
  type ChatResources,
  type ChatSession,
} from "../../../src/chat/core";
import { createPluginChatHost } from "../../../src/chat/desktop/plugin";
import type { DesktopChatService, DesktopSessionInput } from "../../../src/chat/desktop/service";
import type { PluginUiPlugin } from "../../../src/api/plugins";
import type { ChatMeta } from "../../../src/api/chat";
import script from "./dist/isle/isle-ui.js?raw";
import style from "./dist/isle/isle-ui.css?raw";
import "../../../src/App.css";

if (isTauri()) throw new Error("此预览仅使用 Web 内存数据，不连接真实宿主");
type Listener = Parameters<ChatRuntime["subscribe"]>[0];
type Event = Parameters<Listener>[0]["event"];
type WithoutTask<T> = T extends unknown ? Omit<T, "taskId"> : never;
const listeners = new Set<Listener>();
const sources = new Map<string, () => unknown>();
const records = new Map<string, ChatRecord>();
const metadata = new Map<string, ChatMeta & { workspacePath: string }>();
const locations = new Map<string, { workspacePath: string }>();
const timers = new Map<string, ReturnType<typeof setInterval>>();
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
  models: ["preview-model", "alternate-model"].map((value, index) => ({
    value,
    label: index ? "备用预览模型" : "预览模型",
    selectedLabel: index ? "备用预览" : "预览模型",
    description: "内存模拟，不调用真实模型",
    isDefault: !index,
  })),
  tools: [{ value: "chat_playground_echo", label: "调试回显", description: "回显文本及其字符数", isDefault: true }],
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
            if (
              (turn.input.text.includes("工具") || turn.input.text.includes("chat_playground_echo")) &&
              turn.config.selectedToolNames.includes("chat_playground_echo")
            ) {
              emit(turn.taskId, {
                type: "tool_execution_start",
                toolCallId: `${turn.taskId}-echo`,
                toolName: "chat_playground_echo",
                args: { text: "Hello Isle 👋" },
              });
              emit(turn.taskId, {
                type: "tool_execution_end",
                toolCallId: `${turn.taskId}-echo`,
                toolName: "chat_playground_echo",
                result: { echo: "Hello Isle 👋", characters: 12 },
                isError: false,
              });
            }
            if (turn.input.text.includes("追问")) {
              emit(turn.taskId, {
                type: "question",
                questionId: `${turn.taskId}-question`,
                question: "预览追问：你希望回复详细还是简洁？",
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
      catalog: { load: async () => structuredClone(resources) },
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
  closePlugin: async (pluginId: string) =>
    Promise.all(
      manager
        .listSessions()
        .filter((session) => session.identity.scope.startsWith(`plugin:${pluginId}:workspace:`))
        .map((session) => manager.closeSession(session.identity)),
    ),
  loadRecordSource: async (workspacePath: string, chatId: string) =>
    structuredClone(sources.get(JSON.stringify([workspacePath, chatId]))?.()),
  listRecords: async (workspacePath: string) =>
    [...metadata.values()].filter((item) => item.workspacePath === workspacePath),
} as unknown as DesktopChatService;
const host = createPluginChatHost(service, {
  workspaces: async () => [
    { id: "preview", name: "调试工作区", isDefault: true },
    { id: "alternate", name: "隔离工作区", isDefault: false },
  ],
  authorize: async (_pluginId, workspaceId) => {
    await gate;
    if (!["preview", "alternate"].includes(workspaceId)) throw new Error("无效预览工作区");
    return { workspacePath: `/memory/${workspaceId}`, knowledge: true };
  },
});
const plugin: PluginUiPlugin = {
  runtimeKind: "isle",
  id: "@isle/chat-playground",
  name: "聊天调试台",
  version: "0.1.0",
  description: "",
  source: "bundled",
  tools: [{ name: "chat_playground_echo", description: "调试回显", parameters: {} }],
  error: null,
  ui: { kind: "sandbox", layout: "full" },
  uiError: null,
  compatibility: [],
  permissions: ["chat", "workspace-files", "chat-knowledge"],
  permissionStatus: "declared",
};
const loadDocument = async () => ({ script, style });
function Preview() {
  const [paused, setPaused] = useState(false);
  const [dark, setDark] = useState(false);
  const [, refresh] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => refresh((value) => value + 1), 250);
    return () => clearInterval(timer);
  }, []);
  return (
    <main style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <header
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          padding: "8px 14px",
          fontSize: 11,
          background: "#163e36",
          color: "#e5f6ef",
        }}
      >
        <strong>内存预览 · 不调用真实模型、不写入真实历史</strong>
        <span>
          会话 {manager.listSessions().length} / 订阅 {listeners.size} / 派发 {dispatches} / 保存 {writes}
        </span>
        <button
          type="button"
          onClick={() => {
            if (paused) {
              gate = undefined;
              resume?.();
            } else gate = new Promise((done) => (resume = done));
            setPaused(!paused);
          }}
        >
          {paused ? "恢复授权" : "暂停授权"}
        </button>
        <button
          type="button"
          onClick={() => {
            document.documentElement.classList.toggle("dark", !dark);
            setDark(!dark);
          }}
        >
          {dark ? "浅色预览" : "深色预览"}
        </button>
      </header>
      <PluginFrame plugin={plugin} chatHost={host} loadDocument={loadDocument} />
    </main>
  );
}
const root = createRoot(document.getElementById("root")!);
root.render(
  <StrictMode>
    <Preview />
  </StrictMode>,
);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    root.unmount();
    resume?.();
    for (const taskId of timers.keys()) finishTimer(taskId);
    void Promise.all(manager.listSessions().map((session) => manager.closeSession(session.identity)));
  });
}
