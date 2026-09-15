import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { runtimeConfig } from "../../dist/config/runtime.js";
import { AgentRuntimeSupervisor } from "../../dist/modules/agent/runtime/supervisor.js";
import { AgentRuntimeHost } from "../../dist/modules/agent/host.js";

export const token = "isle-server-test-token-0000000000";
export async function waitFor(predicate, label = "condition", timeout = 6000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) return value;
    await delay(10);
  }
  throw new Error(`Timed out: ${label}`);
}
export async function setup(t, overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), "isle-server-test-"));
  const config = runtimeConfig({
    cliPath: fileURLToPath(new URL("./fixtures/runtime.mjs", import.meta.url)),
    dataDir: join(root, "server-data"),
    ...overrides,
  });
  const supervisor = new AgentRuntimeSupervisor(config);
  const host = new AgentRuntimeHost(supervisor);
  const events = [];
  supervisor.events.subscribe((event) => events.push(event));
  t.after(async () => {
    await supervisor.close();
    await rm(root, { recursive: true, force: true });
  });
  const run = (taskId, userMessage = "ok", extra = {}) =>
    host.invoke("run_agent_runtime_agent", {
      input: {
        taskId,
        userMessage,
        workspacePath: root,
        sessionRootDir: "sessions/test",
        ...extra,
      },
    });
  const done = (taskId, state = "done") =>
    waitFor(
      () => supervisor.snapshot(taskId)?.taskState === state,
      `${taskId}: ${state}`,
    );
  return { root, config, supervisor, host, events, run, done };
}
