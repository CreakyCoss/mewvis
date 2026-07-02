import { execFileSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const workspaceRoot = process.cwd();
const runtimePath = join(workspaceRoot, "agent-runtime/dist/cli.js");
const configDbPath = process.env.NOVEL_CLAW_CONFIG_DB?.trim()
  || join(homedir(), ".novel-claw", "config.db");
const workspacePath = mkdtempSync(join(tmpdir(), "novel-claw-runtime-live-e2e-"));
const sessionRootDir = join(workspacePath, "standalone-session-store", "chats", "live-e2e-session", "session");
const sessionDirPath = sessionRootDir;
const ledgerPath = join(sessionDirPath, "ledger.jsonl");
const runMarker = `LIVE_E2E_${Date.now()}`;

const LIVE_MODEL_TEMPLATE = Object.freeze({
  provider: "minimax-cn",
  apiFormat: "anthropic-messages",
  catalogModelId: "MiniMax-M3",
  modelId: "MiniMax-M3-highspeed",
  apiEndpoint: "https://api.minimaxi.com/anthropic",
  reasoning: true,
  thinkingLevel: process.env.NOVEL_CLAW_LIVE_THINKING?.trim() || "off",
  input: ["text", "image"],
  cost: {
    input: 0.6,
    output: 2.4,
    cacheRead: 0.12,
    cacheWrite: 0,
  },
  contextWindow: 1_000_000,
  maxTokens: 128_000,
});

const LIVE_TIMEOUT_MS = Number(process.env.NOVEL_CLAW_LIVE_TIMEOUT_MS ?? 30 * 60 * 1000);
const CHAT_TIMEOUT_MS = Number(process.env.NOVEL_CLAW_LIVE_CHAT_TIMEOUT_MS ?? 10 * 60 * 1000);
const AGENT_TIMEOUT_MS = Number(process.env.NOVEL_CLAW_LIVE_AGENT_TIMEOUT_MS ?? 30 * 60 * 1000);
const COMPACT_TIMEOUT_MS = Number(process.env.NOVEL_CLAW_LIVE_COMPACT_TIMEOUT_MS ?? 30 * 60 * 1000);
const STRESS_TURNS = Number(process.env.NOVEL_CLAW_LIVE_STRESS_TURNS ?? 3);

if (!existsSync(runtimePath)) {
  throw new Error("agent-runtime/dist/cli.js 不存在，请先运行 pnpm build:agent-runtime");
}
if (!existsSync(configDbPath)) {
  throw new Error(`配置库不存在：${configDbPath}`);
}

const assert = (condition, message, details) => {
  if (!condition) {
    const suffix = details === undefined ? "" : `\n${JSON.stringify(safeDetails(details), null, 2)}`;
    throw new Error(`${message}${suffix}`);
  }
};

const safeDetails = (value) =>
  JSON.parse(JSON.stringify(value, (key, item) => {
    if (key === "apiKey" || key === "api_key") {
      return item ? "<redacted>" : item;
    }
    return item;
  }));

const loadMiniMaxRuntimeModel = () => {
  const query = [
    "select",
    "p.provider as provider,",
    "p.api_format as apiFormat,",
    "p.api_key as apiKey,",
    "p.api_endpoint as apiEndpoint,",
    "m.model_id as modelId,",
    "m.model_name as modelName,",
    "m.is_one_million_context as isOneMillionContext",
    "from llm_providers p",
    "join provider_models m on m.provider_id = p.id",
    "where p.provider = 'minimax-cn'",
    "and m.model_id = 'MiniMax-M3-highspeed'",
    "and coalesce(m.is_enabled, 1) = 1",
    "order by p.is_default desc",
    "limit 1",
  ].join(" ");
  const output = execFileSync("sqlite3", ["-json", configDbPath, query], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const [row] = JSON.parse(output || "[]");
  assert(row, "未在 ~/.novel-claw/config.db 中找到 MiniMax-M3-highspeed 配置");
  assert(row.apiKey?.trim(), "MiniMax-M3-highspeed provider 未配置 API Key", row);

  return {
    ...LIVE_MODEL_TEMPLATE,
    provider: row.provider || LIVE_MODEL_TEMPLATE.provider,
    apiFormat: row.apiFormat || LIVE_MODEL_TEMPLATE.apiFormat,
    apiKey: row.apiKey,
    modelId: row.modelId || LIVE_MODEL_TEMPLATE.modelId,
    apiEndpoint: row.apiEndpoint || LIVE_MODEL_TEMPLATE.apiEndpoint,
    contextWindow: Number(row.isOneMillionContext) === 1
      ? 1_000_000
      : LIVE_MODEL_TEMPLATE.contextWindow,
  };
};

const runtimeModel = loadMiniMaxRuntimeModel();

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

const runtime = spawn(process.execPath, [runtimePath], {
  cwd: workspaceRoot,
  stdio: ["pipe", "pipe", "pipe"],
});
const seen = [];
const waiters = [];
const autoAnsweredQuestions = [];
let stdoutBuffer = "";
let stderrBuffer = "";

const handleLine = (line) => {
  if (!line.trim()) {
    return;
  }
  const parsed = JSON.parse(line);
  seen.push(parsed);
  if (parsed.type === "question" && parsed.questionId && parsed.taskId) {
    autoAnsweredQuestions.push(parsed);
    send({
      type: "answer_question",
      requestId: `answer-${parsed.questionId}`,
      taskId: parsed.taskId,
      questionId: parsed.questionId,
      answer: `Live E2E 自动回答：请继续测试流程，并在最终回复中保留 ${runMarker} 相关标记。`,
    });
  }
  for (const waiter of [...waiters]) {
    if (waiter.predicate(parsed)) {
      clearTimeout(waiter.timer);
      waiters.splice(waiters.indexOf(waiter), 1);
      waiter.resolve(parsed);
    }
  }
};

runtime.stdout.on("data", (chunk) => {
  stdoutBuffer += chunk.toString("utf8");
  let newlineIndex;
  while ((newlineIndex = stdoutBuffer.indexOf("\n")) >= 0) {
    handleLine(stdoutBuffer.slice(0, newlineIndex));
    stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
  }
});

runtime.stderr.on("data", (chunk) => {
  stderrBuffer += chunk.toString("utf8");
});

const waitFor = (predicate, label, timeoutMs = LIVE_TIMEOUT_MS) =>
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
          `recent events:\n${JSON.stringify(seen.slice(-12).map(safeDetails), null, 2)}`,
        ].filter(Boolean).join("\n\n")));
      }, timeoutMs),
    };
    waiters.push(waiter);
  });

