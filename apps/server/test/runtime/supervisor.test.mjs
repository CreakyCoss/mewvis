import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdir, writeFile, symlink } from "node:fs/promises";
import { join } from "node:path";
import { setup, waitFor } from "../support/helpers.mjs";

test("same-session FIFO and process reuse, different sessions run concurrently", async (t) => {
  const s = await setup(t);
  await s.run("first", "hold");
  await s.run("second");
  await s.run("other", "ok", { sessionRootDir: "sessions/other" });
  assert.equal(s.supervisor.snapshot("second").taskState, "queued");
  await s.done("other");
  assert.equal(s.supervisor.snapshot("first").taskState, "running");
  s.supervisor.abort("first");
  await s.done("first", "cancelled");
  await s.done("second");
  const reused = s.supervisor.snapshot("second").workerId;
  await s.run("third");
  await s.done("third");
  assert.equal(s.supervisor.snapshot("third").workerId, reused);
  assert.notEqual(s.supervisor.snapshot("first").workerId, reused);
  assert(
    s.events.some(
      (e) =>
        e.payload.taskId === "second" &&
        e.payload.event.taskState === "recovering",
    ),
  );
});

test("queued cancellation and duplicate IDs do not disrupt current task", async (t) => {
  const s = await setup(t);
  await s.run("first", "hold");
  await s.run("queued");
  await assert.rejects(s.run("first"), { code: "TASK_EXISTS" });
  s.supervisor.abort("queued");
  await s.done("queued", "cancelled");
  await s.done("first", "running");
  assert.equal(s.supervisor.status().workers[0].queueDepth, 0);
  assert.equal(s.supervisor.snapshot("first").taskState, "running");
  s.supervisor.abort("missing");
});

test("question and approval route only to active task and retain reconnect state", async (t) => {
  const s = await setup(t);
  await s.run("question", "question");
  await s.run("approval", "approval");
  await s.done("question", "waiting_user");
  assert.equal(s.supervisor.snapshot("question").pendingInput.questionId, "q1");
  await assert.rejects(
    s.host.invoke("answer_agent_runtime_approval", {
      input: { taskId: "approval", approvalId: "a1", approved: true },
    }),
    { code: "TASK_NOT_RUNNING" },
  );
  await s.host.invoke("answer_agent_runtime_question", {
    input: { taskId: "question", questionId: "q1", answer: "yes" },
  });
  await s.done("question");
  await s.done("approval", "waiting_user");
  assert.equal(s.supervisor.snapshot("approval").pendingInput.approvalId, "a1");
  await s.host.invoke("answer_agent_runtime_approval", {
    input: { taskId: "approval", approvalId: "a1", approved: false },
  });
  await s.done("approval");
  assert.equal(s.supervisor.snapshot("approval").pendingInput, undefined);
});

for (const failure of ["crash", "malformed", "rpc-error"]) {
  test(`${failure}: fail active task, preserve queue without replaying active execution`, async (t) => {
    const s = await setup(t);
    await s.run("bad", failure);
    await s.run("next");
    await s.done("bad", "failed");
    await s.done("next");
    const starts = s.events.filter(
      (e) => e.payload.taskId === "bad" && e.payload.event.type === "started",
    );
    assert.equal(starts.length, 1);
    if (failure !== "rpc-error")
      assert.notEqual(
        s.supervisor.snapshot("bad").workerId,
        s.supervisor.snapshot("next").workerId,
      );
  });
}

test("heartbeat timeout applies during running task and recovers queued work", async (t) => {
  const s = await setup(t, {
    heartbeatIntervalMs: 100,
    heartbeatTimeoutMs: 80,
    heartbeatMaxMisses: 2,
  });
  await s.run("hung", "no-heartbeat");
  await s.run("next");
  await s.done("hung", "failed");
  await s.done("next");
  assert(
    s.events.some(
      (e) =>
        e.payload.event.type === "error" &&
        e.payload.event.message.includes("心跳超时"),
    ),
  );
});

test("idle pong traffic does not extend lifetime; unresponsive shutdown is killed", async (t) => {
  const s = await setup(t, {
    idleTimeoutMs: 150,
    idleCheckIntervalMs: 25,
    heartbeatIntervalMs: 40,
    heartbeatTimeoutMs: 500,
    stopTimeoutMs: 100,
  });
  await s.run("first", "ignore-shutdown");
  await s.done("first");
  const pid = s.supervisor.status().workers[0].pid;
  await waitFor(() => s.supervisor.status().workers.length === 0, "idle reap");
  assert.throws(() => process.kill(pid, 0));
  await s.run("next");
  await s.done("next");
  assert.notEqual(
    s.supervisor.snapshot("first").workerId,
    s.supervisor.snapshot("next").workerId,
  );
});

