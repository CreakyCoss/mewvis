import { agentPermissionOptions } from "../../src/agent-client/wire";
// Isolated browser fixture: actual migrated pages, in-memory history, no native or model calls.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Link, MemoryRouter, Route, Routes } from "react-router";
import { isTauri } from "@tauri-apps/api/core";
import {
  createChatService,
  createChatSession,
  sessionKey,
  type ChatRecord,
  type ChatRuntime,
  type ChatResources,
} from "../../src/chat/core";
import type { AgentClientAgentEvent } from "../../src/agent-client/contracts";
import { AgentRuntimeEventType as E } from "../../src/agent-client/wire";
import type { DesktopChatService, DesktopSessionInput } from "../../src/chat/desktop";
import { DesktopChatEnvironment } from "../../src/chat/desktop/react";
import { WorkspaceChatRoute } from "../../src/features/pages/chats";
import { ChatHomePage } from "../../src/features/pages/chats/home";
import { useWorkspaceStore } from "../../src/features/pages/chats/workspace-store";
import "../../src/App.css";

if (isTauri()) throw new Error("测试页仅允许 Web 内存预览");
const workspace = {
  id: "fixture",
  name: "验收工作区",
  path: "/chat-preview-fixture",
  description: "仅内存测试数据",
  isDefault: true,
  isPinned: false,
  order: 0,
  groupId: null,
  createdAt: 1,
  updatedAt: 1,
};
const resources: ChatResources = {
  permissionOptions: structuredClone([...agentPermissionOptions]),
  models: ["模型 A", "模型 B"].map((label, index) => ({
    value: `m${index}`,
    label,
    selectedLabel: label,
    description: "测试 Runtime，无凭据",
    isDefault: index === 0,
  })),
  agents: [{ value: "writer", label: "写作助手", description: "测试角色", isDefault: false }],
  skillGroups: [
    {
      value: "skills",
      label: "工作区技能",
      description: "",
      isDefault: true,
      skills: [{ key: "skill", name: "review", label: "审阅", description: "测试技能" }],
    },
  ],
  tools: ["read", "ask_user"].map((name) => ({ value: name, label: name, description: "测试工具", isDefault: true })),
  knowledgeCollections: [{ value: "knowledge", label: "项目知识库", description: "测试知识库", isDefault: true }],
};
const history = new Map<string, ChatRecord>();
history.set(sessionKey({ scope: "workspace:fixture", id: "preview" }), {
  title: "Chat 页面验收",
  config: {
    selectedModelId: "m1",
    selectedSkillKeys: ["skill"],
    selectedToolNames: ["read", "ask_user"],
    selectedKnowledgeCollectionIds: ["knowledge"],
  },
  messages: [
    {
      id: "u",
      role: "user",
      status: "done",
      createdAt: 1,
      blocks: [{ id: "ub", type: "text", content: "请梳理当前工作区的实现边界。" }],
    },
    {
      id: "a",
      role: "assistant",
      status: "done",
      createdAt: 2,
      blocks: [
        { id: "thought", type: "thinking", content: "先确认现有模块的职责，再检查依赖方向。" },
        {
          id: "tool",
          type: "tool",
          toolCallId: "read-1",
          name: "read",
          status: "done",
          events: [{ id: "output", kind: "output", content: "读取 README.md 完成" }],
        },
        {
          id: "ab",
          type: "text",
          content:
            "当前会话复用同一套执行能力。\n\n- 核心持有任务和语义消息。\n- React 负责输入与展示。\n- 宿主连接工作区、Pi 和存储。\n\n你可以继续输入，或发送「追问」测试回答流程。",
        },
      ],
    },
  ],
});
let writes = 0;
const owner = createChatService(async (input: DesktopSessionInput) => {
  const listeners = new Set<(event: AgentClientAgentEvent) => void>();
  const timers = new Map<string, ReturnType<typeof setTimeout>[]>();
  const emit = (taskId: string, event: any) => listeners.forEach((listener) => listener({ taskId, event }));
  const runtime: ChatRuntime = {
    async subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async prepare(turn, signal) {
      if (turn.input.text.includes("准备")) await new Promise((resolve) => setTimeout(resolve, 1500));
      signal.throwIfAborted();
      return {
        async dispatch() {
          emit(turn.taskId, { type: E.Started });
          const events = [
            { type: E.ThinkingDelta, delta: "检查任务配置。" },
            { type: E.ThinkingEnd, content: "检查任务配置。" },
            { type: E.TextDelta, delta: "已通过公共 ChatSession 接收请求。" },
            turn.input.text.includes("追问")
              ? { type: E.Question, questionId: `q:${turn.taskId}`, question: "下一步先检查哪一部分？" }
              : { type: E.Done, text: "已通过公共 ChatSession 接收请求。" },
          ];
          timers.set(
            turn.taskId,
            events.map((event, index) => setTimeout(() => emit(turn.taskId, event), (index + 1) * 250)),
          );
        },
      };
    },
    async abort(taskId) {
      timers.get(taskId)?.forEach(clearTimeout);
      timers.delete(taskId);
    },
    async answer(taskId, questionId, answer) {
      emit(taskId, { type: E.QuestionAnswered, questionId });
      emit(taskId, { type: E.Done, text: `收到回答：${answer}` });
    },
    async release() {
      timers.forEach((list) => list.forEach(clearTimeout));
    },
  };
  return createChatSession({
    identity: input.identity,
    runtime,
    catalog: {
      async load() {
        return structuredClone(resources);
      },
    },
    storage: {
      async load() {
        return structuredClone(history.get(sessionKey(input.identity)) ?? null);
      },
      async save(record) {
        history.set(sessionKey(input.identity), structuredClone(record));
        const status = document.getElementById("writes");
        if (status) status.textContent = `内存保存 ${++writes} 次`;
      },
    },
  });
});
const service = {
  ...owner,
  openRecord: async (input: DesktopSessionInput) => ({ session: await owner.openSession(input) }),
  subscribeRecord: () => () => {},
  getLocation: () => ({ workspacePath: workspace.path }),
  viewPersistence: () => undefined,
} as unknown as DesktopChatService;
useWorkspaceStore.setState({
  workspaces: [workspace],
  currentWorkspace: workspace,
  loadWorkspaces: async () => {},
  refreshWorkspaces: async () => {},
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DesktopChatEnvironment service={service}>
      <MemoryRouter initialEntries={["/chats/fixture/preview"]}>
        <header className="flex h-12 items-center gap-6 border-b bg-background px-6 text-sm">
          <strong>真实页面 · 内存测试数据</strong>
          <Link to="/chat">新建聊天</Link>
          <Link to="/chats/fixture/preview">恢复聊天</Link>
          <span id="writes" className="ml-auto text-muted-foreground">
            尚未保存
          </span>
        </header>
        <div className="flex h-[calc(100vh-3rem)] min-h-0 flex-col">
          <Routes>
            <Route element={<WorkspaceChatRoute />}>
              <Route path="/chat" element={<ChatHomePage />} />
              <Route path="/chats/:workspaceId/:chatId" element={null} />
            </Route>
          </Routes>
        </div>
      </MemoryRouter>
    </DesktopChatEnvironment>
  </StrictMode>,
);
