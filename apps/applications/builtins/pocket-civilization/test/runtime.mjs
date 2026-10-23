import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { build } from "esbuild";
import { startServer } from "../../../../server/dist/server.js";

test("existing Agent Runtime dispatches the app's structured judgment command to the real plugin", { timeout: 120_000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "pocket-runtime-"));
  const fixturePath = join(directory, "application.mjs");
  await build({ entryPoints: [fileURLToPath(new URL("../main/intelligence.ts", import.meta.url))], bundle: true, format: "esm", platform: "node", outfile: fixturePath, logLevel: "silent" });
  const { parseDecisionText } = await import(pathToFileURL(fixturePath).href);
  const requests = [], events = [];
  let confidence = .99, decision = "不触发法则";
  const model = createServer(async (request, response) => {
    try {
      let raw = "";
      for await (const chunk of request) raw += chunk;
      const body = JSON.parse(raw);
      requests.push(body);
      const content = JSON.stringify(body.messages);
      const text = content.includes("只判断规则是否适用")
        ? JSON.stringify({ matches: [] })
        : JSON.stringify({ type: "choice", value: decision, confidence, reason: "镇长确实记错了路，给出的材料不足以说明他故意说谎。" });
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.write(`data: ${JSON.stringify({ id: "pocket-fixture", object: "chat.completion.chunk", created: 1, model: "pocket-local", choices: [{ index: 0, delta: { role: "assistant", content: text }, finish_reason: "stop" }] })}\n\n`);
      response.end("data: [DONE]\n\n");
    } catch (error) { response.writeHead(500); response.end(String(error)); }
  });
  model.listen(0, "127.0.0.1");
  await once(model, "listening");
  let server;
  t.after(async () => {
    await server?.close();
    model.closeAllConnections();
    await new Promise(resolve => model.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  const token = `pocket-fixture-${crypto.randomUUID()}`;
  server = await startServer({ port: 0, token, runtime: { dataDir: join(directory, "data") } });
  server.supervisor.events.subscribe(event => events.push(event));
  const call = async (name, input = {}) => {
    const response = await fetch(`${server.url}/api/commands/${name}`, { method: "POST", headers: { authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ input }) });
    const value = await response.json();
    assert.equal(response.status, 200, JSON.stringify(value));
    return value;
  };
  const workspace = await call("create_workspace", { name: "口袋文明隔离验证", path: join(directory, "world") });
  const catalog = await call("list_extension_commands", { workspacePath: workspace.path, chatId: "pocket-test" });
  assert.ok(catalog.commands.some(command => command.id === "mewvis.decisions/evaluate"));
  const options = ["触发法则", "不触发法则", "存在解释争议"];
  const run = async (taskId) => {
    const approved = new Set();
    const request = { input: "法则：故意说谎的人头顶会下雨。镇长记错了桥的方向，他当时相信自己说的是对的。", question: "这次行动是否满足故意说谎的条件？只根据给出的事实判断。", output: { type: "choice", options } };
    await call("run_agent_runtime_agent", {
      taskId, workspacePath: workspace.path, sessionRootDir: "chats/pocket-test/session", agentRoleId: "pocket-judge",
      userMessage: `/mewvis.decisions/evaluate ${JSON.stringify(request)}`,
      permissions: { mode: "ask" }, resources: { tools: { allowed: [] }, skills: { enabled: [] } },
      runtimeModel: { provider: "openai", modelId: "pocket-local", catalogModelId: "pocket-local", apiFormat: "openai-completions", apiEndpoint: `http://127.0.0.1:${model.address().port}/v1`, apiKey: "isolated-test-only", reasoning: false },
    });
    const deadline = Date.now() + 40_000;
    while (!["done", "failed", "cancelled"].includes(server.supervisor.snapshot(taskId)?.taskState)) {
      const pending = server.supervisor.snapshot(taskId)?.pendingInput;
      if (pending?.type === "approval_requested" && !approved.has(pending.approvalId)) {
        // Simulate a user approving this synthetic call in the isolated test host.
        // Production application code only observes approval; it has no approval API.
        assert.equal(pending.summary, "mewvis.decisions/evaluate");
        assert.match(pending.details, /镇长记错了桥的方向/);
        approved.add(pending.approvalId);
        await call("answer_agent_runtime_approval", { taskId, approvalId: pending.approvalId, approved: true });
      }
      if (Date.now() > deadline) throw new Error(`runtime task timed out: ${taskId}; ${JSON.stringify({ requests: requests.length, snapshot: server.supervisor.snapshot(taskId), events: events.slice(-6) })}`);
      await delay(20);
    }
    const own = events.map(event => event.payload?.event).filter(event => event?.taskId === taskId);
    assert.equal(server.supervisor.snapshot(taskId).taskState, "done", JSON.stringify(own.slice(-8)));
    const done = own.findLast(event => event.type === "done");
    assert.equal(approved.size, 1, "ask mode requires the existing host confirmation");
    assert.ok(done?.text, JSON.stringify(own.slice(-8)));
    return parseDecisionText(done.text, options);
  };
  assert.deepEqual(await run("pocket-accepted"), { value: "不触发法则", status: "accepted", reason: "镇长确实记错了路，给出的材料不足以说明他故意说谎。" });
  decision = "触发法则"; confidence = .2;
  assert.equal((await run("pocket-review")).status, "review_required");
  decision = null; confidence = 0;
  assert.equal((await run("pocket-abstained")).status, "abstained");
  assert.equal(requests.length, 6, "three judgments make six requests; command dispatch bypasses parent inference");
  assert.ok(requests.every(request => !request.tools?.length), "judgment subtasks receive no tools");
});
