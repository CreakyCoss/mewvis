import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const workspaceRoot = process.cwd();
const bridgePath = join(workspaceRoot, "agent-bridge/dist/index.js");
const workspacePath = mkdtempSync(join(tmpdir(), "novel-claw-bridge-e2e-"));
const sessionRootDir = join(workspacePath, "standalone-session-store", "chats", "e2e-session", "session");
const aliasSessionRootDir = join(workspacePath, "standalone-session-store", "chats", "alias-session", "session");
const sessionDirPath = sessionRootDir;
const ledgerPath = join(sessionDirPath, "ledger.jsonl");
const aliasLedgerPath = join(aliasSessionRootDir, "ledger.jsonl");
const tracePath = join(sessionDirPath, "trace.jsonl");
const contextPath = join(sessionDirPath, "context.json");

if (!existsSync(bridgePath)) {
  throw new Error("agent-bridge/dist/index.js 不存在，请先运行 pnpm build:agent-bridge");
}

const assert = (condition, message, details) => {
  if (!condition) {
    const suffix = details === undefined ? "" : `\n${JSON.stringify(details, null, 2)}`;
    throw new Error(`${message}${suffix}`);
  }
};

const readJsonLines = (filePath) =>
  readFileSync(filePath, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));

const readLedgerFile = (filePath) => {
  const [header, ...entries] = readJsonLines(filePath);
  return {
    header,
    entries,
    entry: (id) => entries.find((item) => item.id === id),
  };
};

const readLedger = () => readLedgerFile(ledgerPath);

const readContextCache = () => JSON.parse(readFileSync(contextPath, "utf8"));

const bridge = spawn(process.execPath, [bridgePath], {
  cwd: workspaceRoot,
  stdio: ["pipe", "pipe", "pipe"],
});
const seen = [];
const waiters = [];
let stdoutBuffer = "";
let stderrBuffer = "";

const safeDetails = (value) =>
  JSON.parse(JSON.stringify(value, (key, item) => key === "apiKey" ? "<redacted>" : item));

const handleLine = (line) => {
  if (!line.trim()) {
    return;
  }
  const parsed = JSON.parse(line);
  seen.push(parsed);
  for (const waiter of [...waiters]) {
    if (waiter.predicate(parsed)) {
      clearTimeout(waiter.timer);
      waiters.splice(waiters.indexOf(waiter), 1);
      waiter.resolve(parsed);
    }
  }
};

bridge.stdout.on("data", (chunk) => {
  stdoutBuffer += chunk.toString("utf8");
  let newlineIndex;
  while ((newlineIndex = stdoutBuffer.indexOf("\n")) >= 0) {
    handleLine(stdoutBuffer.slice(0, newlineIndex));
    stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
  }
});

bridge.stderr.on("data", (chunk) => {
  stderrBuffer += chunk.toString("utf8");
});

const waitFor = (predicate, label, timeoutMs = 10_000) =>
  new Promise((resolve, reject) => {
    for (const item of seen) {
      if (predicate(item)) {
        resolve(item);
        return;
      }
    }

    const waiter = {
      predicate,
      resolve,
      timer: setTimeout(() => {
        const index = waiters.indexOf(waiter);
        if (index >= 0) {
          waiters.splice(index, 1);
        }
        reject(new Error([
          `等待 ${label} 超时`,
          stderrBuffer ? `stderr:\n${stderrBuffer}` : "",
          `recent events:\n${JSON.stringify(seen.slice(-8).map(safeDetails), null, 2)}`,
        ].filter(Boolean).join("\n\n")));
      }, timeoutMs),
    };
    waiters.push(waiter);
  });

const send = (command) => {
  bridge.stdin.write(`${JSON.stringify(command)}\n`);
};

const request = async (command, resultType, timeoutMs) => {
  send(command);
  return waitFor(
    (item) => item.requestId === command.requestId && item.type === resultType,
    `${command.type}:${command.requestId}:${resultType}`,
    timeoutMs,
  );
};

const lineStartingWith = (text, prefix) =>
  text.split("\n").find((line) => line.startsWith(prefix)) ?? "";

const bridgeResources = (allowed = ["read"]) => ({
  tools: {
    allowed,
  },
  skills: {
    enabled: [],
  },
});

const sendMessageCommand = ({
  requestId,
  mode,
  taskId,
  agentId,
  workspacePath,
  sessionRootDir,
  agentRoleId,
  stream,
  streamId,
  systemPrompt,
  userMessage,
  requestContext,
  runtimeInstruction,
  bootstrapInstruction,
  runtimeModel,
  resources,
}) => ({
  type: "send_message",
  requestId,
  session: {
    workspacePath,
    sessionRootDir,
  },
  agent: {
    agentId,
    agentRoleId,
  },
  input: {
    systemPrompt,
    userMessage,
    requestContext,
    runtimeInstruction,
    bootstrapInstruction,
  },
  runtime: {
    mode,
    taskId,
    stream,
    streamId,
    model: runtimeModel,
    resources,
  },
});

const chatCommand = ({
  requestId,
  agentId,
  workspacePath,
  sessionRootDir,
  stream,
  streamId,
  systemPrompt,
  userMessage,
  requestContext,
  runtimeInstruction,
  runtimeModel,
  messages,
}) => ({
  type: "chat",
  requestId,
  session: workspacePath
    ? {
      workspacePath,
      sessionRootDir,
    }
    : null,
  agent: {
    agentId,
  },
  input: {
    systemPrompt,
    userMessage,
    requestContext,
    runtimeInstruction,
    messages,
  },
  runtime: {
    stream,
    streamId,
    model: runtimeModel,
  },
});

const cleanup = async () => {
  bridge.stdin.end();
  await new Promise((resolve) => {
    bridge.once("close", resolve);
  });
  rmSync(workspacePath, { recursive: true, force: true });
};

