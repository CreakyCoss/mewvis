import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import {
  access,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { ProcessLifecycle } from "../../dist/infrastructure/process/lifecycle.js";
import { RuntimeDiagnostics } from "../../dist/modules/agent/runtime/diagnostics.js";
import { runtimeConfig } from "../../dist/config/runtime.js";
import { setup, waitFor } from "../support/helpers.mjs";

class FakeChild extends EventEmitter {
  pid = 123;
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  signals = [];
  kill(signal) {
    this.signals.push(signal);
    return true;
  }
  unref() {}
}

test("kill success without an exit event remains unconfirmed and has a bounded deadline", async () => {
  const child = new FakeChild();
  const lifecycle = new ProcessLifecycle(
    child,
    runtimeConfig({ stopTimeoutMs: 50 }),
  );
  const start = performance.now();
  const outcome = await lifecycle.stop();
  assert.equal(outcome.confirmed, false);
  assert(performance.now() - start < 1000);
  assert.deepEqual(child.signals, ["SIGKILL"]);
  assert(child.stdout.destroyed);
});

test("exit is confirmed even if inherited pipes never close; output drain is bounded", async () => {
  const child = new FakeChild();
  const lifecycle = new ProcessLifecycle(
    child,
    runtimeConfig({ outputDrainTimeoutMs: 30 }),
  );
  child.emit("exit", 0, null);
  const outcome = await lifecycle.finished;
  assert.equal(outcome.confirmed, true);
  assert.equal(outcome.drainTimedOut, true);
  assert(child.stdout.destroyed);
  assert.equal(child.signals.length, 0);
});

test("idle shutdown escalates within the total deadline; repeated stop can force cancellation", async () => {
  const child = new FakeChild();
  const lifecycle = new ProcessLifecycle(
    child,
    runtimeConfig({ shutdownGraceMs: 20, stopTimeoutMs: 100 }),
  );
  const stopped = lifecycle.stop({
    jsonrpc: "2.0",
    id: "shutdown",
    method: "runtime/shutdown",
    params: {},
  });
  assert.equal(child.signals.length, 0);
  await waitFor(() => child.signals.length === 1);
  child.emit("exit", 0, null);
  child.emit("close", 0, null);
  assert.equal((await stopped).confirmed, true);
});

test("tasks are not dispatched until the initial ping is answered", async (t) => {
  const s = await setup(t, {
    env: { ...process.env, FIXTURE_STARTUP_DELAY_MS: "200" },
  });
  await s.run("first");
  await s.run("second");
  await delay(100);
  assert.equal(s.supervisor.snapshot("first").taskState, "starting");
  assert.equal(s.supervisor.snapshot("second").taskState, "queued");
  assert(!s.events.some((event) => event.payload.event.type === "started"));
  await s.done("second");
  assert.equal(s.supervisor.snapshot("first").taskState, "done");
});

for (const mode of ["exit", "silent"]) {
  test(`startup ${mode}: bounded retries keep tasks unsent and fail the remaining queue together`, async (t) => {
    const s = await setup(t, {
      restartBackoffMs: 20,
      maxRecoveryAttempts: 2,
      startupTimeoutMs: 150,
      env: { ...process.env, FIXTURE_STARTUP_MODE: mode },
    });
    s.config.env.FIXTURE_START_COUNT = join(s.root, "starts.txt");
    await s.run("first");
    await s.run("second");
    await s.run("third");
    await s.done("third", "failed");
    assert.equal(
      (await readFile(s.config.env.FIXTURE_START_COUNT, "utf8"))
        .trim()
        .split("\n").length,
      3,
    );
    assert(!s.events.some((event) => event.payload.event.type === "started"));
    assert.equal(s.supervisor.status().workers.length, 0);
    for (const id of ["first", "second", "third"])
      assert.equal(s.supervisor.snapshot(id).taskState, "failed");
  });
}

test("recovery backoff reserves the session, and disposal cancels the pending replacement", async (t) => {
  const s = await setup(t, { restartBackoffMs: 500 });
  await s.run("crash", "crash");
  await s.run("queued");
  await s.done("queued", "recovering");
  await assert.rejects(s.run("overtake"), { code: "SESSION_STOPPING" });
  s.supervisor.abort("queued");
  await s.done("queued", "cancelled");
  await s.host.invoke("release_agent_runtime_session", {
    input: { workspacePath: s.root, sessionRootDir: "sessions/test" },
  });
  await delay(550);
  assert.equal(s.supervisor.status().workers.length, 0);
});

test("unconfirmed stop quarantines session and preserves files; later exit releases quarantine", async (t) => {
  const s = await setup(t, { stopTimeoutMs: 80 });
  await s.run("ignore-graceful-stop", "ignore-shutdown");
  await s.done("ignore-graceful-stop");
  const path = join(s.root, ".isle-claw/sessions/test");
  await mkdir(path, { recursive: true });
  await writeFile(join(path, "keep.txt"), "keep");
  await s.run("active", "hold");
  await s.done("active", "running");
  // Ignore both graceful shutdown and a kill request accepted without OS exit.
  const worker = [...s.supervisor.workers.values()][0];
  const kill = worker.child.kill.bind(worker.child);
  worker.child.kill = () => true;
  try {
    await assert.rejects(
      s.host.invoke("delete_agent_runtime_session", {
        input: { workspacePath: s.root, sessionRootDir: "sessions/test" },
      }),
      { code: "WORKER_EXIT_UNCONFIRMED" },
    );
    await access(join(path, "keep.txt"));
    assert.equal(s.supervisor.snapshot("active").taskState, "failed");
    await assert.rejects(s.run("replacement"), {
      code: "WORKER_EXIT_UNCONFIRMED",
    });
    assert.equal(s.supervisor.status().workers[0].workerState, "unhealthy");
  } finally {
    worker.child.kill = kill;
    kill("SIGKILL");
    await waitFor(
      () => s.supervisor.status().workers.length === 0,
      "late exit releases quarantine",
    );
  }
});

test("a real descendant holding stdout open cannot block failed task finalization and recovery", async (t) => {
  const s = await setup(t, { outputDrainTimeoutMs: 50, restartBackoffMs: 20 });
  s.config.env.FIXTURE_CHILD_PID_FILE = join(s.root, "descendant.pid");
  let pid;
  try {
    await s.run("leak", "pipe-leak");
    await s.run("next");
    await s.done("next");
    assert.equal(s.supervisor.snapshot("leak").taskState, "failed");
    pid = Number(await readFile(s.config.env.FIXTURE_CHILD_PID_FILE, "utf8"));
    assert.doesNotThrow(() => process.kill(pid, 0));
    await s.supervisor.close();
    const log = await readFile(s.supervisor.diagnostics.path, "utf8");
    assert(
      log
        .split("\n")
        .filter(Boolean)
        .map(JSON.parse)
        .some((record) => record.drainTimedOut === true),
    );
  } finally {
    if (pid) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {}
    }
  }
});

