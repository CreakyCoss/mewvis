import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const workspaceRoot = process.cwd();
const runtimePath = join(workspaceRoot, "agent-runtime/dist/cli.js");
const workspacePath = mkdtempSync(join(tmpdir(), "novel-claw-agent-runtime-stdio-"));

if (!existsSync(runtimePath)) {
  throw new Error("agent-runtime/dist/cli.js 不存在，请先运行 pnpm build:agent-runtime");
}

const assert = (condition, message, details) => {
  if (!condition) {
    const suffix = details === undefined ? "" : `\n${JSON.stringify(details, null, 2)}`;
    throw new Error(`${message}${suffix}`);
  }
};

const child = spawn(process.execPath, [runtimePath], {
  cwd: workspaceRoot,
  stdio: ["pipe", "pipe", "pipe"],
});

const seen = [];
const waiters = [];
let stdoutBuffer = "";
let stderrBuffer = "";

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

child.stdout.on("data", (chunk) => {
  stdoutBuffer += chunk.toString("utf8");
  let newlineIndex;
  while ((newlineIndex = stdoutBuffer.indexOf("\n")) >= 0) {
    handleLine(stdoutBuffer.slice(0, newlineIndex));
    stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
  }
});

child.stderr.on("data", (chunk) => {
  stderrBuffer += chunk.toString("utf8");
});

const waitFor = (predicate, timeoutMs = 15_000) =>
  new Promise((resolve, reject) => {
    const existing = seen.find(predicate);
    if (existing) {
      resolve(existing);
      return;
    }
    const waiter = {
      predicate,
      resolve,
      timer: setTimeout(() => {
        waiters.splice(waiters.indexOf(waiter), 1);
        reject(new Error(`等待 runtime 输出超时。\nstderr:\n${stderrBuffer}\nseen:\n${JSON.stringify(seen, null, 2)}`));
      }, timeoutMs),
    };
    waiters.push(waiter);
  });

const send = (command) => {
  child.stdin.write(`${JSON.stringify(command)}\n`);
};