try {
  const list = await request({ type: "list_agents", requestId: "list" }, "agent_definitions");
  assert(list.defaultAgentId === "pi", "默认 agent 应保持为 pi", list);
  assert(
    list.agents.some((agent) => agent.id === "mock" && agent.capabilities.includes("agent")),
    "mock agent 应可用",
    list,
  );
  assert(
    list.agents.some((agent) => agent.id === "pi" && agent.requiresModel),
    "pi agent 应可用",
    list,
  );

  const aliasSystemPrompt = "send_message alias 初始系统提示词。";
  const aliasCreated = await request({
    type: "create_session",
    requestId: "alias-create-session",
    workspacePath,
    sessionRootDir: aliasSessionRootDir,
    systemPrompt: aliasSystemPrompt,
    metadata: { uiSessionId: "alias-session" },
  }, "session_mutation_result");
  assert(
    aliasCreated.messageRecordId &&
      aliasCreated.messages.length === 1 &&
      aliasCreated.messages[0]?.role === "system" &&
      aliasCreated.messages[0]?.content === aliasSystemPrompt,
    "create_session 应初始化独立 bridge session 并写入 systemPrompt",
    aliasCreated,
  );

  const aliasChatResult = await request(sendMessageCommand({
    requestId: "alias-send-chat",
    mode: "chat",
    agentId: "mock",
    workspacePath,
    sessionRootDir: aliasSessionRootDir,
    stream: false,
    userMessage: "send_message chat 用户消息",
    requestContext: "send_message chat 本次引用资料。",
    runtimeInstruction: "send_message chat 本轮临时说明。",
    runtimeModel: null,
  }), "chat_result");
  assert(
    aliasChatResult.text.includes(`系统提示词：${aliasSystemPrompt}`) &&
      aliasChatResult.text.includes("收到的最后一条用户消息：send_message chat 用户消息") &&
      aliasChatResult.text.includes("请求上下文：send_message chat 本次引用资料。"),
    "send_message chat 应使用 create_session 缓存的 systemPrompt，并传递 userMessage/requestContext",
    aliasChatResult,
  );
  assert(aliasChatResult.bridgeSession?.userMessageRecordId, "send_message chat 应返回 bridge user messageRecordId", aliasChatResult);

  const aliasAfterChat = await request({
    type: "read_session",
    requestId: "alias-read-after-chat",
    workspacePath,
    sessionRootDir: aliasSessionRootDir,
  }, "session_result");
  assert(
    aliasAfterChat.messages.map((message) => message.role).join("|") === "system|user|assistant" &&
      aliasAfterChat.messages.at(-2)?.content === "send_message chat 用户消息" &&
      aliasAfterChat.requestContexts?.at(-1)?.content === "send_message chat 本次引用资料。" &&
      aliasAfterChat.runtimeInstructions?.at(-1)?.content === "send_message chat 本轮临时说明。",
    "send_message chat 应按 ledger 标准记录消息和 data-only entries",
    aliasAfterChat,
  );

  const aliasAgentTaskId = "alias-send-agent-task";
  const aliasAgentRoleId = "alias-agent-role";
  send(sendMessageCommand({
    requestId: aliasAgentTaskId,
    mode: "agent",
    taskId: aliasAgentTaskId,
    agentId: "mock",
    workspacePath,
    sessionRootDir: aliasSessionRootDir,
    agentRoleId: aliasAgentRoleId,
    userMessage: "send_message agent 用户消息",
    runtimeInstruction: "send_message agent 临时执行说明。",
    runtimeModel: { contextWindow: 4096, maxTokens: 1024 },
    resources: {
      tools: {
        allowed: ["read"],
      },
      skills: {
        enabled: [],
      },
      mcp: {
        servers: [],
      },
    },
  }));
  const aliasAgentDone = await waitFor(
    (item) => item.type === "done" && item.taskId === aliasAgentTaskId,
    "alias send_message agent done",
  );
  const aliasAgentTaskResult = await waitFor(
    (item) => item.type === "task_result" && item.requestId === aliasAgentTaskId,
    "alias send_message agent task_result",
  );
  assert(aliasAgentTaskResult.success === true, "send_message agent 应成功", aliasAgentTaskResult);
  assert(
    lineStartingWith(aliasAgentDone.text, "系统提示词：") === `系统提示词：${aliasSystemPrompt}` &&
      aliasAgentDone.text.includes("用户消息：send_message agent 用户消息"),
    "send_message agent 应使用 create_session 缓存的 systemPrompt，并传递 userMessage",
    aliasAgentDone.text,
  );
  const aliasAgentSessionDir = join(aliasSessionRootDir, "agents", "mock", aliasAgentRoleId);
  assert(
    existsSync(aliasAgentSessionDir),
    "send_message agent 应按 runtimeId/agentRoleId 创建稳定 agent session 目录",
    aliasAgentSessionDir,
  );
  const aliasAfterAgent = await request({
    type: "read_session",
    requestId: "alias-read-after-agent",
    workspacePath,
    sessionRootDir: aliasSessionRootDir,
  }, "session_result");
  assert(
    aliasAfterAgent.messages.at(-2)?.content === "send_message agent 用户消息" &&
      aliasAfterAgent.messages.at(-2)?.metadata?.agentRoleId === aliasAgentRoleId &&
      aliasAfterAgent.messages.at(-1)?.role === "assistant",
    "send_message agent 应写回标准 bridge user/assistant 消息",
    aliasAfterAgent.messages,
  );
  const aliasLedger = readLedgerFile(aliasLedgerPath);
  assert(aliasLedger.header.sessionRootDir === aliasSessionRootDir, "alias ledger header 应记录独立 sessionRootDir", aliasLedger.header);
  assert(
    aliasLedger.entry(aliasCreated.messageRecordId)?.message?.metadata?.source === "app_create_session",
    "create_session system message 应使用 app_create_session metadata",
    aliasLedger.entry(aliasCreated.messageRecordId),
  );

  const initialAgentRoleId = "mock-agent-stable-id";
  const initialUserMessage = "请写一个测试章节，并保持上下文链路可追踪。";
  const expectedAgentSessionId = `mock/${initialAgentRoleId}`;
  const expectedAgentSessionDir = join(sessionDirPath, "agents", ...expectedAgentSessionId.split("/"));
  assert(
    !initialAgentRoleId.includes(sessionRootDir) &&
      !initialAgentRoleId.includes("/agents/") &&
      !initialAgentRoleId.includes(expectedAgentSessionDir),
    "agentRoleId 不应包含 sessionRootDir、agents 路径段或物理目录",
    initialAgentRoleId,
  );

  const taskId = "mock-task-1";
  send(sendMessageCommand({
    mode: "agent",
    requestId: taskId,
    taskId,
    agentId: "mock",
    workspacePath,
    sessionRootDir,
    agentRoleId: initialAgentRoleId,
    systemPrompt: "E2E Agent 初始系统提示词。",
    userMessage: initialUserMessage,
    runtimeModel: { contextWindow: 4096, maxTokens: 1024 },
    resources: bridgeResources(["read", "write"]),
  }));
  const done = await waitFor((item) => item.type === "done" && item.taskId === taskId, "mock done");
  const taskResult = await waitFor(
    (item) => item.type === "task_result" && item.requestId === taskId,
    "mock task_result",
  );
  assert(taskResult.success === true, "mock send_message agent 应成功", taskResult);
  assert(
    done.bridgeSession?.userMessageRecordId && done.bridgeSession?.assistantMessageRecordId,
    "done 事件应携带 bridge messageRecordIds",
    done,
  );
  assert(
    existsSync(expectedAgentSessionDir),
    "send_message agent 应在 bridge session 下创建稳定 agent session 目录",
    expectedAgentSessionDir,
  );
  assert(
    expectedAgentSessionDir.startsWith(sessionDirPath),
    "agentSessionDir 应位于 bridge sessionRootDir 下",
    expectedAgentSessionDir,
  );

  const afterTask = await request({
    type: "read_session",
    requestId: "read-after-task",
    workspacePath,
    sessionRootDir,
  }, "session_result");
  assert(afterTask.messages.length === 3, "任务应记录 system、user 和 assistant 三条消息", afterTask.messages);
  assert(
    afterTask.messages.map((message) => message.role).join("|") === "system|user|assistant",
    "任务消息角色顺序应保持为 system -> user -> assistant",
    afterTask.messages,
  );
  const taskSystemMessage = afterTask.messages[0];
  const taskUserMessage = afterTask.messages[1];
  const taskAssistantMessage = afterTask.messages[2];
  assert(
    taskSystemMessage?.content === "E2E Agent 初始系统提示词。" &&
      taskSystemMessage?.metadata?.actorType === "system" &&
      taskSystemMessage?.metadata?.turnId === taskId,
    "首次完整 systemPrompt 应作为 system message 进入 bridge ledger",
    taskSystemMessage,
  );
  assert(
    taskUserMessage?.content === initialUserMessage,
    "账本中的 user 消息应来自 send_message agent 的 userMessage",
    { expected: initialUserMessage, actual: taskUserMessage },
  );
  assert(
    taskAssistantMessage?.metadata?.runStatus === "done",
    "assistant 消息应记录运行完成状态",
    taskAssistantMessage,
  );
  assert(
    taskUserMessage?.metadata?.bridgeMetadataVersion === 1 &&
      taskUserMessage?.metadata?.actorType === "user" &&
      taskUserMessage?.metadata?.source === "runtime" &&
      taskUserMessage?.metadata?.scope === "shared" &&
      taskUserMessage?.metadata?.runtimeId === "mock" &&
      taskUserMessage?.metadata?.agentRoleId === initialAgentRoleId &&
      taskUserMessage?.metadata?.agentSessionId === expectedAgentSessionId &&
      taskUserMessage?.metadata?.agentKey === initialAgentRoleId &&
      taskUserMessage?.metadata?.runId === taskId &&
      taskUserMessage?.metadata?.turnId === taskId &&
      typeof taskUserMessage?.metadata?.baseLeafId === "string" &&
      !("agentSessionRunId" in (taskUserMessage?.metadata ?? {})) &&
      !("agentSessionDir" in (taskUserMessage?.metadata ?? {})),
    "runtime user 消息应携带标准 bridge metadata",
    taskUserMessage?.metadata,
  );
  assert(
    taskAssistantMessage?.metadata?.bridgeMetadataVersion === 1 &&
      taskAssistantMessage?.metadata?.actorType === "agent" &&
      taskAssistantMessage?.metadata?.source === "runtime" &&
      taskAssistantMessage?.metadata?.scope === "shared" &&
      taskAssistantMessage?.metadata?.runtimeId === "mock" &&
      taskAssistantMessage?.metadata?.agentRoleId === initialAgentRoleId &&
      taskAssistantMessage?.metadata?.agentSessionId === expectedAgentSessionId &&
      taskAssistantMessage?.metadata?.runId === taskId &&
      taskAssistantMessage?.metadata?.turnId === taskId &&
      !("agentSessionRunId" in (taskAssistantMessage?.metadata ?? {})) &&
      !("agentSessionDir" in (taskAssistantMessage?.metadata ?? {})),
    "runtime assistant 消息应携带标准 bridge metadata",
    taskAssistantMessage?.metadata,
  );

  const taskLedger = readLedger();
  assert(taskLedger.header.workspacePath === workspacePath, "ledger header 应记录 workspacePath", taskLedger.header);
  assert(taskLedger.header.sessionRootDir === sessionRootDir, "ledger header 应记录 sessionRootDir", taskLedger.header);
  const taskUserEntry = taskLedger.entry(done.bridgeSession.userMessageRecordId);
  const taskAssistantEntry = taskLedger.entry(done.bridgeSession.assistantMessageRecordId);
  assert(taskUserEntry?.type === "message", "userMessageRecordId 应指向 message entry", taskUserEntry);
  assert(taskAssistantEntry?.type === "message", "assistantMessageRecordId 应指向 message entry", taskAssistantEntry);
  assert(taskAssistantEntry.parentId === taskUserEntry.id, "assistant entry 应挂在 user entry 之后", {
    user: taskUserEntry,
    assistant: taskAssistantEntry,
  });
  assert(
    taskAssistantEntry.message.metadata?.parentUserEntryId === taskUserEntry.id,
    "assistant metadata 应记录本次 run 的 user entry",
    taskAssistantEntry.message.metadata,
  );
  assert(!("leafId" in (done.bridgeSession ?? {})), "done 事件不应向应用侧暴露 leafId", done.bridgeSession);

  const edited = await request({
    type: "message_edit",
    requestId: "edit-user",
    workspacePath,
    sessionRootDir,
    messageRecordId: done.bridgeSession.userMessageRecordId,
    content: "改写后的用户任务：只保留新的分支。",
  }, "session_mutation_result");
  assert(
    edited.messageRecordId && edited.messageRecordId !== done.bridgeSession.userMessageRecordId,
    "edit 应创建替换 messageRecordId",
    edited,
  );
  assert(edited.messages.length === 2, "edit 后活跃分支应截断后续 assistant 并保留 systemPrompt", edited.messages);
  assert(!("leafId" in edited), "edit mutation 结果不应向应用侧暴露 leafId", edited);
  assert(
    edited.messages.length === 2 &&
      edited.messages[0]?.role === "system" &&
      edited.messages[1]?.content === "改写后的用户任务：只保留新的分支。",
    "edit 后活跃消息应使用新内容",
    edited.messages,
  );
  assert(
    !existsSync(expectedAgentSessionDir),
    "edit 裁剪分支后应删除底层 agent session cache，等待下一次运行重建",
    expectedAgentSessionDir,
  );

  const editLedger = readLedger();
  const editedEntry = editLedger.entry(edited.messageRecordId);
  assert(editedEntry?.type === "message", "edit 返回的 messageRecordId 应指向替换 message", editedEntry);
  assert(
    editedEntry.parentId === taskUserEntry.parentId,
    "edit 替换 entry 应接到原消息父节点，实现分支裁剪",
    { originalParentId: taskUserEntry.parentId, editedEntry },
  );
  assert(
    editedEntry.message.metadata?.editedFromEntryId === taskUserEntry.id,
    "edit 替换 entry 应记录 editedFromEntryId",
    editedEntry,
  );
  assert(
    editedEntry.message.metadata?.source === "app_edit" &&
      editedEntry.message.metadata?.scope === "shared" &&
      editedEntry.message.metadata?.baseLeafId === taskUserEntry.parentId,
    "edit 替换 entry 应保留标准 shared metadata 并更新 source/baseLeafId",
    editedEntry.message.metadata,
  );
  assert(
    editLedger.entry(taskAssistantEntry.id)?.id === taskAssistantEntry.id,
    "edit 不应物理删除旧 assistant 分支节点",
    taskAssistantEntry,
  );
  assert(
    editLedger.entry(taskUserEntry.id)?.type === "message" &&
      editLedger.entry(taskAssistantEntry.id)?.type === "message",
    "旧分支节点仍留在 ledger 中，分支信息应通过 read_session 的投影能力获取，而不是向应用暴露 leafId",
    { user: editLedger.entry(taskUserEntry.id), assistant: editLedger.entry(taskAssistantEntry.id) },
  );

  const deleted = await request({
    type: "message_delete",
    requestId: "delete-edited-user",
    workspacePath,
    sessionRootDir,
    messageRecordId: edited.messageRecordId,
  }, "session_mutation_result");
  assert(
    deleted.messages.length === 1 && deleted.messages[0]?.role === "system",
    "delete 后活跃消息应只保留 systemPrompt",
    deleted.messages,
  );
  const deleteLedger = readLedger();
  assert(!("leafId" in deleted), "delete mutation 结果不应向应用侧暴露 leafId", deleted);
  const deleteMarker = [...deleteLedger.entries].reverse().find((entry) =>
    entry.type === "custom" &&
    entry.customType === "message_deleted" &&
    entry.data?.deletedEntryId === edited.messageRecordId
  );
  assert(deleteMarker?.type === "custom", "delete 应写入删除标记 entry", deleteMarker);
  assert(deleteMarker.customType === "message_deleted", "delete 应写入 message_deleted 标记", deleteMarker);
  assert(deleteMarker.parentId === taskUserEntry.parentId, "delete 标记应接到被删消息父节点，实现活跃分支裁剪", {
    originalParentId: taskUserEntry.parentId,
    deleteMarker,
  });
  assert(
    deleteMarker.data?.deletedEntryId === edited.messageRecordId,
    "delete 标记应记录被删除 messageRecordId",
    deleteMarker,
  );
  assert(
    deleteMarker.data?.bridgeMetadataVersion === 1 &&
      deleteMarker.data?.actorType === "bridge" &&
      deleteMarker.data?.source === "app_delete" &&
      deleteMarker.data?.scope === "shared" &&
      deleteMarker.data?.baseLeafId === taskUserEntry.parentId,
    "delete 标记应携带标准 ledger operation metadata",
    deleteMarker,
  );
  assert(
    deleteLedger.entry(edited.messageRecordId)?.type === "message",
    "删除后编辑分支 message 仍保留在 ledger 中，当前 active path 则已删除",
    deleteLedger.entry(edited.messageRecordId),
  );

  const rebuilt = await request({
    type: "rebuild",
    requestId: "rebuild-session",
    workspacePath,
    sessionRootDir,
    messages: [
      { role: "user", content: "重建后的用户消息", timestamp: 11, metadata: { uiMessageId: "u1" } },
      { role: "assistant", content: "重建后的助手消息", timestamp: 12, metadata: { uiMessageId: "a1" } },
    ],
  }, "session_mutation_result");
  assert(rebuilt.messageRecordIds?.length === 2, "rebuild 应返回每条非空消息的 messageRecordId", rebuilt);
  assert(
    rebuilt.messages.map((message) => `${message.role}:${message.content}`).join("|") ===
      "user:重建后的用户消息|assistant:重建后的助手消息",
    "rebuild 后 active 消息应完全来自输入 messages",
    rebuilt.messages,
  );
  const rebuildLedger = readLedger();
  const rebuildStart = rebuildLedger.entries.findLast?.((entry) =>
    entry.type === "custom" && entry.customType === "rebuild_started"
  ) ?? [...rebuildLedger.entries].reverse().find((entry) =>
    entry.type === "custom" && entry.customType === "rebuild_started"
  );
  assert(rebuildStart?.data?.previousLeafId === deleteMarker.id, "rebuild_started 应在内部记录重建前 leaf", {
    previousLeafId: deleteMarker.id,
    rebuildStart,
  });
  const rebuiltUserEntry = rebuildLedger.entry(rebuilt.messageRecordIds[0]);
  const rebuiltAssistantEntry = rebuildLedger.entry(rebuilt.messageRecordIds[1]);
  assert(rebuiltUserEntry?.parentId === rebuildStart.id, "rebuild 第一条消息应接在 rebuild_started 后", {
    rebuildStart,
    rebuiltUserEntry,
  });
  assert(
    rebuildStart?.data?.bridgeMetadataVersion === 1 &&
      rebuildStart?.data?.source === "app_rebuild" &&
      rebuildStart?.data?.scope === "shared",
    "rebuild_started 应携带标准 ledger operation metadata",
    rebuildStart,
  );
  assert(
      rebuiltUserEntry?.message.metadata?.source === "app_rebuild" &&
      rebuiltUserEntry?.message.metadata?.actorType === "user" &&
      rebuiltUserEntry?.message.metadata?.scope === "shared" &&
      rebuiltUserEntry?.message.metadata?.baseLeafId === deleteMarker.id,
    "rebuild 消息应携带标准 app_rebuild metadata",
    rebuiltUserEntry?.message.metadata,
  );
  assert(rebuiltAssistantEntry?.parentId === rebuiltUserEntry.id, "rebuild 消息链路应保持输入顺序", {
    rebuiltUserEntry,
    rebuiltAssistantEntry,
  });

  const compacted = await request({
    type: "compact",
    requestId: "compact-agent-session",
    workspacePath,
    sessionRootDir,
    target: { scope: "agent", agentId: "mock", agentRoleId: initialAgentRoleId },
    options: { compactInstruction: "测试手动压缩底层 agent session。" },
    runtime: {
      model: { contextWindow: 4096, maxTokens: 1024 },
      resources: bridgeResources(),
    },
  }, "session_mutation_result");
  assert(compacted.compacted === false, "mock runtime compact 应作为 no-op 但保持链路可用", compacted);
  assert(compacted.summary === "", "手动 compact 底层 agent 不应写入 bridge shared summary", compacted.summary);
  assert(
    compacted.messages.map((message) => `${message.role}:${message.content}`).join("|") ===
      "user:重建后的用户消息|assistant:重建后的助手消息",
    "手动 compact 底层 agent 不应裁剪 bridge ledger active messages",
    compacted.messages,
  );
  const compactLedger = readLedger();
  assert(!("leafId" in compacted), "compact mutation 结果不应向应用侧暴露 leafId", compacted);
  assert(
    !compactLedger.entries.some((entry) => entry.type === "compaction"),
    "手动 compact 底层 agent 不应写入 bridge compaction entry",
    compactLedger.entries.filter((entry) => entry.type === "compaction"),
  );
  const compactEntry = [...compactLedger.entries].reverse()
    .find((entry) => entry.type === "custom" && entry.customType === "agent_session_compacted");
  assert(
    compactEntry?.type === "custom" &&
      compactEntry.data?.bridgeMetadataVersion === 1 &&
      compactEntry.data?.source === "bridge_compact" &&
      compactEntry.data?.scope === "shared" &&
      compactEntry.data?.target?.runtimeId === "mock" &&
      compactEntry.data?.target?.agentRoleId === initialAgentRoleId &&
      compactEntry.data?.compacted === false,
    "agent_session_compacted entry 应记录底层 agent compact 结果",
    compactEntry,
  );

  const contextCache = readContextCache();
  assert(contextCache.leafId === compactEntry.id, "context cache 可在 bridge 内部记录当前 leafId", contextCache);
  assert(contextCache.summary === "", "context cache 不应因底层 agent compact 生成 shared summary", contextCache);
  assert(
    contextCache.messages.length === compacted.messages.length &&
      contextCache.messages.at(-1)?.content === compacted.messages.at(-1)?.content,
    "context cache messages 应与 bridge active messages 一致",
    contextCache,
  );

  const directAgentRoleId = "mock-direct-agent";
  const directTaskId = "mock-task-direct-system-prompt";
  const directRequestContext = "本次引用资料：request-context-e2e-only，不应记录为 ledger 的用户消息。";
  const directBootstrapInstruction = "底层 session 初始化时只使用当前 agent 可见历史。";
  send(sendMessageCommand({
    mode: "agent",
    requestId: directTaskId,
    taskId: directTaskId,
    agentId: "mock",
    workspacePath,
    sessionRootDir,
    agentRoleId: directAgentRoleId,
    systemPrompt: "E2E Agent 系统提示词。",
    userMessage: "send_message agent 直接用户消息",
    requestContext: directRequestContext,
    bootstrapInstruction: directBootstrapInstruction,
    runtimeModel: { contextWindow: 4096, maxTokens: 1024 },
    resources: bridgeResources(),
  }));
  const directDone = await waitFor(
    (item) => item.type === "done" && item.taskId === directTaskId,
    "direct send_message agent done",
  );
  const directTaskResult = await waitFor(
    (item) => item.type === "task_result" && item.requestId === directTaskId,
    "direct send_message agent task_result",
  );
  assert(directTaskResult.success === true, "direct send_message agent 应成功", directTaskResult);
  assert(
    directDone.text.includes("系统提示词：E2E Agent 系统提示词。") &&
      directDone.text.includes("用户消息：send_message agent 直接用户消息"),
    "direct send_message agent 应由 bridge 将 systemPrompt/userMessage 分别传给底层 runtime",
    directDone.text,
  );
  assert(
    directDone.text.includes(`请求上下文：${directRequestContext}`),
    "direct send_message agent 应把 requestContext 作为一次性资料传给底层 runtime",
    directDone.text,
  );
  assert(
    directDone.text.includes(`Bootstrap指令：${directBootstrapInstruction}`),
    "direct send_message agent 应把 bootstrapInstruction 传给底层 runtime",
    directDone.text,
  );
  assert(
    !directDone.text.includes("重建后的助手消息") && !directDone.text.includes("重建后的用户消息"),
    "direct send_message agent 不应注入其他 agent 或 shared 分支的历史",
    directDone.text,
  );
  const directAgentSessionDir = join(sessionDirPath, "agents", "mock", directAgentRoleId);
  assert(
    existsSync(directAgentSessionDir),
    "direct send_message agent 应按 runtimeId/agentRoleId 创建底层 agent session 目录",
    directAgentSessionDir,
  );
  const afterDirectTask = await request({
    type: "read_session",
    requestId: "read-after-direct-agent-message",
    workspacePath,
    sessionRootDir,
  }, "session_result");
  assert(
    afterDirectTask.messages.at(-2)?.content === "send_message agent 直接用户消息" &&
      afterDirectTask.messages.at(-2)?.metadata?.runtimeId === "mock" &&
      afterDirectTask.messages.at(-2)?.metadata?.agentRoleId === directAgentRoleId &&
      afterDirectTask.messages.at(-1)?.role === "assistant",
    "direct send_message agent 应按 bridge 标准消息账本记录 user/assistant",
    afterDirectTask.messages,
  );
  assert(
    afterDirectTask.messages.at(-2)?.content === "send_message agent 直接用户消息" &&
      !afterDirectTask.messages
        .filter((message) => message.role !== "assistant")
        .some((message) => message.content.includes(directRequestContext)),
    "requestContext 不应覆盖 userMessage，也不应作为 user/system 原始消息进入账本",
    afterDirectTask.messages,
  );
  assert(
    afterDirectTask.requestContexts?.at(-1)?.content === directRequestContext &&
      afterDirectTask.requestContexts.at(-1)?.metadata?.bridgeEntryType === "request_context",
    "requestContext 应作为独立 data-only ledger entry 记录",
    afterDirectTask.requestContexts,
  );
  assert(
    !afterDirectTask.messages
      .filter((message) => message.role !== "assistant")
      .some((message) => message.content.includes(directBootstrapInstruction)) &&
      !afterDirectTask.requestContexts?.some((entry) => entry.content.includes(directBootstrapInstruction)) &&
      !afterDirectTask.runtimeInstructions?.some((entry) => entry.content.includes(directBootstrapInstruction)),
    "bootstrapInstruction 不应作为 user/requestContext/runtimeInstruction 原始账本内容记录",
    afterDirectTask,
  );

  const tavernSecret = "TAVERN_B_PRIVATE_INNER_THOUGHT_E2E_92817";
  const tavernBRoleId = "tavern-role-b";
  const tavernBTaskId = "mock-task-tavern-b-private";
  send(sendMessageCommand({
    mode: "agent",
    requestId: tavernBTaskId,
    taskId: tavernBTaskId,
    agentId: "mock",
    workspacePath,
    sessionRootDir,
    agentRoleId: tavernBRoleId,
    userMessage: `B 的私密心理描写：${tavernSecret}`,
    runtimeModel: { contextWindow: 4096, maxTokens: 1024 },
    resources: bridgeResources(),
  }));
  const tavernBDone = await waitFor(
    (item) => item.type === "done" && item.taskId === tavernBTaskId,
    "tavern role B private done",
  );
  const tavernBTaskResult = await waitFor(
    (item) => item.type === "task_result" && item.requestId === tavernBTaskId,
    "tavern role B private task_result",
  );
  assert(tavernBTaskResult.success === true, "tavern role B 应成功写入自己的底层上下文", tavernBTaskResult);
  assert(tavernBDone.text.includes(tavernSecret), "测试数据应确认 B 的回复链路中存在私密内容", tavernBDone.text);

  const tavernARoleId = "tavern-role-a";
  const tavernATaskId = "mock-task-tavern-a-after-b";
  const tavernARequestContext = "A 可见信息：B 公开说，今晚守城。";
  send(sendMessageCommand({
    mode: "agent",
    requestId: tavernATaskId,
    taskId: tavernATaskId,
    agentId: "mock",
    workspacePath,
    sessionRootDir,
    agentRoleId: tavernARoleId,
    userMessage: "A 根据自己可见信息继续行动。",
    requestContext: tavernARequestContext,
    runtimeModel: { contextWindow: 4096, maxTokens: 1024 },
    resources: bridgeResources(),
  }));
  const tavernADone = await waitFor(
    (item) => item.type === "done" && item.taskId === tavernATaskId,
    "tavern role A after B done",
  );
  const tavernATaskResult = await waitFor(
    (item) => item.type === "task_result" && item.requestId === tavernATaskId,
    "tavern role A after B task_result",
  );
  assert(tavernATaskResult.success === true, "tavern role A 应成功运行", tavernATaskResult);
  assert(
    tavernADone.text.includes(tavernARequestContext) &&
      !tavernADone.text.includes(tavernSecret) &&
      !tavernADone.text.includes("B 的私密心理描写"),
    "A 的底层输入只能看到自己的 requestContext，不应从 bridge bootstrap 泄漏 B 的私密内容",
    tavernADone.text,
  );

  const tavernASessionDir = join(sessionDirPath, "agents", "mock", tavernARoleId);
  rmSync(tavernASessionDir, { recursive: true, force: true });
  const tavernARebuildTaskId = "mock-task-tavern-a-rebuild";
  const tavernARebuildRequestContext = "A 可见信息：B 公开说，火把已经熄灭。";
  send(sendMessageCommand({
    mode: "agent",
    requestId: tavernARebuildTaskId,
    taskId: tavernARebuildTaskId,
    agentId: "mock",
    workspacePath,
    sessionRootDir,
    agentRoleId: tavernARoleId,
    userMessage: "A 的底层 session 被删除后继续行动。",
    requestContext: tavernARebuildRequestContext,
    runtimeModel: { contextWindow: 4096, maxTokens: 1024 },
    resources: bridgeResources(),
  }));
  const tavernARebuildDone = await waitFor(
    (item) => item.type === "done" && item.taskId === tavernARebuildTaskId,
    "tavern role A rebuild done",
  );
  const tavernARebuildTaskResult = await waitFor(
    (item) => item.type === "task_result" && item.requestId === tavernARebuildTaskId,
    "tavern role A rebuild task_result",
  );
  assert(tavernARebuildTaskResult.success === true, "A 底层 session 缺失时应可由 bridge ledger 重建启动上下文", tavernARebuildTaskResult);
  assert(
    tavernARebuildDone.text.includes(tavernARebuildRequestContext) &&
      !tavernARebuildDone.text.includes(tavernSecret) &&
      !tavernARebuildDone.text.includes("B 的私密心理描写"),
    "A 底层 session 重建时只能使用 A 自己的 ledger entries 和 requestContext",
    tavernARebuildDone.text,
  );
  const afterTavern = await request({
    type: "read_session",
    requestId: "read-after-tavern-agent-runs",
    workspacePath,
    sessionRootDir,
  }, "session_result");
  const tavernARequestContexts = afterTavern.requestContexts
    ?.filter((entry) => entry.metadata?.agentRoleId === tavernARoleId) ?? [];
  assert(
    afterTavern.messages.some((message) => message.content.includes(tavernSecret)) &&
      tavernARequestContexts.some((entry) => entry.content === tavernARequestContext) &&
      tavernARequestContexts.some((entry) => entry.content === tavernARebuildRequestContext),
    "酒馆测试应同时确认 B 私密消息和 A 自己的 requestContext 都进入 bridge ledger",
    {
      messages: afterTavern.messages,
      tavernARequestContexts,
    },
  );

  const cachedSystemTaskId = "mock-task-cached-system-prompt";
  send(sendMessageCommand({
    mode: "agent",
    requestId: cachedSystemTaskId,
    taskId: cachedSystemTaskId,
    agentId: "mock",
    workspacePath,
    sessionRootDir,
    agentRoleId: "mock-cached-system-agent",
    userMessage: "不传 systemPrompt 时应使用缓存系统提示词",
    runtimeModel: { contextWindow: 4096, maxTokens: 1024 },
    resources: bridgeResources(),
  }));
  const cachedSystemDone = await waitFor(
    (item) => item.type === "done" && item.taskId === cachedSystemTaskId,
    "cached system send_message agent done",
  );
  const cachedSystemTaskResult = await waitFor(
    (item) => item.type === "task_result" && item.requestId === cachedSystemTaskId,
    "cached system send_message agent task_result",
  );
  assert(cachedSystemTaskResult.success === true, "cached system send_message agent 应成功", cachedSystemTaskResult);
  assert(
    lineStartingWith(cachedSystemDone.text, "系统提示词：") === "系统提示词：E2E Agent 系统提示词。",
    "不传 systemPrompt 时底层 runtime 应使用 bridge ledger 中最近缓存的 systemPrompt",
    cachedSystemDone.text,
  );
  const afterCachedSystemTask = await request({
    type: "read_session",
    requestId: "read-after-cached-system-agent-message",
    workspacePath,
    sessionRootDir,
  }, "session_result");
  assert(
    afterCachedSystemTask.messages.filter((message) => message.role === "system" &&
      message.content === "E2E Agent 系统提示词。").length === 1,
    "缓存命中不应重复写入相同 systemPrompt",
    afterCachedSystemTask.messages,
  );

  const enhancedSystemTaskId = "mock-task-enhanced-system-prompt";
  send(sendMessageCommand({
    mode: "agent",
    requestId: enhancedSystemTaskId,
    taskId: enhancedSystemTaskId,
    agentId: "mock",
    workspacePath,
    sessionRootDir,
    agentRoleId: "mock-enhanced-system-agent",
    systemPrompt: "E2E Agent 增强系统提示词。",
    userMessage: "传入增强 systemPrompt 时应覆盖缓存系统提示词",
    runtimeModel: { contextWindow: 4096, maxTokens: 1024 },
    resources: bridgeResources(),
  }));
  const enhancedSystemTaskResult = await waitFor(
    (item) => item.type === "task_result" && item.requestId === enhancedSystemTaskId,
    "enhanced system send_message agent task_result",
  );
  assert(
    enhancedSystemTaskResult.success === false &&
      enhancedSystemTaskResult.message.includes("systemPrompt 已在当前 bridge session 初始化"),
    "已初始化的 systemPrompt 不应被后续请求隐式覆盖",
    enhancedSystemTaskResult,
  );

  const runtimeInstructionTaskId = "mock-task-runtime-instruction";
  send(sendMessageCommand({
    mode: "agent",
    requestId: runtimeInstructionTaskId,
    taskId: runtimeInstructionTaskId,
    agentId: "mock",
    workspacePath,
    sessionRootDir,
    agentRoleId: "mock-runtime-instruction-agent",
    userMessage: "传入 runtimeInstruction 时应保持 systemPrompt 不变",
    runtimeInstruction: "本轮增强要求：请用更克制的语气回答。",
    runtimeModel: { contextWindow: 4096, maxTokens: 1024 },
    resources: bridgeResources(),
  }));
  const runtimeInstructionDone = await waitFor(
    (item) => item.type === "done" && item.taskId === runtimeInstructionTaskId,
    "runtime instruction send_message agent done",
  );
  const runtimeInstructionTaskResult = await waitFor(
    (item) => item.type === "task_result" && item.requestId === runtimeInstructionTaskId,
    "runtime instruction send_message agent task_result",
  );
  assert(runtimeInstructionTaskResult.success === true, "runtimeInstruction send_message agent 应成功", runtimeInstructionTaskResult);
  assert(
    lineStartingWith(runtimeInstructionDone.text, "系统提示词：") === "系统提示词：E2E Agent 系统提示词。",
    "runtimeInstruction 不应修改底层 runtime 的 systemPrompt",
    runtimeInstructionDone.text,
  );

  const chatResult = await request(chatCommand({
    requestId: "chat-user-message",
    agentId: "mock",
    workspacePath,
    sessionRootDir,
    stream: false,
    systemPrompt: "E2E Agent 系统提示词。",
    userMessage: "chat 命令的新用户消息",
    requestContext: "chat 本次引用资料：request-context-chat-only。",
    runtimeInstruction: "chat 本轮临时说明：只验证链路。",
    runtimeModel: null,
  }), "chat_result");
  assert(
    chatResult.text.includes("chat 命令的新用户消息"),
    "chat runtime 应收到 bridge 注入后的最新 userMessage",
    chatResult,
  );
  assert(
    chatResult.text.includes("请求上下文：chat 本次引用资料：request-context-chat-only。"),
    "chat runtime 应收到 requestContext，但最新用户消息仍应是 userMessage",
    chatResult,
  );
  assert(chatResult.bridgeSession?.userMessageRecordId, "chat_result 应携带 bridge user messageRecordId", chatResult);
  const afterChat = await request({
    type: "read_session",
    requestId: "read-after-chat-user-message",
    workspacePath,
    sessionRootDir,
  }, "session_result");
  assert(
    afterChat.messages.at(-2)?.content === "chat 命令的新用户消息" &&
      afterChat.messages.at(-2)?.metadata?.source === "runtime" &&
      afterChat.messages.at(-1)?.role === "assistant",
    "chat userMessage 应由 bridge 写入账本，并追加 assistant 回复",
    afterChat.messages,
  );
  assert(chatResult.bridgeSession?.assistantMessageRecordId, "chat_result 应携带 bridge assistant messageRecordId", chatResult);
  assert(
    afterChat.requestContexts?.at(-1)?.content === "chat 本次引用资料：request-context-chat-only。" &&
      afterChat.runtimeInstructions?.at(-1)?.content === "chat 本轮临时说明：只验证链路。",
    "chat requestContext/runtimeInstruction 应作为独立 ledger entries 记录",
    {
      requestContexts: afterChat.requestContexts,
      runtimeInstructions: afterChat.runtimeInstructions,
    },
  );

  const serialRoot = await request({
    type: "message_append",
    requestId: "append-serial-root-user",
    workspacePath,
    sessionRootDir,
    messages: [
      { role: "user", content: "串行协作根用户消息", timestamp: 21, metadata: { uiMessageId: "serial-root" } },
    ],
  }, "session_mutation_result");
  assert(serialRoot.messageRecordId, "serial handoff 应先有应用侧写入的 root user", serialRoot);

  const firstSerialTaskId = "mock-task-serial-first";
  send(sendMessageCommand({
    mode: "agent",
    requestId: firstSerialTaskId,
    taskId: firstSerialTaskId,
    agentId: "mock",
    workspacePath,
    sessionRootDir,
    agentRoleId: "mock-serial-first-agent",
    userMessage: "第一个内部 agent 基于串行协作根用户消息处理。",
    runtimeInstruction: "串行第一个 agent 的内部执行说明。",
    runtimeModel: { contextWindow: 4096, maxTokens: 1024 },
    resources: bridgeResources(),
  }));
  const firstSerialDone = await waitFor(
    (item) => item.type === "done" && item.taskId === firstSerialTaskId,
    "first serial send_message agent done",
  );
  const firstSerialTaskResult = await waitFor(
    (item) => item.type === "task_result" && item.requestId === firstSerialTaskId,
    "first serial send_message agent task_result",
  );
  assert(firstSerialTaskResult.success === true, "first serial send_message agent 应成功", firstSerialTaskResult);

  const firstSerialLedger = readLedger();
  const firstSerialInstructionEntry = firstSerialLedger.entry(firstSerialDone.bridgeSession.runtimeInstructionRecordId);
  const firstSerialAssistantEntry = firstSerialLedger.entry(firstSerialDone.bridgeSession.assistantMessageRecordId);
  assert(
    !("sessionLink" in (firstSerialDone.bridgeSession ?? {})) &&
      firstSerialDone.bridgeSession?.userMessageRecordId === null &&
      firstSerialInstructionEntry?.parentId === serialRoot.messageRecordId &&
      firstSerialAssistantEntry?.message?.metadata?.rootUserEntryId === serialRoot.messageRecordId &&
      firstSerialAssistantEntry?.message?.metadata?.recordUserMessage === false,
    "父节点已经是 user 时，bridge 应自动把 agent run 视为内部 handoff，不重复写 user，且不向事件暴露 sessionLink",
    {
      bridgeSession: firstSerialDone.bridgeSession,
      firstSerialInstructionEntry,
      firstSerialAssistantEntry,
      serialRoot,
    },
  );

  const serialTaskId = "mock-task-serial-second";
  send(sendMessageCommand({
    mode: "agent",
    requestId: serialTaskId,
    taskId: serialTaskId,
    agentId: "mock",
    workspacePath,
    sessionRootDir,
    agentRoleId: "mock-serial-second-agent",
    userMessage: "请作为第二个 agent 基于上一个 agent 的回复继续处理。",
    runtimeInstruction: "串行 agent 基于上一个 agent 的输出继续处理。",
    runtimeModel: { contextWindow: 4096, maxTokens: 1024 },
    resources: bridgeResources(),
  }));
  const serialDone = await waitFor(
    (item) => item.type === "done" && item.taskId === serialTaskId,
    "serial send_message agent done",
  );
  const serialTaskResult = await waitFor(
    (item) => item.type === "task_result" && item.requestId === serialTaskId,
    "serial send_message agent task_result",
  );
  assert(serialTaskResult.success === true, "serial send_message agent 应成功", serialTaskResult);
  assert(
    !("sessionLink" in (serialDone.bridgeSession ?? {})) &&
      serialDone.bridgeSession?.userMessageRecordId === null,
    "serial done 不应暴露 sessionLink，也不应创建新的 user entry",
    {
      bridgeSession: serialDone.bridgeSession,
      firstSerialAssistantEntry,
      serialRoot,
    },
  );
  const serialLedger = readLedger();
  const serialInstructionEntry = serialLedger.entry(serialDone.bridgeSession.runtimeInstructionRecordId);
  const serialAssistantEntry = serialLedger.entry(serialDone.bridgeSession.assistantMessageRecordId);
  assert(
    serialInstructionEntry?.type === "runtime_instruction" &&
      serialInstructionEntry.parentId === firstSerialAssistantEntry.id &&
      serialInstructionEntry.content === "串行 agent 基于上一个 agent 的输出继续处理。",
    "serial runtimeInstruction 应作为内部 ledger entry 挂在上一条 assistant 后",
    serialInstructionEntry,
  );
  assert(
    serialAssistantEntry?.type === "message" &&
      serialAssistantEntry.parentId === serialInstructionEntry.id &&
      serialAssistantEntry.message.metadata?.parentEntryId === serialInstructionEntry.id &&
      serialAssistantEntry.message.metadata?.rootUserEntryId === serialRoot.messageRecordId &&
      serialAssistantEntry.message.metadata?.recordUserMessage === false &&
      serialAssistantEntry.message.metadata?.turnId === firstSerialAssistantEntry.message.metadata?.turnId,
    "serial assistant 应挂到 runtimeInstruction 后，并记录 rootUserEntryId/turnId/recordUserMessage",
    serialAssistantEntry,
  );
  const afterSerial = await request({
    type: "read_session",
    requestId: "read-after-serial",
    workspacePath,
    sessionRootDir,
  }, "session_result");
  assert(
    afterSerial.messages.filter((message) => message.content === "串行协作根用户消息").length === 1 &&
      !afterSerial.messages.some((message) => message.content === "第一个内部 agent 基于串行协作根用户消息处理。") &&
      !afterSerial.messages.some((message) => message.content === "请作为第二个 agent 基于上一个 agent 的回复继续处理。"),
    "serial handoff 不应把内部 agent prompt 重复写成 user 消息",
    afterSerial.messages,
  );

  assert(existsSync(ledgerPath), "ledger.jsonl 应存在", ledgerPath);
  assert(existsSync(tracePath), "trace.jsonl 应存在", tracePath);
  assert(existsSync(contextPath), "context.json 应存在", contextPath);

  const finalLedger = readLedger();

  const checks = {
    agents: list.agents.map((agent) => agent.id),
    createSessionSystemPrompt: aliasCreated.messages[0]?.content,
    sendMessageChatUser: aliasAfterChat.messages.at(-2)?.content,
    sendMessageAgentUser: aliasAfterAgent.messages.at(-2)?.content,
    sendMessageAgentRoleId: aliasAfterAgent.messages.at(-2)?.metadata?.agentRoleId,
    doneBridgeSession: done.bridgeSession,
    taskMessages: afterTask.messages.length,
    taskLedgerParent: `${taskUserEntry.id}->${taskAssistantEntry.id}`,
    runtimeMetadata: {
      system: taskSystemMessage?.metadata,
      user: taskUserMessage?.metadata,
      assistant: taskAssistantMessage?.metadata,
    },
    editedMessages: edited.messages.length,
    editedMessageRecordId: edited.messageRecordId,
    oldBranchNodesRetainedAfterEdit: Boolean(editLedger.entry(taskUserEntry.id) && editLedger.entry(taskAssistantEntry.id)),
    deletedMessages: deleted.messages.length,
    deleteMarkerId: deleteMarker.id,
    editedBranchNodeRetainedAfterDelete: Boolean(deleteLedger.entry(edited.messageRecordId)),
    rebuiltMessageRecordIds: rebuilt.messageRecordIds,
    rebuiltMessages: rebuilt.messages.map((message) => `${message.role}:${message.content}`),
    agentSessionCompacted: compacted.compacted,
    agentCompactDidNotWriteSharedSummary: compacted.summary === "",
    agentCompactMessages: compacted.messages.map((message) => `${message.role}:${message.content}`),
    directAgentRunAgentRoleId: directAgentRoleId,
    directAgentRunUserMessage: afterDirectTask.messages.at(-2)?.content,
    directRequestContextDelivered: directDone.text.includes(`请求上下文：${directRequestContext}`),
    directRequestContextRecordId: directDone.bridgeSession?.requestContextRecordId,
    tavernRoleAHiddenFromRoleBSecret:
      !tavernADone.text.includes(tavernSecret) && !tavernARebuildDone.text.includes(tavernSecret),
    immutableSystemRejected: enhancedSystemTaskResult.success === false,
    runtimeInstructionSystemPrompt: lineStartingWith(runtimeInstructionDone.text, "系统提示词："),
    chatUserMessage: afterChat.messages.at(-2)?.content,
    chatRequestContextDelivered: chatResult.text.includes("请求上下文：chat 本次引用资料：request-context-chat-only。"),
    chatRuntimeInstructionEntry: afterChat.runtimeInstructions?.at(-1)?.content,
    serialParentEntryId: serialAssistantEntry.message.metadata?.parentEntryId,
    serialRootUserEntryId: serialAssistantEntry.message.metadata?.rootUserEntryId,
    serialRuntimeInstructionRecordId: serialDone.bridgeSession?.runtimeInstructionRecordId,
    ledgerLines: finalLedger.entries.length + 1,
    traceLines: readFileSync(tracePath, "utf8").trim().split("\n").length,
  };

  await request({ type: "shutdown", requestId: "shutdown" }, "shutdown_ack");
  console.log(JSON.stringify({ ok: true, checks }, null, 2));
} catch (error) {
  try {
    bridge.kill();
  } catch {
    // best effort
  }
  throw error;
} finally {
  await cleanup();
}