const send = (command) => {
  runtime.stdin.write(`${JSON.stringify(command)}\n`);
};

const request = async (command, resultType, timeoutMs) => {
  send(command);
  return waitFor(
    (item) => item.requestId === command.requestId && item.type === resultType,
    `${command.type}:${command.requestId}:${resultType}`,
    timeoutMs,
  );
};

const shutdown = async () => {
  try {
    await request({ type: "shutdown", requestId: "shutdown" }, "shutdown_ack", 5_000);
  } catch {
    runtime.kill();
  }
};

const cleanup = async () => {
  runtime.stdin.end();
  await new Promise((resolve) => {
    runtime.once("close", resolve);
  });
  if (process.env.NOVEL_CLAW_KEEP_LIVE_E2E_WORKSPACE !== "1") {
    rmSync(workspacePath, { recursive: true, force: true });
  }
};

const runtimeResources = (allowed = []) => ({
  tools: { allowed },
  skills: { enabled: [] },
});

const chatCommand = ({
  requestId,
  systemPrompt,
  userMessage,
  requestContext,
  runtimeInstruction,
}) => ({
  type: "chat",
  requestId,
  stream: false,
  runtimeModel,
  systemPrompt,
  messages: [{
    role: "user",
    content: [
      runtimeInstruction,
      userMessage,
      requestContext,
    ].filter(Boolean).join("\n\n"),
  }],
});

const sendAgentMessage = ({
  requestId,
  taskId,
  agentRoleId,
  systemPrompt,
  userMessage,
  requestContext,
  runtimeInstruction,
  bootstrapInstruction,
  resources = runtimeResources(),
}) => {
  send({
    type: "run_agent",
    requestId,
    taskId,
    workspacePath,
    sessionRootDir,
    agentRoleId,
    systemPrompt,
    userMessage,
    requestContext,
    runtimeInstruction,
    bootstrapInstruction,
    runtimeModel,
    resources,
  });
};

const waitForAgentRun = async (taskId, requestId, label) => {
  const done = await waitFor(
    (item) => item.type === "done" && item.taskId === taskId,
    `${label} done`,
    AGENT_TIMEOUT_MS,
  );
  const result = await waitFor(
    (item) => item.type === "task_result" && item.requestId === requestId && item.taskId === taskId,
    `${label} task_result`,
    30_000,
  );
  assert(result.success === true, `${label} 应成功`, result);
  return { done, result };
};

