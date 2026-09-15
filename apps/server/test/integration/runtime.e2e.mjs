import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../../dist/server.js";
import { token, waitFor } from "../support/helpers.mjs";

test(
  "real Runtime CLI: workspace registration, HTTP agent, queue reuse, sessions, collaboration, and chat (mock profile)",
  { timeout: 60_000 },
  async (t) => {
    const root = await mkdtemp(join(tmpdir(), "isle-server-real-runtime-"));
    const server = await startServer({
      port: 0,
      token,
      runtime: {
        dataDir: join(root, "server-data"),
        env: { ...process.env, AGENT_RUNTIME_PROFILE_ID: "mock" },
      },
    });
    t.after(async () => {
      await server.close();
      await rm(root, { recursive: true, force: true });
    });
    const events = [];
    server.supervisor.events.subscribe((event) => events.push(event));
    const invoke = async (name, input) => {
      const response = await fetch(`${server.url}/api/commands/${name}`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({ input }),
      });
      const body = await response.json();
      assert.equal(response.status, 200, JSON.stringify(body));
      return body;
    };
    const registered = await invoke("create_workspace", {
      name: "Runtime test",
      path: join(root, "project"),
    });
    const workspacePath = registered.path;
    const scope = { workspacePath, sessionRootDir: "sessions/real" };
    const tools = await invoke("list_agent_runtime_tools", {});
    assert(Array.isArray(tools.tools));
    assert(Array.isArray(tools.permissionOptions));
    assert.equal(tools.type, undefined);
    for (const taskId of ["first", "second"]) {
      assert.deepEqual(
        await invoke("run_agent_runtime_agent", {
          ...scope,
          taskId,
          agentRoleId: "server-test",
          userMessage: `Offline task ${taskId}`,
          resources: { tools: { allowed: ["read"] } },
        }),
        { taskId },
      );
    }
    await waitFor(
      () =>
        ["done", "failed"].includes(
          server.supervisor.snapshot("second")?.taskState,
        ),
      "real agent completion",
      30_000,
    );
    assert.equal(
      server.supervisor.snapshot("first").taskState,
      "done",
      JSON.stringify(events),
    );
    assert.equal(
      server.supervisor.snapshot("second").taskState,
      "done",
      JSON.stringify(events),
    );
    assert.equal(
      server.supervisor.snapshot("first").workerId,
      server.supervisor.snapshot("second").workerId,
    );
    assert(events.some((event) => event.payload.event.type === "text_delta"));
    const session = await invoke("read_agent_runtime_session", scope);
    assert.equal(session.type, "session_result");
    assert(session.messages.length >= 2);
    const summary = await invoke("get_agent_runtime_session", scope);
    assert.equal(summary.type, "runtime_session_result");
    const debug = await invoke("get_agent_runtime_session_debug", {
      ...scope,
      includeLedger: true,
      includeTrace: true,
    });
    assert.equal(debug.type, "runtime_session_debug_result");
    const listed = await invoke("list_agent_runtime_sessions", {
      workspacePath,
    });
    assert(listed.sessions.length >= 1);
    const chat = await invoke("run_agent_runtime_chat", {
      messages: [{ role: "user", content: "Offline chat" }],
      stream: false,
    });
    assert(chat.text.includes("Offline chat"));
    assert.equal(chat.type, undefined);

    const collabScope = {
      workspacePath,
      sessionRootDir: "sessions/collaboration",
    };
    await invoke("run_agent_runtime_collaboration", {
      ...collabScope,
      requestId: "collaboration",
      agents: [{ id: "writer", label: "Writer" }],
      workflow: {
        id: "server.e2e",
        steps: [
          {
            id: "write",
            type: "agent",
            agentRoleId: "writer",
            userMessage: "Offline collaboration",
            outputKey: "draft",
          },
        ],
      },
    });
    await waitFor(
      () =>
        ["done", "failed"].includes(
          server.supervisor.snapshot("collaboration")?.taskState,
        ),
      "collaboration completion",
      30_000,
    );
    assert.equal(
      server.supervisor.snapshot("collaboration").taskState,
      "done",
      JSON.stringify(
        events.filter((e) => e.payload.taskId === "collaboration"),
      ),
    );
    assert(
      events.some(
        (event) => event.payload.event.type === "collaboration_result",
      ),
    );
    const timeline = await invoke(
      "get_agent_runtime_collaboration_timeline",
      collabScope,
    );
    assert.equal(timeline.type, "collaboration_timeline_result");
    const summarized = await invoke("summarize_agent_runtime_session", {
      ...scope,
      summaryInstruction: "Summarize briefly.",
    });
    assert.equal(summarized.type, "session_mutation_result");

    await invoke("release_agent_runtime_session", scope);
    await access(join(workspacePath, ".isle-claw/sessions/real/ledger.jsonl"));
    await invoke("delete_agent_runtime_session", scope);
    await assert.rejects(
      access(join(workspacePath, ".isle-claw/sessions/real")),
    );
    await invoke("delete_workspace", { id: registered.id });
    await access(join(workspacePath, "workspace.db"));
  },
);
