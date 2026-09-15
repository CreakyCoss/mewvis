import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { request as httpRequest } from "node:http";
import { startServer } from "../../dist/server.js";
import { EventHub } from "../../dist/infrastructure/events/event-hub.js";
import { token, waitFor } from "../support/helpers.mjs";

const fixture = fileURLToPath(
  new URL("../support/fixtures/runtime.mjs", import.meta.url),
);
async function serve(t) {
  const root = await mkdtemp(join(tmpdir(), "isle-server-http-"));
  const server = await startServer({
    port: 0,
    token,
    runtime: { cliPath: fixture, dataDir: join(root, "data") },
  });
  t.after(async () => {
    await server.close();
    await rm(root, { recursive: true, force: true });
  });
  const request = (path, options = {}) =>
    fetch(`${server.url}${path}`, {
      ...options,
      headers: { authorization: `Bearer ${token}`, ...options.headers },
    });
  const invoke = async (name, args) =>
    request(`/api/commands/${name}`, {
      method: "POST",
      body: JSON.stringify(args),
    });
  const run = (taskId, userMessage = "ok", extra = {}) =>
    invoke("run_agent_runtime_agent", {
      input: {
        taskId,
        workspacePath: root,
        sessionRootDir: "sessions/test",
        userMessage,
        ...extra,
      },
    });
  return { root, server, request, invoke, run };
}

async function stream(s, cursor) {
  const abort = new AbortController();
  const response = await s.request("/api/events", {
    signal: abort.signal,
    headers: cursor ? { "last-event-id": cursor } : {},
  });
  assert.equal(response.status, 200);
  const reader = response.body.getReader();
  const frames = [];
  let text = "";
  const decoder = new TextDecoder();
  const reading = (async () => {
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) return;
        text += decoder.decode(value, { stream: true });
        let end;
        while ((end = text.indexOf("\n\n")) >= 0) {
          const raw = text.slice(0, end);
          text = text.slice(end + 2);
          if (!raw.startsWith("id:")) continue;
          const fields = Object.fromEntries(
            raw
              .split("\n")
              .map((line) => [
                line.slice(0, line.indexOf(":")),
                line.slice(line.indexOf(":") + 1).trim(),
              ]),
          );
          frames.push({
            id: fields.id,
            name: fields.event,
            payload: JSON.parse(fields.data),
          });
        }
      }
    } catch (error) {
      if (!abort.signal.aborted) throw error;
    }
  })();
  return {
    frames,
    async close() {
      abort.abort();
      await reading;
    },
  };
}

test("HTTP health, authentication, origin/host checks and command discovery", async (t) => {
  const s = await serve(t);
  assert.equal((await fetch(`${s.server.url}/health`)).status, 200);
  assert.equal((await fetch(`${s.server.url}/api/status`)).status, 401);
  assert.equal(
    (
      await s.request("/api/status", {
        headers: { origin: "https://example.org" },
      })
    ).status,
    403,
  );
  // Fetch may normalize Host; use the raw HTTP client to actually send an alternate authority.
  const wrongHost = await new Promise((resolve, reject) => {
    const request = httpRequest(
      `${s.server.url}/api/status`,
      { headers: { host: "example.org", authorization: `Bearer ${token}` } },
      (response) => {
        response.resume();
        resolve(response.statusCode);
      },
    );
    request.on("error", reject);
    request.end();
  });
  assert.equal(wrongHost, 403);
  const discovery = await (await s.request("/api/commands")).json();
  assert(discovery.commands.includes("run_agent_runtime_agent"));
  assert(discovery.commands.includes("get_llm_settings"));
  assert.equal((await s.invoke("unknown", {})).status, 404);
  assert.equal((await s.request("/api/tasks/missing")).status, 404);
});

