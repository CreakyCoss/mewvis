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

  send({
    type: "run_collaboration",
    requestId: "stdio-dispatch-collaboration-smoke",
    input: {
      workspacePath,
      sessionRootDir: join(workspacePath, "session-store", "stdio-dispatch-collaboration"),
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
    type: "run_collaboration",
    requestId: "stdio-tavern-extension-smoke",
    input: {
      workspacePath,
      input: {
        rawDirectorText: JSON.stringify({
          speakerIds: ["char-a"],
          nonverbalReplyIds: [],
          narrator: "",
          reason: "char-a 应该承接当前公开压力",
        }),
        characters: [
          { id: "char-a", name: "艾琳" },
          { id: "char-b", name: "莫尔" },
        ],
      },
      workflow: {
        id: "stdio-tavern-extension-smoke",
        steps: [
          {
            id: "normalize",
            type: "transform",
            transform: "tavern.normalizeDirectorDecision",
            input: {
              raw: { $ref: "input.rawDirectorText" },
              characters: { $ref: "input.characters" },
              maxSpeakers: 2,
            },
            outputKey: "directorDecision",
          },
          {
            id: "hasSpeakers",
            type: "condition",
            condition: "tavern.hasScheduledSpeakers",
            dependsOn: ["normalize"],
            input: { $ref: "outputs.directorDecision" },
            outputKey: "hasSpeakers",
          },
          {
            id: "route",
            type: "router",
            router: "tavern.directorNextRoute",
            dependsOn: ["hasSpeakers"],
            input: { $ref: "outputs.directorDecision" },
            outputKey: "nextRoute",
          },
          {
            id: "speaker-char-a",
            type: "agent",
            agentRoleId: "speaker-char-a",
            dependsOn: ["route"],
            when: {
              condition: "tavern.shouldRunSpeaker",
              input: {
                decision: { $ref: "outputs.directorDecision" },
                characterId: "char-a",
              },
            },
            userMessage: "请验证 char-a 被导演调度。",
            outputKey: "reply:char-a",
          },
          {
            id: "speaker-char-b",
            type: "agent",
            agentRoleId: "speaker-char-b",
            dependsOn: ["speaker-char-a"],
            when: {
              condition: "tavern.shouldRunSpeaker",
              input: {
                decision: { $ref: "outputs.directorDecision" },
                characterId: "char-b",
              },
            },
            userMessage: "这个 step 应该被跳过。",
            outputKey: "reply:char-b",
          },
        ],
      },
      agents: [
        {
          id: "speaker-char-a",
          label: "艾琳",
          agentId: "mock",
        },
        {
          id: "speaker-char-b",
          label: "莫尔",
          agentId: "mock",
        },
      ],
    },
  });

  const tavernExtensionResult = await waitFor((item) =>
    item.type === "collaboration_result" &&
    item.requestId === "stdio-tavern-extension-smoke"
  );
  assert(tavernExtensionResult.executorId === "langgraph", "Tavern extension stdio smoke 默认应走 LangGraph", tavernExtensionResult);
  assert(
    tavernExtensionResult.steps?.map((step) => step.stepId).join("|") === "normalize|hasSpeakers|route|speaker-char-a",
    "Tavern extension workflow 应执行 transform/condition/router 并只运行被调度 speaker",
    tavernExtensionResult,
  );
  assert(
    tavernExtensionResult.skippedSteps?.map((step) => step.stepId).join("|") === "speaker-char-b",
    "tavern.shouldRunSpeaker 应跳过未被调度的 speaker step",
    tavernExtensionResult,
  );
  assert(
    tavernExtensionResult.output?.directorDecision?.speakerIds?.join("|") === "char-a",
    "tavern.normalizeDirectorDecision 应清洗导演输出",
    tavernExtensionResult,
  );
  assert(tavernExtensionResult.output?.hasSpeakers === true, "tavern.hasScheduledSpeakers 应返回 true", tavernExtensionResult);
  assert(tavernExtensionResult.output?.nextRoute?.route === "speakers", "tavern.directorNextRoute 应路由到 speakers", tavernExtensionResult);
  assert(tavernExtensionResult.steps?.find((step) => step.stepId === "route")?.route === "speakers", "router step 应保留 route 字段", tavernExtensionResult);
  assert(
    seen.some((item) => item.type === "step_started" && item.stepType === "transform"),
    "stdio 应输出 transform step_started 事件",
    seen,
  );

  send({
    type: "run_collaboration",
    requestId: "stdio-tavern-loop-extension-smoke",
    input: {
      workspacePath,
      workflow: {
        id: "stdio-tavern-loop-extension-smoke",
        maxSteps: 8,
        steps: [
          {
            id: "increment",
            type: "transform",
            transform: "tavern.incrementDirectorLoopRound",
            input: {
              current: { $ref: "outputs.round" },
            },
            outputKey: "round",
          },
          {
            id: "route",
            type: "router",
            router: "tavern.directorLoopRoute",
            input: {
              round: { $ref: "outputs.round" },
              maxRounds: 2,
            },
            routes: {
              director: "increment",
              end: "__end__",
            },
            outputKey: "loopRoute",
          },
        ],
      },
      agents: [],
    },
  });

  const tavernLoopExtensionResult = await waitFor((item) =>
    item.type === "collaboration_result" &&
    item.requestId === "stdio-tavern-loop-extension-smoke"
  );
  assert(tavernLoopExtensionResult.executorId === "langgraph", "Tavern loop extension stdio smoke 默认应走 LangGraph", tavernLoopExtensionResult);
  assert(tavernLoopExtensionResult.output?.round === 2, "tavern.incrementDirectorLoopRound 应支持跨 router 回跳累加", tavernLoopExtensionResult);
  assert(tavernLoopExtensionResult.output?.loopRoute?.route === "end", "tavern.directorLoopRoute 应在达到 maxRounds 后结束", tavernLoopExtensionResult);
  assert(tavernLoopExtensionResult.steps?.find((step) => step.stepId === "route")?.route === "end", "loop router step 应保留最终 route=end", tavernLoopExtensionResult);

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
    tavernExtensionWorkflowRunId: tavernExtensionResult.workflowRunId,
    tavernLoopExtensionWorkflowRunId: tavernLoopExtensionResult.workflowRunId,
    defaultExecutorWorkflowRunId: defaultExecutor.workflowRunId,
    defaultExecutorEventCount: defaultExecutor.eventCount,
    eventCount: seen.length,
  }, null, 2));
} finally {
  child.kill();
  rmSync(workspacePath, { recursive: true, force: true });
}