test("diagnostics retain lifecycle evidence without prompts, paths, model keys or raw stderr", async (t) => {
  const s = await setup(t);
  await s.run("secret-task-title", "stderr-secret");
  await s.done("secret-task-title");
  await s.supervisor.close();
  const log = await readFile(s.supervisor.diagnostics.path, "utf8");
  const records = log.trim().split("\n").map(JSON.parse);
  assert(records.some((record) => record.event === "worker_ready"));
  assert(
    records.some(
      (record) => record.event === "worker_exit" && record.stderrBytes > 0,
    ),
  );
  for (const secret of [
    s.root,
    "secret-task-title",
    "secret prompt text",
    "test-secret-token",
    "userMessage",
    "runtimeModel",
  ])
    assert(!log.includes(secret), secret);
  if (process.platform !== "win32")
    assert.equal(
      (await stat(s.supervisor.diagnostics.path)).mode & 0o777,
      0o600,
    );
});

test("diagnostic files rotate, queues drop excess records, and disk errors do not escape", async (t) => {
  const s = await setup(t);
  const diagnostics = new RuntimeDiagnostics({
    ...s.config,
    diagnosticMaxBytes: 500,
    diagnosticQueueBytes: 1000,
  });
  for (let i = 0; i < 100; i++)
    diagnostics.record("worker_ready", {
      workerId: "test-worker",
      durationMs: i,
    });
  assert(diagnostics.status().dropped > 0);
  await waitFor(() => diagnostics.status().queuedBytes === 0);
  for (let i = 0; i < 10; i++) {
    diagnostics.record("worker_ready", {
      workerId: "test-worker",
      durationMs: i,
    });
    await waitFor(() => diagnostics.status().queuedBytes === 0);
  }
  await diagnostics.close();
  const files = (await readdir(join(s.root, "server-data"))).filter((name) =>
    join(s.root, "server-data", name).startsWith(diagnostics.path),
  );
  assert.equal(files.length, 3);
  for (const file of files)
    assert((await stat(join(s.root, "server-data", file))).size <= 500);
  const invalid = join(s.root, "not-a-directory");
  await writeFile(invalid, "file");
  const broken = new RuntimeDiagnostics({
    ...s.config,
    dataDir: invalid,
    runtimeDataDir: invalid,
  });
  broken.record("worker_spawn");
  await broken.close();
  assert.equal(broken.status().failed, true);
});