const runDefaultExecutorEnvCheck = async () => {
  const envWorkspacePath = mkdtempSync(join(tmpdir(), "novel-claw-agent-runtime-default-executor-"));
  const envChild = spawn(process.execPath, [runtimePath], {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      AGENT_RUNTIME_DEFAULT_COLLABORATION_EXECUTOR: "native",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const envSeen = [];
  const envWaiters = [];
  let envStdoutBuffer = "";
  let envStderrBuffer = "";

  const handleEnvLine = (line) => {
    if (!line.trim()) {
      return;
    }
    const parsed = JSON.parse(line);
    envSeen.push(parsed);
    for (const waiter of [...envWaiters]) {
      if (waiter.predicate(parsed)) {
        clearTimeout(waiter.timer);
        envWaiters.splice(envWaiters.indexOf(waiter), 1);
        waiter.resolve(parsed);
      }
    }
  };

  envChild.stdout.on("data", (chunk) => {
    envStdoutBuffer += chunk.toString("utf8");
    let newlineIndex;
    while ((newlineIndex = envStdoutBuffer.indexOf("\n")) >= 0) {
      handleEnvLine(envStdoutBuffer.slice(0, newlineIndex));
      envStdoutBuffer = envStdoutBuffer.slice(newlineIndex + 1);
    }
  });

  envChild.stderr.on("data", (chunk) => {
    envStderrBuffer += chunk.toString("utf8");
  });

  const waitForEnv = (predicate, timeoutMs = 15_000) =>
    new Promise((resolve, reject) => {
      const existing = envSeen.find(predicate);
      if (existing) {
        resolve(existing);
        return;
      }
      const waiter = {
        predicate,
        resolve,
        timer: setTimeout(() => {
          envWaiters.splice(envWaiters.indexOf(waiter), 1);
          reject(new Error(`等待默认 executor runtime 输出超时。\nstderr:\n${envStderrBuffer}\nseen:\n${JSON.stringify(envSeen, null, 2)}`));
        }, timeoutMs),
      };
      envWaiters.push(waiter);
    });

  const sendEnv = (command) => {
    envChild.stdin.write(`${JSON.stringify(command)}\n`);
  };

  try {
    sendEnv({
      type: "run_collaboration",
      requestId: "stdio-default-native-collaboration-smoke",
      input: {
        workspacePath: envWorkspacePath,
        sessionRootDir: join(envWorkspacePath, "session-store", "stdio-default-native-collaboration"),
        workflow: {
          id: "stdio-default-native-collaboration-smoke",
          steps: [
            {
              id: "planner",
              type: "agent",
              agentRoleId: "planner",
              userMessage: "请验证显式默认 native executor。",
              outputKey: "plan",
            },
          ],
        },
        agents: [
          {
            id: "planner",
            label: "Planner",
            agentId: "mock",
            systemPrompt: "你是显式默认 native executor stdio smoke test 的角色。",
          },
        ],
      },
    });

    const result = await waitForEnv((item) =>
      item.type === "collaboration_result" &&
      item.requestId === "stdio-default-native-collaboration-smoke"
    );
    assert(result.executorId === "native", "环境变量应能显式设置 stdio 默认 collaboration executor", result);
    assert(
      envSeen.some((item) =>
        item.type === "workflow_started" &&
        item.workflowId === "stdio-default-native-collaboration-smoke" &&
        item.executorId === "native"
      ),
      "显式默认 executor 环境变量应体现在 workflow_started 事件",
      envSeen,
    );

    sendEnv({
      type: "shutdown",
      requestId: "stdio-default-native-collaboration-shutdown",
    });
    await waitForEnv((item) => item.type === "shutdown_ack");

    return {
      eventCount: envSeen.length,
      workflowRunId: result.workflowRunId,
    };
  } finally {
    envChild.kill();
    rmSync(envWorkspacePath, { recursive: true, force: true });
  }
};

try {
  send({
    type: "run_collaboration",
    requestId: "stdio-collaboration-smoke",
    input: {
      workspacePath,
      sessionRootDir: join(workspacePath, "session-store", "stdio-collaboration"),
      input: {
        runOptional: false,
      },
      workflow: {
        id: "stdio-collaboration-smoke",
        steps: [
          {
            id: "planner",
            type: "agent",
            agentRoleId: "planner",
            userMessage: "请生成 stdio 协作 smoke test 的计划。",
            outputKey: "plan",
          },
          {
            id: "optional",
            type: "agent",
            agentRoleId: "optional",
            when: {
              ref: "input.runOptional",
              truthy: true,
            },
            userMessage: "这个 step 应该被跳过。",
            outputKey: "optional",
          },
          {
            id: "writer",
            type: "agent",
            agentRoleId: "writer",
            userMessage: "请基于计划继续写一个简短结果：{{ output.plan }}",
            outputKey: "draft",
          },
        ],
      },
      agents: [
        {
          id: "planner",
          label: "Planner",
          agentId: "mock",
          systemPrompt: "你是 stdio 协作 smoke test 的共享系统角色。",
        },
        {
          id: "optional",
          label: "Optional",
          agentId: "mock",
          systemPrompt: "你是 stdio 协作 smoke test 的可选角色。",
        },
        {
          id: "writer",
          label: "Writer",
          agentId: "mock",
          systemPrompt: "你是 stdio 协作 smoke test 的写作角色。",
        },
      ],
    },
  });

  const result = await waitFor((item) =>
    item.type === "collaboration_result" &&
    item.requestId === "stdio-collaboration-smoke"
  );
  assert(result.requestId === "stdio-collaboration-smoke", "应保留 requestId", result);
  assert(result.workflowRunId?.startsWith("workflow-"), "应返回 workflowRunId", result);
  assert(result.executorId === "langgraph", "stdio collaboration_result 默认应携带 LangGraph executorId", result);
  assert(result.steps?.map((step) => step.stepId).join("|") === "planner|writer", "应执行两个不同角色的协作 step", result);
  assert(result.skippedSteps?.map((step) => step.stepId).join("|") === "optional", "应返回 skippedSteps", result);
  assert(seen.some((item) => item.type === "workflow_started" && item.executorId === "langgraph"), "应输出携带 executorId 的 workflow_started 事件", seen);
  assert(seen.some((item) => item.type === "agent_event"), "应输出包装后的 agent_event 事件", seen);
  assert(seen.some((item) => item.type === "step_skipped"), "应输出 step_skipped 事件", seen);

  send({
    type: "run_collaboration",
    requestId: "stdio-native-collaboration-smoke",
    input: {
      workspacePath,
      sessionRootDir: join(workspacePath, "session-store", "stdio-native-collaboration"),
      workflow: {
        id: "stdio-native-collaboration-smoke",
        executor: "native",
        steps: [
          {
            id: "planner",
            type: "agent",
            agentRoleId: "planner",
            userMessage: "请验证显式 native executor。",
            outputKey: "plan",
          },
        ],
      },
      agents: [
        {
          id: "planner",
          label: "Planner",
          agentId: "mock",
          systemPrompt: "你是显式 native executor stdio smoke test 的角色。",
        },
      ],
    },
  });

  const nativeResult = await waitFor((item) =>
    item.type === "collaboration_result" &&
    item.requestId === "stdio-native-collaboration-smoke"
  );
  assert(nativeResult.executorId === "native", "workflow.executor=native 应显式选择 native executor", nativeResult);
  assert(
    seen.some((item) =>
      item.type === "workflow_started" &&
      item.workflowId === "stdio-native-collaboration-smoke" &&
      item.executorId === "native"
    ),
    "stdio 显式 native workflow_started 应携带 executorId",
    seen,
  );

  const dispatchSessionRootDir = join(workspacePath, "session-store", "stdio-dispatch-collaboration");
  send({
    type: "run_collaboration",
    requestId: "stdio-dispatch-collaboration-smoke",
    input: {
      workspacePath,
      sessionRootDir: dispatchSessionRootDir,
      input: {
        topic: "stdio dispatch",
      },
      workflow: {
        id: "stdio-dispatch-collaboration-smoke",
        steps: [
          {
            id: "dispatch",
            type: "dispatch",
            input: {
              invocations: [
                {
                  id: "writer",
                  agentRoleId: "writer",
                  outputKey: "writerOut",
                  userMessage: "Write {{ input.topic }}",
                },
                {
                  id: "reviewer",
                  agentRoleId: "reviewer",
                  outputKey: "reviewerOut",
                  userMessage: "Review {{ outputs.writerOut }}",
                },
              ],
            },
            outputKey: "dispatchOut",
          },
        ],
      },
      agents: [
        {
          id: "writer",
          label: "Writer",
          agentId: "mock",
          systemPrompt: "你是 stdio dispatch smoke test 的写作者。",
        },
        {
          id: "reviewer",
          label: "Reviewer",
          agentId: "mock",
          systemPrompt: "你是 stdio dispatch smoke test 的审阅者。",
        },
      ],
    },
  });

  const dispatchResult = await waitFor((item) =>
    item.type === "collaboration_result" &&
    item.requestId === "stdio-dispatch-collaboration-smoke"
  );
  assert(dispatchResult.executorId === "langgraph", "stdio dispatch 默认应走 LangGraph executor", dispatchResult);
  assert(dispatchResult.output?.writerOut?.includes("Write stdio dispatch"), "stdio dispatch 应写回动态 writer output", dispatchResult);
  assert(dispatchResult.output?.reviewerOut?.includes("Review Mock agent 已完成模拟任务"), "stdio dispatch 后续 invocation 应能引用前序 output", dispatchResult);
  assert(
    dispatchResult.steps?.some((step) => step.stepId === "dispatch:writer") &&
      dispatchResult.steps?.some((step) => step.stepId === "dispatch:reviewer"),
    "stdio dispatch result 应包含动态 agent step",
    dispatchResult,
  );
  assert(
    seen.some((item) => item.type === "step_started" && item.stepType === "dispatch"),
    "stdio 应输出 dispatch step_started 事件",
    seen,
  );

  send({
    type: "get_runtime_session",
    requestId: "stdio-session-query",
    workspacePath,
    sessionRootDir: dispatchSessionRootDir,
    includeTimeline: true,
    timelineLimit: 20,
  });
  const runtimeSessionResult = await waitFor((item) =>
    item.type === "runtime_session_result" &&
    item.requestId === "stdio-session-query"
  );
  assert(runtimeSessionResult.session?.traceCount > 0, "stdio runtime session query 应返回 trace 摘要", runtimeSessionResult);
  assert(
    runtimeSessionResult.timeline?.some((item) => item.workflowRunId === dispatchResult.workflowRunId),
    "stdio runtime session query 应返回 workflow timeline",
    runtimeSessionResult,
  );

  send({
    type: "get_collaboration_timeline",
    requestId: "stdio-collaboration-timeline-query",
    workspacePath,
    sessionRootDir: dispatchSessionRootDir,
    workflowRunId: dispatchResult.workflowRunId,
  });
  const collaborationTimelineResult = await waitFor((item) =>
    item.type === "collaboration_timeline_result" &&
    item.requestId === "stdio-collaboration-timeline-query"
  );
  assert(
    collaborationTimelineResult.events?.some((item) => item.type === "workflow_started"),
    "stdio collaboration timeline query 应返回协作事件",
    collaborationTimelineResult,
  );

  send({
    type: "list_runtime_sessions",
    requestId: "stdio-sessions-query",
    workspacePath,
    rootDir: join(workspacePath, "session-store"),
  });
  const runtimeSessionsResult = await waitFor((item) =>
    item.type === "runtime_sessions_result" &&
    item.requestId === "stdio-sessions-query"
  );
  assert(
    runtimeSessionsResult.sessions?.some((session) => session.sessionRootDir === dispatchSessionRootDir),
    "stdio list_runtime_sessions 应枚举协作 session",
    runtimeSessionsResult,
  );

  send({
    type: "run_collaboration",
    requestId: "stdio-langgraph-collaboration-smoke",
    input: {
      workspacePath,
      sessionRootDir: join(workspacePath, "session-store", "stdio-langgraph-collaboration"),
      input: {
        topic: "stdio langgraph",
      },
      workflow: {
        id: "stdio-langgraph-collaboration-smoke",
        executor: "langgraph",
        executionMode: "parallel",
        steps: [
          {
            id: "left",
            type: "agent",
            agentRoleId: "left",
            userMessage: "Left {{ input.topic }}",
            outputKey: "left",
          },
          {
            id: "right",
            type: "agent",
            agentRoleId: "right",
            userMessage: "Right {{ input.topic }}",
            outputKey: "right",
          },
          {
            id: "reviewer",
            type: "agent",
            agentRoleId: "reviewer",
            dependsOn: ["left", "right"],
            userMessage: "Review {{ output.left }} + {{ steps.right.text }}",
            outputKey: "review",
          },
        ],
      },
      agents: [
        {
          id: "left",
          label: "Left",
          agentId: "mock",
          systemPrompt: "你是 stdio LangGraph 协作 smoke test 的左侧角色。",
        },
        {
          id: "right",
          label: "Right",
          agentId: "mock",
          systemPrompt: "你是 stdio LangGraph 协作 smoke test 的右侧角色。",
        },
        {
          id: "reviewer",
          label: "Reviewer",
          agentId: "mock",
          systemPrompt: "你是 stdio LangGraph 协作 smoke test 的审阅角色。",
        },
      ],
    },
  });

  const langGraphResult = await waitFor((item) =>
    item.type === "collaboration_result" &&
    item.requestId === "stdio-langgraph-collaboration-smoke"
  );
  assert(langGraphResult.executorId === "langgraph", "stdio collaboration_result 应支持 LangGraph executor", langGraphResult);
  assert(langGraphResult.steps?.map((step) => step.stepId).join("|") === "left|right|reviewer", "LangGraph stdio 结果应按 workflow step 顺序返回", langGraphResult);
  assert(
    seen.some((item) =>
      item.type === "workflow_started" &&
      item.workflowId === "stdio-langgraph-collaboration-smoke" &&
      item.executorId === "langgraph"
    ),
    "stdio 应输出携带 langgraph executorId 的 workflow_started 事件",
    seen,
  );

  send({
    type: "shutdown",
    requestId: "stdio-collaboration-shutdown",
  });
  await waitFor((item) => item.type === "shutdown_ack");
  const defaultExecutor = await runDefaultExecutorEnvCheck();

  console.log(JSON.stringify({
    ok: true,
    workflowRunId: result.workflowRunId,
    nativeWorkflowRunId: nativeResult.workflowRunId,
    dispatchWorkflowRunId: dispatchResult.workflowRunId,
    langGraphWorkflowRunId: langGraphResult.workflowRunId,
    defaultExecutorWorkflowRunId: defaultExecutor.workflowRunId,
    defaultExecutorEventCount: defaultExecutor.eventCount,
    eventCount: seen.length,
  }, null, 2));
} finally {
  child.kill();
  rmSync(workspacePath, { recursive: true, force: true });
}