const agentSessionDir = (agentRoleId) => join(sessionDirPath, "agents", "pi", agentRoleId);
const listSessionFiles = (agentRoleId) => {
  const dir = agentSessionDir(agentRoleId);
  return existsSync(dir) ? readdirSync(dir, { recursive: true }).map(String) : [];
};

const expectMarker = (text, marker, label) => {
  assert(text.includes(marker), `${label} 应包含 marker：${marker}`, text);
};

const systemPrompt = [
  "你是 Novel Claw agent-runtime live E2E 测试助手。",
  "所有回复必须简洁，必须原样保留用户给出的 LIVE_E2E 标记。",
  "除非用户明确要求，不要调用工具、不要修改文件、不要提问。",
].join("\n");

const agentInstruction = [
  "这是自动化 live E2E。不要调用工具，不要询问用户。",
  "只根据当前请求和可见上下文回答，必须原样包含本轮 marker。",
  "如果请求中包含 JSON 输出要求，请输出最小 JSON，不要包 Markdown。",
].join("\n");

try {
  writeFileSync(
    join(workspacePath, "live-e2e-reference.txt"),
    [
      `workspace marker: ${runMarker}`,
      "这个文件只用于验证真实 agent runtime 工作区路径，不要求 agent 读取。",
    ].join("\n"),
    "utf8",
  );

  const list = await request({ type: "list_agents", requestId: "list" }, "agent_definitions", 10_000);
  assert(list.agents.some((agent) => agent.id === "pi" && agent.capabilities.includes("agent")), "pi agent 应可用", list);
  assert(list.agents.some((agent) => agent.id === "pi" && agent.capabilities.includes("chat")), "pi chat 应可用", list);

  const created = await request({
    type: "create_session",
    requestId: "live-create-session",
    workspacePath,
    sessionRootDir,
    systemPrompt,
    metadata: {
      live: true,
      runMarker,
      modelId: runtimeModel.modelId,
    },
  }, "session_mutation_result", 10_000);
  assert(created.messageRecordId, "create_session 应写入 systemPrompt", created);

  const chatMarker = `${runMarker}_CHAT`;
  const chatResult = await request(chatCommand({
    requestId: "live-chat",
    systemPrompt,
    userMessage: `只输出一行 JSON：{"marker":"${chatMarker}","mode":"chat","ok":true}`,
    requestContext: `chat 本次引用资料 marker=${runMarker}_CHAT_CONTEXT。`,
    runtimeInstruction: "严格保留 marker，输出 JSON。",
  }), "chat_result", CHAT_TIMEOUT_MS);
  expectMarker(chatResult.text, chatMarker, "chat_result");
  assert(!chatResult.runtimeSession, "stateless chat_result 不应返回 runtime session 引用", chatResult);

  const agentARoleId = "live-agent-a";
  const agentA1Marker = `${runMarker}_AGENT_A1`;
  const agentA1TaskId = "live-agent-a-1";
  sendAgentMessage({
    requestId: agentA1TaskId,
    taskId: agentA1TaskId,
    agentRoleId: agentARoleId,
    systemPrompt,
    userMessage: `请只回复 JSON：{"marker":"${agentA1Marker}","agent":"A","step":1}`,
    requestContext: `A 可见资料 A1_CONTEXT_${runMarker}。`,
    runtimeInstruction: agentInstruction,
  });
  const agentA1 = await waitForAgentRun(agentA1TaskId, agentA1TaskId, "agent A first run");
  expectMarker(agentA1.done.text, agentA1Marker, "agent A first done");
  assert(existsSync(agentSessionDir(agentARoleId)), "agent A 应创建 pi 底层 session 目录", agentSessionDir(agentARoleId));
  assert(listSessionFiles(agentARoleId).length > 0, "agent A 底层 session 目录应有文件", listSessionFiles(agentARoleId));

  const stressMarkers = [];
  for (let index = 0; index < Math.max(0, STRESS_TURNS); index += 1) {
    const marker = `${runMarker}_AGENT_A_STRESS_${index + 1}`;
    stressMarkers.push(marker);
    const taskId = `live-agent-a-stress-${index + 1}`;
    sendAgentMessage({
      requestId: taskId,
      taskId,
      agentRoleId: agentARoleId,
      userMessage: `继续同一底层 session。请回复 JSON：{"marker":"${marker}","agent":"A","stress":${index + 1}}`,
      requestContext: [
        `A 压力测试资料 ${index + 1}，marker=${marker}。`,
        "这段资料用于累积真实底层 session 历史。".repeat(80),
      ].join("\n"),
      runtimeInstruction: agentInstruction,
    });
    const stressRun = await waitForAgentRun(taskId, taskId, `agent A stress run ${index + 1}`);
    expectMarker(stressRun.done.text, marker, `agent A stress done ${index + 1}`);
  }

  const agentA2Marker = `${runMarker}_AGENT_A2`;
  const agentA2TaskId = "live-agent-a-2";
  sendAgentMessage({
    requestId: agentA2TaskId,
    taskId: agentA2TaskId,
    agentRoleId: agentARoleId,
    userMessage: `同一 Agent A session 继续。请只回复 JSON：{"marker":"${agentA2Marker}","agent":"A","step":2}`,
    requestContext: `A 可见资料 A2_CONTEXT_${runMarker}。`,
    runtimeInstruction: agentInstruction,
  });
  const agentA2 = await waitForAgentRun(agentA2TaskId, agentA2TaskId, "agent A second run");
  expectMarker(agentA2.done.text, agentA2Marker, "agent A second done");

  const compacted = await request({
    type: "compact",
    requestId: "live-compact-agent-a",
    workspacePath,
    sessionRootDir,
    target: {
      scope: "agent",
      agentId: "pi",
      agentRoleId: agentARoleId,
    },
    options: {
      compactInstruction: [
        "Live E2E 手动压缩底层 agent session。",
        `请保留 ${agentA1Marker}、${agentA2Marker} 和最新任务语义。`,
      ].join("\n"),
    },
    runtime: {
      model: runtimeModel,
      resources: runtimeResources(),
    },
  }, "session_mutation_result", COMPACT_TIMEOUT_MS);
  assert(typeof compacted.compacted === "boolean", "compact 应返回 boolean compacted", compacted);
  assert(compacted.summary === "", "手动 compact 底层 agent 不应写入 runtime shared summary", compacted);

  const ledgerAfterCompact = readLedger();
  assert(
    !ledgerAfterCompact.entries.some((entry) => entry.type === "compaction"),
    "runtime ledger 不应产生 shared compaction entry",
    ledgerAfterCompact.entries.filter((entry) => entry.type === "compaction"),
  );
  const agentCompactEntry = [...ledgerAfterCompact.entries].reverse()
    .find((entry) => entry.type === "custom" && entry.customType === "agent_session_compacted");
  assert(
    agentCompactEntry?.data?.target?.runtimeId === "pi" &&
      agentCompactEntry.data?.target?.agentRoleId === agentARoleId,
    "runtime ledger 应记录 agent_session_compacted 审计事件",
    agentCompactEntry,
  );

  const agentARebuildMarker = `${runMarker}_AGENT_A_REBUILD`;
  rmSync(agentSessionDir(agentARoleId), { recursive: true, force: true });
  const agentARebuildTaskId = "live-agent-a-rebuild";
  sendAgentMessage({
    requestId: agentARebuildTaskId,
    taskId: agentARebuildTaskId,
    agentRoleId: agentARoleId,
    userMessage: `Agent A 底层 session 被删除后继续。请回复 JSON：{"marker":"${agentARebuildMarker}","agent":"A","rebuilt":true}`,
    requestContext: `A 重建可见资料 A_REBUILD_CONTEXT_${runMarker}。`,
    runtimeInstruction: agentInstruction,
    bootstrapInstruction: `重建 Agent A 底层 session 时，只使用 Agent A 自己的历史、requestContext 和 runtimeInstruction。`,
  });
  const agentARebuild = await waitForAgentRun(agentARebuildTaskId, agentARebuildTaskId, "agent A rebuild run");
  expectMarker(agentARebuild.done.text, agentARebuildMarker, "agent A rebuild done");
  assert(existsSync(agentSessionDir(agentARoleId)), "agent A rebuild 后应重新创建底层 session 目录", agentSessionDir(agentARoleId));

  const serialRoot = await request({
    type: "message_append",
    requestId: "live-append-serial-root",
    workspacePath,
    sessionRootDir,
    messages: [
      {
        role: "user",
        content: `多 agent 串行协作根用户消息 ${runMarker}_SERIAL_ROOT`,
        timestamp: Date.now(),
        metadata: { live: true, uiMessageId: "live-serial-root" },
      },
    ],
  }, "session_mutation_result", 10_000);
  assert(serialRoot.messageRecordId, "serial root user 应写入 runtime ledger", serialRoot);

  const writerRoleId = "live-writer-agent";
  const writerMarker = `${runMarker}_WRITER`;
  const writerTaskId = "live-writer-agent";
  sendAgentMessage({
    requestId: writerTaskId,
    taskId: writerTaskId,
    agentRoleId: writerRoleId,
    userMessage: `基于串行根用户消息生成一句可交付文本，并包含 ${writerMarker}。只输出 JSON。`,
    requestContext: `writer 可见资料 SERIAL_WRITER_CONTEXT_${runMarker}。`,
    runtimeInstruction: agentInstruction,
  });
  const writerRun = await waitForAgentRun(writerTaskId, writerTaskId, "serial writer run");
  expectMarker(writerRun.done.text, writerMarker, "serial writer done");

  const editorRoleId = "live-editor-agent";
  const editorMarker = `${runMarker}_EDITOR`;
  const editorTaskId = "live-editor-agent";
  sendAgentMessage({
    requestId: editorTaskId,
    taskId: editorTaskId,
    agentRoleId: editorRoleId,
    userMessage: [
      "你是第二个 agent，请整合上一个 agent 的产出并润色。",
      `上一个 agent 产出：${writerRun.done.text.slice(0, 1200)}`,
      `最终回复必须包含 ${editorMarker}。只输出 JSON。`,
    ].join("\n"),
    requestContext: `editor 可见资料 SERIAL_EDITOR_CONTEXT_${runMarker}。`,
    runtimeInstruction: agentInstruction,
  });
  const editorRun = await waitForAgentRun(editorTaskId, editorTaskId, "serial editor run");
  expectMarker(editorRun.done.text, editorMarker, "serial editor done");

  const tavernSecret = `${runMarker}_B_PRIVATE_SECRET`;
  const tavernBRoleId = "live-tavern-b";
  const tavernBTaskId = "live-tavern-b";
  sendAgentMessage({
    requestId: tavernBTaskId,
    taskId: tavernBTaskId,
    agentRoleId: tavernBRoleId,
    userMessage: `B 的私密心理描写：${tavernSecret}。请回复 JSON 并包含这个私密 marker。`,
    requestContext: `B 私有资料 B_CONTEXT_${runMarker}。`,
    runtimeInstruction: agentInstruction,
  });
  const tavernBRun = await waitForAgentRun(tavernBTaskId, tavernBTaskId, "tavern B private run");
  expectMarker(tavernBRun.done.text, tavernSecret, "tavern B done");

  const tavernARoleId = "live-tavern-a";
  const tavernAMarker = `${runMarker}_TAVERN_A`;
  const tavernATaskId = "live-tavern-a";
  sendAgentMessage({
    requestId: tavernATaskId,
    taskId: tavernATaskId,
    agentRoleId: tavernARoleId,
    userMessage: `A 根据自己可见信息继续行动。请回复 JSON 并包含 ${tavernAMarker}，不要猜测 B 的心理。`,
    requestContext: `A 可见信息：B 公开说今晚守城。A_PUBLIC_CONTEXT_${runMarker}。`,
    runtimeInstruction: agentInstruction,
  });
  const tavernARun = await waitForAgentRun(tavernATaskId, tavernATaskId, "tavern A after B run");
  expectMarker(tavernARun.done.text, tavernAMarker, "tavern A done");
  assert(!tavernARun.done.text.includes(tavernSecret), "A 首次运行不应泄漏 B 私密 marker", tavernARun.done.text);

  rmSync(agentSessionDir(tavernARoleId), { recursive: true, force: true });
  const tavernARebuildMarker = `${runMarker}_TAVERN_A_REBUILD`;
  const tavernARebuildTaskId = "live-tavern-a-rebuild";
  sendAgentMessage({
    requestId: tavernARebuildTaskId,
    taskId: tavernARebuildTaskId,
    agentRoleId: tavernARoleId,
    userMessage: `A 底层 session 删除后继续。请回复 JSON 并包含 ${tavernARebuildMarker}。`,
    requestContext: `A 可见信息：火把已经熄灭。A_REBUILD_PUBLIC_CONTEXT_${runMarker}。`,
    runtimeInstruction: agentInstruction,
    bootstrapInstruction: "重建 A 的底层 session 时，不要引入其他角色的私密心理或隐藏叙述。",
  });
  const tavernARebuildRun = await waitForAgentRun(tavernARebuildTaskId, tavernARebuildTaskId, "tavern A rebuild run");
  expectMarker(tavernARebuildRun.done.text, tavernARebuildMarker, "tavern A rebuild done");
  assert(
    !tavernARebuildRun.done.text.includes(tavernSecret),
    "A 底层 session 重建时不应从 runtime bootstrap 泄漏 B 私密 marker",
    tavernARebuildRun.done.text,
  );

  const finalSession = await request({
    type: "read_session",
    requestId: "live-read-final-session",
    workspacePath,
    sessionRootDir,
  }, "session_result", 10_000);
  assert(finalSession.summary === "", "live runtime session 不应维护 shared summary", finalSession.summary);
  assert(
    finalSession.messages.some((message) => message.content.includes(tavernSecret)) &&
      !tavernARun.done.text.includes(tavernSecret) &&
      !tavernARebuildRun.done.text.includes(tavernSecret),
    "ledger 可包含 B 私密内容，但 A 的底层输入/输出不应泄漏它",
    finalSession.messages,
  );
  assert(
    finalSession.requestContexts?.some((entry) => entry.metadata?.agentRoleId === tavernARoleId) &&
      finalSession.requestContexts?.some((entry) => entry.metadata?.agentRoleId === tavernBRoleId),
    "read_session 应返回不同 agentRoleId 的 requestContext，供应用侧自行渲染",
    finalSession.requestContexts,
  );

  const beforeSummaryLedger = readLedger();
  const summaryTargetLeaf = beforeSummaryLedger.entries.at(-1);
  assert(summaryTargetLeaf, "live summarize 前应存在 ledger leaf", beforeSummaryLedger.entries);
  const displaySummaryResult = await request({
    type: "summarize_session",
    requestId: "live-summarize-display-session",
    workspacePath,
    sessionRootDir,
    agent: { agentId: "pi" },
    options: {
      summaryInstruction: `生成前端展示摘要，保留 ${runMarker} 相关测试线索，并说明摘要不参与 agent 上下文。`,
      maxSummaryChars: 3000,
    },
    runtime: {
      model: runtimeModel,
    },
  }, "session_mutation_result", CHAT_TIMEOUT_MS);
  assert(displaySummaryResult.summary === "", "display summary 不应写入 runtime shared summary", displaySummaryResult);
  assert(
    displaySummaryResult.displaySummary?.summary?.trim() &&
      displaySummaryResult.displaySummary.targetLeafId === summaryTargetLeaf.id &&
      displaySummaryResult.displaySummary.runtimeId === "pi" &&
      displaySummaryResult.displaySummary.modelId === runtimeModel.modelId &&
      displaySummaryResult.displaySummary.sourceCharCount > 0,
    "live summarize_session 应返回真实模型生成的 displaySummary",
    displaySummaryResult.displaySummary,
  );
  assert(
    displaySummaryResult.messages.length === finalSession.messages.length &&
      displaySummaryResult.messages.at(-1)?.content === finalSession.messages.at(-1)?.content,
    "display summary 不应改变 active messages",
    displaySummaryResult.messages,
  );
  const finalLedger = readLedger();
  const displaySummaryEntry = finalLedger.entry(displaySummaryResult.displaySummary.recordId);
  const displaySummaryLeaf = finalLedger.entries.at(-1);
  assert(
    displaySummaryEntry?.type === "custom" &&
      displaySummaryEntry.customType === "display_summary" &&
      displaySummaryEntry.parentId === summaryTargetLeaf.id &&
      displaySummaryEntry.data?.displayOnly === true,
    "live display_summary 应写入 display-only custom entry",
    displaySummaryEntry,
  );
  assert(
    displaySummaryLeaf?.type === "leaf" &&
      displaySummaryLeaf.parentId === displaySummaryEntry.id &&
      displaySummaryLeaf.targetId === summaryTargetLeaf.id,
    "live display_summary 写入后应复位 leaf",
    displaySummaryLeaf,
  );
  const sessionWithDisplaySummary = await request({
    type: "read_session",
    requestId: "live-read-after-display-summary",
    workspacePath,
    sessionRootDir,
  }, "session_result", 10_000);
  assert(
    sessionWithDisplaySummary.displaySummary?.recordId === displaySummaryResult.displaySummary.recordId &&
      sessionWithDisplaySummary.displaySummaries?.some((summary) =>
        summary.recordId === displaySummaryResult.displaySummary.recordId
      ),
    "read_session 应返回最近一次 displaySummary 和当前分支 displaySummaries",
    sessionWithDisplaySummary,
  );
  assert(
    sessionWithDisplaySummary.runtimeLinks?.some((link) =>
      link.runtime === "agent" &&
        link.agentRoleId === writerRoleId &&
        link.assistantMessageRecordIds.length > 0
    ) &&
      sessionWithDisplaySummary.runtimeLinks?.some((link) =>
        link.runtime === "agent" &&
          link.agentRoleId === editorRoleId &&
          link.assistantMessageRecordIds.length > 0
      ),
    "read_session 应返回多 agent 的结构化 runtimeLinks",
    sessionWithDisplaySummary.runtimeLinks,
  );
  const serialWriterAssistant = finalLedger.entries.find((entry) =>
    entry.type === "message" &&
    entry.message.role === "assistant" &&
    entry.message.metadata?.agentRoleId === writerRoleId
  );
  const serialEditorAssistant = finalLedger.entries.find((entry) =>
    entry.type === "message" &&
    entry.message.role === "assistant" &&
    entry.message.metadata?.agentRoleId === editorRoleId
  );
  assert(serialWriterAssistant, "serial writer assistant 应写入 ledger", finalLedger.entries);
  assert(serialEditorAssistant, "serial editor assistant 应写入 ledger", finalLedger.entries);
  assert(
    serialEditorAssistant.message.metadata?.recordUserMessage === false,
    "serial editor handoff 不应把内部 prompt 重复记录为 user message",
    serialEditorAssistant.message.metadata,
  );

  const checks = {
    model: {
      provider: runtimeModel.provider,
      modelId: runtimeModel.modelId,
      apiFormat: runtimeModel.apiFormat,
      apiEndpoint: runtimeModel.apiEndpoint,
      contextWindow: runtimeModel.contextWindow,
    },
    runMarker,
    chatMarkerDelivered: chatResult.text.includes(chatMarker),
    agentA: {
      first: agentA1.done.text.includes(agentA1Marker),
      stressTurns: stressMarkers.length,
      second: agentA2.done.text.includes(agentA2Marker),
      compacted: compacted.compacted,
      rebuilt: agentARebuild.done.text.includes(agentARebuildMarker),
      sessionFiles: listSessionFiles(agentARoleId).length,
    },
    multiAgent: {
      writer: writerRun.done.text.includes(writerMarker),
      editor: editorRun.done.text.includes(editorMarker),
      editorRecordUserMessage: serialEditorAssistant.message.metadata?.recordUserMessage ?? null,
    },
    tavernIsolation: {
      ledgerHasBSecret: finalSession.messages.some((message) => message.content.includes(tavernSecret)),
      aFirstHiddenFromBSecret: !tavernARun.done.text.includes(tavernSecret),
      aRebuildHiddenFromBSecret: !tavernARebuildRun.done.text.includes(tavernSecret),
    },
    runtimeLedger: {
      sharedSummary: finalSession.summary,
      displaySummaryRecordId: displaySummaryResult.displaySummary?.recordId,
      displaySummaryChunkCount: displaySummaryResult.displaySummary?.chunkCount,
      displaySummaryLlmCallCount: displaySummaryResult.displaySummary?.llmCallCount,
      runtimeLinkCount: sessionWithDisplaySummary.runtimeLinks?.length ?? 0,
      hasSharedCompactionEntry: finalLedger.entries.some((entry) => entry.type === "compaction"),
      agentCompactEntry: Boolean(agentCompactEntry),
      ledgerLines: finalLedger.entries.length + 1,
    },
    autoAnsweredQuestions: autoAnsweredQuestions.length,
    workspacePath: process.env.NOVEL_CLAW_KEEP_LIVE_E2E_WORKSPACE === "1" ? workspacePath : "<removed>",
  };

  await shutdown();
  console.log(JSON.stringify({ ok: true, checks: safeDetails(checks) }, null, 2));
} catch (error) {
  try {
    runtime.kill();
  } catch {
    // best effort
  }
  throw error;
} finally {
  await cleanup();
}
