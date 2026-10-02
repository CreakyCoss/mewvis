import { agentPermissionOptions } from "../../../src/agent-client/wire";
import React, { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { platform } from "../../../src/platform";
import { ApplicationFrame } from "../../../src/workbench/pages/applications/application-frame";
import { createChatSession, createChatService, type ChatRuntime } from "../../../src/chat/core";
import { createApplicationChatHost } from "../../../src/chat/desktop/application";
import type { DesktopChatService, DesktopSessionInput } from "../../../src/chat/desktop/service";
import type { ApplicationUiApplication } from "../../../src/api/applications/index";
import script from "./fixtures/application/dist/mewvis/mewvis-ui.js?raw";
import "../../../src/App.css";

if (platform.kind !== "web") throw new Error("仅允许 Web 内存测试，不连接真实宿主");
const events = new Set<(event: any) => void>();
const sources = new Map<string, () => unknown>();
const records = new Map();
const locations = new Map();
let dispatches = 0;
let writes = 0;
let gate: Promise<void> | undefined;
let release: (() => void) | undefined;
const manager = createChatService(
  async ({ identity, workspacePath, workspaceId, origin, profileData, profile }: DesktopSessionInput) => {
    sources.set(JSON.stringify([workspacePath, identity.id]), () => ({
      workspaceId,
      origin,
      profile: profileData,
    }));
    locations.set(JSON.stringify(identity), { workspacePath });
    const key = JSON.stringify(identity);
    const runtime: ChatRuntime = {
      authorize: async () => {
        await profile.authorize?.();
      },
      subscribe: async (listener) => {
        events.add(listener);
        return () => {
          events.delete(listener);
        };
      },
      prepare: async (turn) => ({
        dispatch: async () => {
          dispatches++;
          const emit = (event: any) => events.forEach((listener) => listener({ taskId: turn.taskId, event }));
          emit({ type: "thinking_delta", delta: "检查宿主共享会话。" });
          emit({ type: "text_delta", delta: "来自同一个宿主会话的流式回复。" });
          emit({ type: "tool_execution_start", toolCallId: "tool", toolName: "own", args: {} });
          emit({ type: "tool_execution_end", toolCallId: "tool", toolName: "own", result: "完成", isError: false });
          if (turn.input.text.includes("追问"))
            emit({
              type: "question",
              questionId: "question",
              question: "需要详细说明吗？",
              expiresAt: Date.now() + 3 * 60_000,
            });
          else setTimeout(() => emit({ type: "done" }), 2000);
        },
      }),
      abort: async () => {},
      answer: async (taskId, questionId) =>
        events.forEach((listener) => listener({ taskId, event: { type: "question_answered", questionId } })),
      release: async () => {},
    };
    return createChatSession({
      identity,
      runtime,
      storage: {
        load: async () => records.get(key) ?? null,
        save: async (record) => {
          writes++;
          records.set(key, structuredClone(record));
        },
      },
      catalog: {
        load: async () => ({
          permissionOptions: structuredClone([...agentPermissionOptions]),
          models: ["model", "second"].map((value) => ({
            value,
            label: value,
            selectedLabel: value,
            description: "Fixture model",
            isDefault: value === "model",
          })),
          tools: [{ value: "own", label: "测试工具", description: "", isDefault: true }],
          skillGroups: [
            {
              value: "group",
              label: "测试技能组",
              description: "",
              isDefault: true,
              skills: [{ key: "skill", name: "skill", label: "测试技能", description: "" }],
            },
          ],
          knowledgeCollections: [{ value: "knowledge", label: "测试知识库", description: "", isDefault: true }],
        }),
      },
    });
  },
);
const service = {
  ...manager,
  getLocation: (session: any) => locations.get(JSON.stringify(session.identity)),
  viewPersistence: () => undefined,
  updateContext: async (session: any, context: any) => {
    if (session.getSnapshot().activeTaskId) throw new Error("运行期间不能修改场景上下文");
    const location = locations.get(JSON.stringify(session.identity));
    const source = sources.get(JSON.stringify([location.workspacePath, session.identity.id]))?.() as any;
    if (source?.profile) source.profile.context = structuredClone(context);
  },
  closeApplication: async (applicationId: string) =>
    Promise.all(
      manager
        .listSessions()
        .filter((session) => session.identity.scope.startsWith(`application:${applicationId}:workspace:`))
        .map((session) => manager.closeSession(session.identity)),
    ),
  loadRecordSource: async (path: string, id: string) => structuredClone(sources.get(JSON.stringify([path, id]))?.()),
} as unknown as DesktopChatService;
const host = createApplicationChatHost(service, {
  authorize: async () => {
    await gate;
    return { workspacePath: "/in-memory", knowledge: true };
  },
});
const application: ApplicationUiApplication = {
  runtimeKind: "mewvis",
  id: "fixture",
  name: "Chat integration fixture",
  version: "0.0.0",
  description: "",
  source: "bundled",
  tools: [{ name: "own", description: "Fixture", parameters: {} }],
  error: null,
  ui: { kind: "sandbox" },
  uiError: null,
  compatibility: [],
  permissions: ["chat", "workspace-files", "chat-knowledge"],
  permissionStatus: "declared",
};
const loadDocument = async () => ({ script, style: "" });
function Fixture() {
  const [paused, setPaused] = useState(false);
  const [, refresh] = useState(0);
  React.useEffect(() => {
    const timer = setInterval(() => refresh((value) => value + 1), 200);
    return () => clearInterval(timer);
  }, []);
  return (
    <main style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <header>
        内存隔离测试：宿主会话 {manager.listSessions().length}；运行订阅 {events.size}；派发 {dispatches}；保存 {writes}
        <button
          onClick={() => {
            if (paused) {
              gate = undefined;
              release?.();
            } else gate = new Promise((done) => (release = done));
            setPaused(!paused);
          }}
        >
          {paused ? "恢复授权" : "暂停授权"}
        </button>
      </header>
      <ApplicationFrame application={application} chatHost={host} loadDocument={loadDocument} />
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Fixture />
  </StrictMode>,
);
