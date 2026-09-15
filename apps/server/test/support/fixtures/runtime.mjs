import { createInterface } from "node:readline";
import { spawn } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";

if (process.env.FIXTURE_START_COUNT)
  appendFileSync(process.env.FIXTURE_START_COUNT, "start\n");
if (process.env.FIXTURE_STARTUP_MODE === "exit") process.exit(7);

const lines = createInterface({ input: process.stdin });
const keepAlive = setInterval(() => {}, 1000);
let held;
let ignorePing = false;
let ignoreShutdown = false;
const send = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
const event = (value) =>
  send({ jsonrpc: "2.0", method: "runtime/event", params: value });
const response = (id, result) => send({ jsonrpc: "2.0", id, result });
const complete = (command) => {
  event({
    type: "done",
    taskId: command.id,
    text: JSON.stringify({ pid: process.pid, params: command.params }),
  });
  response(command.id, {
    type: "task_result",
    taskId: command.id,
    success: true,
  });
  held = undefined;
};

lines.on("line", (line) => {
  const command = JSON.parse(line);
  const { id, method, params } = command;
  if (method === "runtime/ping") {
    if (process.env.FIXTURE_STARTUP_MODE === "silent") return;
    if (!ignorePing)
      setTimeout(
        () => response(id, { type: "pong" }),
        Number(process.env.FIXTURE_STARTUP_DELAY_MS ?? 0),
      );
  } else if (method === "runtime/shutdown") {
    if (!ignoreShutdown) {
      response(id, { type: "shutdown_ack" });
      process.exit(0);
    }
  } else if (method === "agent/run") {
    const action = params.userMessage;
    event({ type: "started", taskId: id });
    if (action === "pipe-leak") {
      const descendant = spawn(
        process.execPath,
        ["-e", "setTimeout(() => {}, 3000)"],
        {
          stdio: ["ignore", process.stdout, process.stderr],
        },
      );
      writeFileSync(process.env.FIXTURE_CHILD_PID_FILE, String(descendant.pid));
      setTimeout(() => process.exit(7), 20);
    } else if (action === "stderr-secret") {
      process.stderr.write(
        "Authorization: Bearer test-secret-token\nuser prompt: secret prompt text\n",
      );
      complete(command);
    } else if (action === "crash") setTimeout(() => process.exit(7), 80);
    else if (action === "malformed")
      setTimeout(() => process.stdout.write("not-json\n"), 80);
    else if (action === "oversized") process.stdout.write("x".repeat(8192));
    else if (action === "hold" || action === "no-heartbeat") {
      held = command;
      ignorePing = action === "no-heartbeat";
    } else if (action === "question") {
      held = command;
      event({
        type: "question",
        taskId: id,
        questionId: "q1",
        question: "Continue?",
        expiresAt: Date.now() + 60000,
      });
    } else if (action === "approval") {
      held = command;
      event({
        type: "approval_requested",
        taskId: id,
        approvalId: "a1",
        executionId: "e1",
        summary: "Test",
        details: "Test",
        reason: "Test",
        expiresAt: Date.now() + 60000,
      });
    } else if (action === "rpc-error")
      send({
        jsonrpc: "2.0",
        id,
        error: { code: -32000, message: "Fixture error" },
      });
    else if (action === "stale-result") {
      response("old-task", {
        type: "task_result",
        taskId: "old-task",
        success: true,
      });
      setTimeout(() => complete(command), 100);
    } else {
      if (action === "ignore-shutdown") ignoreShutdown = true;
      setTimeout(
        () => complete(command),
        action.startsWith("delay:") ? Number(action.slice(6)) : 20,
      );
    }
  } else if (
    method === "agent/question/answer" &&
    held &&
    params.taskId === held.id &&
    params.questionId === "q1"
  ) {
    event({
      type: "question_answered",
      taskId: held.id,
      questionId: "q1",
      answer: params.answer,
    });
    complete(held);
  } else if (
    method === "agent/approval/answer" &&
    held &&
    params.taskId === held.id &&
    params.approvalId === "a1"
  ) {
    event({
      type: "approval_resolved",
      taskId: held.id,
      approvalId: "a1",
      approved: params.approved,
    });
    complete(held);
  } else if (method === "agent/chat") {
    if (params.messages[0]?.content === "hold") {
      held = command;
      return;
    }
    if (params.stream)
      event({
        type: "text_delta",
        taskId: params.streamId ?? id,
        delta: "fixture",
      });
    response(id, { type: "chat_result", text: "fixture", thinking: null });
  }
});
lines.on("close", () => {
  if (!held) clearInterval(keepAlive);
});
