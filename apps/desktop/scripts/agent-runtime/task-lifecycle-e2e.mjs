import assert from "node:assert/strict";
import { build } from "esbuild";
import { resolve } from "node:path";

const entry = resolve(process.cwd(), "src/features/pages/chat/utils/agent-task-lifecycle.ts");
const output = await build({
  entryPoints: [entry],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  write: false,
});
const { settleAgentMessage, settleOrphanedAgentMessages, terminalAgentTaskFromEvent } = await import(
  `data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`
);

const runnerEntry = resolve(
  process.cwd(),
  "src/features/pages/chat/components/workspace-chat-page/agent-mode-runner.ts",
);
const runnerOutput = await build({
  entryPoints: [runnerEntry],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  write: false,
});
const { runAgentTurn } = await import(
  `data:text/javascript;base64,${Buffer.from(runnerOutput.outputFiles[0].text).toString("base64")}`
);

const cancelled = terminalAgentTaskFromEvent({
  type: "state",
  taskId: "queued-task",
  taskState: "cancelled",
  workerState: "running",
});
assert.deepEqual(cancelled, { status: "error", message: "Agent 任务已取消" });

const failed = terminalAgentTaskFromEvent(
  {
    type: "state",
    taskId: "failed-task",
    taskState: "failed",
    workerState: "idle",
  },
  "模型调用异常",
);
assert.deepEqual(failed, { status: "error", message: "模型调用异常" });

const unhealthy = terminalAgentTaskFromEvent({
  type: "state",
  taskId: "hung-task",
  taskState: "running",
  workerState: "unhealthy",
});
assert.equal(unhealthy?.status, "error");

const done = terminalAgentTaskFromEvent({
  type: "state",
  taskId: "done-task",
  taskState: "done",
  workerState: "idle",
});
assert.deepEqual(done, { status: "done", message: "Agent 任务已完成。" });
assert.equal(
  terminalAgentTaskFromEvent({
    type: "state",
    taskId: "running-task",
    taskState: "running",
    workerState: "running",
  }),
  null,
);

assert.deepEqual(
  settleAgentMessage(
    {
      id: "assistant-1",
      role: "assistant",
      mode: "agent",
      text: "",
      status: "streaming",
      createdAt: 1,
    },
    cancelled,
  ),
  {
    id: "assistant-1",
    role: "assistant",
    mode: "agent",
    text: "Agent 任务已取消",
    status: "error",
    createdAt: 1,
  },
);

const hydrated = settleOrphanedAgentMessages([
  {
    id: "orphaned",
    role: "assistant",
    mode: "agent",
    text: "",
    status: "streaming",
    createdAt: 1,
  },
  {
    id: "completed",
    role: "assistant",
    mode: "agent",
    text: "已完成",
    status: "done",
    createdAt: 2,
  },
]);
assert.equal(hydrated[0].status, "error");
assert.equal(hydrated[0].text, "Agent 任务未正常结束。");
assert.equal(hydrated[1].status, "done");

let registeredTask = null;
let activeTaskId = "";
await runAgentTurn(
  {
    nextSessionId: "chat-1",
    assistantMessageId: "assistant-1",
    nextMessages: [],
    agentPromptPayload: {
      agentRoleId: "writer",
      systemPrompt: "system",
      requestContext: "",
      runtimeInstruction: "",
      userMessage: "写故事",
    },
  },
  {
    workspace: { path: "/workspace" },
    activeSkills: [],
    updateMessage: () => undefined,
    agentClient: {
      agent: {
        run: async (input) => {
          assert.equal(registeredTask?.taskId, input.taskId, "调用 Runtime 前必须注册任务，避免早到终态事件丢失。");
          assert.equal(activeTaskId, input.taskId, "调用 Runtime 前必须激活任务。");
          return { taskId: input.taskId };
        },
      },
    },
    setChatError: () => undefined,
    prepareActiveAgentRun: () => undefined,
    addRunningAgentTask: (task) => {
      registeredTask = task;
    },
    removeRunningAgentTask: () => undefined,
    activateAgentTaskId: (taskId) => {
      activeTaskId = taskId;
    },
    handledAgentDoneTaskIdsRef: { current: new Set() },
    effectiveRuntimeModel: null,
    allowedAgentTools: [],
    currentSessionTitle: "测试会话",
  },
);
assert.ok(registeredTask?.taskId);

console.log("agent task lifecycle e2e passed");