test("invalid inputs are rejected before worker creation, unavailable application binding is explicit", async (t) => {
  const s = await serve(t);
  for (const extra of [
    { taskId: "" },
    { resources: { tools: { allowed: "all" } } },
    { agentAccess: {} },
  ]) {
    assert.equal((await s.run("invalid", "ok", extra)).status, 400);
  }
  assert.equal(
    (await s.run("application", "ok", { applicationId: "@isle/tavern" }))
      .status,
    404,
  );
  assert.equal(
    (
      await s.run("resources", "ok", {
        resources: { applications: { items: [] } },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await s.request("/api/commands/run_agent_runtime_agent", {
        method: "POST",
        body: "bad json",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await s.request("/api/commands/run_agent_runtime_agent", {
        method: "POST",
        body: "x".repeat(2 * 1024 * 1024),
      })
    ).status,
    413,
  );
  assert.equal(s.server.supervisor.status().workers.length, 0);
});

test("HTTP command results and SSE retain Tauri event envelopes; disconnect leaves task running", async (t) => {
  const s = await serve(t);
  const first = await stream(s);
  t.after(() => first.close());
  const submitted = await s.run("question", "question");
  assert.equal(submitted.status, 200);
  assert.deepEqual(await submitted.json(), { taskId: "question" });
  await waitFor(() =>
    first.frames.some((frame) => frame.payload.event.type === "question"),
  );
  const cursor = first.frames.at(-1).id;
  await first.close();
  const snapshot = await (await s.request("/api/tasks/question")).json();
  assert.equal(snapshot.taskState, "waiting_user");
  assert.equal(snapshot.pendingInput.questionId, "q1");
  assert.equal(
    (
      await s.invoke("answer_agent_runtime_question", {
        input: { taskId: "question", questionId: "q1", answer: "yes" },
      })
    ).status,
    200,
  );
  await waitFor(
    () => s.server.supervisor.snapshot("question")?.taskState === "done",
  );
  const reconnected = await stream(s, cursor);
  t.after(() => reconnected.close());
  await waitFor(() =>
    reconnected.frames.some(
      (frame) => frame.payload.event.taskState === "done",
    ),
  );
  assert(
    reconnected.frames.every(
      (frame) => frame.name === "agent_runtime_agent_event",
    ),
  );
  assert.equal(
    (
      await s.request("/api/events", {
        headers: { "last-event-id": "previous-server:1" },
      })
    ).status,
    409,
  );
});

test("chat RPC returns text and broadcasts separate stream events", async (t) => {
  const s = await serve(t);
  const subscription = await stream(s);
  t.after(() => subscription.close());
  const response = await s.invoke("run_agent_runtime_chat", {
    input: {
      streamId: "chat-1",
      messages: [{ role: "user", content: "hello" }],
    },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { text: "fixture", thinking: null });
  await waitFor(() =>
    subscription.frames.some(
      (frame) => frame.name === "agent_runtime_chat_event",
    ),
  );
  assert.equal(
    subscription.frames.find(
      (frame) => frame.name === "agent_runtime_chat_event",
    ).payload.streamId,
    "chat-1",
  );
  assert.equal(s.server.supervisor.status().rpcProcesses, 0);
});

test("event replay is bounded by both count and bytes", () => {
  const hub = new EventHub(2, 4096);
  const events = [];
  hub.subscribe((event) => events.push(event));
  hub.publish("event", { value: 1 });
  hub.publish("event", { value: 2 });
  hub.publish("event", { value: 3 });
  assert.equal(hub.replay(events[0].id), null);
  assert.deepEqual(
    hub.replay(events[1].id).map((event) => event.payload.value),
    [3],
  );
  hub.publish("event", { value: "x".repeat(5000) });
  assert.equal(hub.replay(events[2].id), null);
});

test("CLI starts without Tauri and SIGTERM cleans up worker children", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "isle-server-cli-"));
  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL("../../dist/cli.js", import.meta.url))],
    {
      env: {
        ...process.env,
        ISLE_SERVER_PORT: "0",
        ISLE_SERVER_TOKEN: token,
        ISLE_SERVER_RUNTIME_CLI: fixture,
        ISLE_SERVER_DATA_DIR: root,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const exited = once(child, "exit");
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGKILL");
    await exited;
    await rm(root, { recursive: true, force: true });
  });
  const url = await waitFor(
    () => /http:\/\/127\.0\.0\.1:\d+/.exec(output)?.[0],
    "CLI URL",
  );
  const headers = { authorization: `Bearer ${token}` };
  const response = await fetch(`${url}/api/commands/run_agent_runtime_agent`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      input: { taskId: "hold", workspacePath: root, userMessage: "hold" },
    }),
  });
  assert.equal(response.status, 200);
  const status = await (await fetch(`${url}/api/status`, { headers })).json();
  const pid = status.workers[0].pid;
  child.kill("SIGTERM");
  const [code] = await exited;
  assert.equal(code, 0, output);
  assert.throws(() => process.kill(pid, 0));
});