test("release stops ordinary agent worker and queued tasks, preserves session files", async (t) => {
  const s = await setup(t);
  const path = join(s.root, ".isle-claw/sessions/test");
  await mkdir(path, { recursive: true });
  await writeFile(join(path, "keep.txt"), "keep");
  await s.run("active", "hold");
  await s.run("queued");
  await s.host.invoke("release_agent_runtime_session", {
    input: { workspacePath: s.root, sessionRootDir: "sessions/test" },
  });
  assert.equal(s.supervisor.status().workers.length, 0);
  await s.done("active", "cancelled");
  await s.done("queued", "cancelled");
  await access(join(path, "keep.txt"));
});

test("delete checks path boundary including symlinks and stops worker before removal", async (t) => {
  const s = await setup(t);
  const path = join(s.root, ".isle-claw/sessions/test");
  await mkdir(path, { recursive: true });
  await writeFile(join(path, "data.txt"), "data");
  await symlink(s.root, join(s.root, ".isle-claw/escape"), "dir");
  for (const sessionRootDir of [
    "../escape",
    join(s.root, ".isle-claw"),
    "escape/server-data",
  ]) {
    await assert.rejects(
      s.host.invoke("delete_agent_runtime_session", {
        input: { workspacePath: s.root, sessionRootDir },
      }),
      { code: "INVALID_ARGUMENT" },
    );
  }
  await s.run("active", "hold");
  await s.host.invoke("delete_agent_runtime_session", {
    input: { workspacePath: s.root, sessionRootDir: "sessions/test" },
  });
  await s.done("active", "cancelled");
  await assert.rejects(access(path));
});

test("late result for another task cannot complete current task or advance queue", async (t) => {
  const s = await setup(t);
  await s.run("first", "stale-result");
  await s.run("second");
  await s.done("first");
  await s.done("second");
  const firstDone = s.events.findIndex(
    (e) => e.payload.taskId === "first" && e.payload.event.type === "done",
  );
  const secondStarted = s.events.findIndex(
    (e) => e.payload.taskId === "second" && e.payload.event.type === "started",
  );
  assert(firstDone >= 0 && secondStarted > firstDone);
  assert.equal(s.supervisor.snapshot("old-task"), undefined);
});

test("spawn failure, protocol size bound, and worker/queue limits are explicit", async (t) => {
  const missing = await setup(t, { nodeBinary: "/missing-isle-node" });
  await missing.run("spawn");
  await missing.done("spawn", "failed");
  assert.equal(missing.supervisor.status().workers.length, 0);
  const oversized = await setup(t, { maxLineBytes: 4096 });
  await oversized.run("large", "oversized");
  await oversized.done("large", "failed");
  const limited = await setup(t, { maxWorkers: 1, maxQueuedTasks: 1 });
  await limited.run("active", "hold");
  await limited.run("queued");
  await assert.rejects(limited.run("overflow"), { code: "QUEUE_LIMIT" });
  await assert.rejects(
    limited.run("other", "ok", { sessionRootDir: "sessions/other" }),
    { code: "WORKER_LIMIT" },
  );
});

test("server close cancels all workers and short-lived RPC processes without restarting queues", async (t) => {
  const s = await setup(t);
  await s.run("active", "hold");
  await s.run("queued");
  const rpc = s.host.invoke("run_agent_runtime_chat", {
    input: { messages: [{ role: "user", content: "hold" }] },
  });
  const rejection = assert.rejects(rpc, /Server 正在停止/);
  const pids = s.supervisor.status().workers.map((worker) => worker.pid);
  await s.supervisor.close();
  await rejection;
  assert.equal(s.supervisor.status().workers.length, 0);
  assert.equal(s.supervisor.status().rpcProcesses, 0);
  assert.equal(s.supervisor.snapshot("queued").taskState, "cancelled");
  for (const pid of pids) assert.throws(() => process.kill(pid, 0));
  await assert.rejects(s.run("late"), { code: "SERVER_STOPPING" });
});

test("short-lived RPC has a bounded timeout", async (t) => {
  const s = await setup(t, { rpcTimeoutMs: 150 });
  await assert.rejects(
    s.host.invoke("run_agent_runtime_chat", {
      input: { messages: [{ role: "user", content: "hold" }] },
    }),
    { code: "RUNTIME_TIMEOUT" },
  );
  assert.equal(s.supervisor.status().rpcProcesses, 0);
});

test("one-shot chat RPC cancellation stops its process and releases capacity", async (t) => {
  const s = await setup(t);
  const abort = new AbortController();
  const pending = s.supervisor.call(
    "agent/chat",
    { messages: [{ role: "user", content: "hold" }], stream: false },
    ["chat_result"],
    undefined,
    abort.signal,
  );
  const rejected = assert.rejects(pending, /已取消/);
  abort.abort();
  await rejected;
  const result = await s.supervisor.call(
    "agent/chat",
    { messages: [{ role: "user", content: "ok" }], stream: false },
    ["chat_result"],
  );
  assert.equal(result.text, "fixture");
});
