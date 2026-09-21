import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const eventTypes = [
  "run_started",
  "turn_started",
  "message_started",
  "message_updated",
  "message_finished",
  "tool_started",
  "tool_finished",
  "turn_finished",
  "run_finished",
];
const capabilities = ["commands", "session.state", "events.run", "events.tool", "events.turn", "events.message"];

export async function verifyExtensionEvents({ api, hostApi, workspace, command, piCommand }) {
  const entry = join(workspace, "events.mjs");
  const witnessEntry = join(workspace, "events-witness.mjs");
  const fixture = `import {writeFile} from 'node:fs/promises';
  export default {id:'test.events',apiVersion:1,setup(ctx){
    for(const type of ${JSON.stringify(eventTypes)})ctx.on(type,async event=>{
      const events=ctx.session.get('events')??[];events.push(event);ctx.session.set('events',events);
      if(event.type==='message_updated'){
        if(ctx.config.fail){ctx.session.set('failed',true);throw new Error('observer failed')}
        if(ctx.config.ready){ctx.session.set('uncommitted',true);await writeFile(ctx.config.ready,'ready');await new Promise(r=>setTimeout(r,30000))}
      }
      if(ctx.config.mutate&&event.message) event.message.content=[{type:'text',text:'tampered'}];
    });
    ctx.registerCommand({name:'inspect',description:'Inspect',parameters:{type:'object'},async execute(){return {events:ctx.session.get('events')??[],failed:ctx.session.get('failed')??false,uncommitted:ctx.session.get('uncommitted')??false}}});
  }};`;
  await writeFile(entry, fixture);
  await writeFile(witnessEntry, fixture.replace("id:'test.events'", "id:'test.witness'"));
  const source = { id: "test.events", entry, capabilities, commandRisks: { inspect: "low" } };
  await assert.rejects(
    () =>
      hostApi.createExtensionHost(
        [{ ...source, capabilities: capabilities.filter((item) => item !== "events.message") }],
        workspace,
      ),
    /events.message/,
  );
  await assert.rejects(
    () =>
      hostApi.createExtensionHost(
        [{ ...source, capabilities: capabilities.filter((item) => item !== "events.turn") }],
        workspace,
      ),
    /events.turn/,
  );
  const toolEntry = join(workspace, "events-tool.mjs");
  await writeFile(
    toolEntry,
    `export default {id:'test.echo',apiVersion:1,setup(ctx){ctx.registerTool({name:'echo',label:'Echo',description:'Echo',parameters:{type:'object'},async execute(input){return {content:[{type:'text',text:'tool response'}],details:null}}})}};`,
  );
  const tool = { id: "test.echo", entry: toolEntry, capabilities: ["tools"], toolRisks: { echo: "low" } };
  const mock = api.createScriptedMockRuntime("events-mock", [
    { type: "tool", name: "ext_test_echo__echo", input: {} },
    { type: "text", text: "done" },
  ]);
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body);
    const replied = payload.messages.at(-1).role === "tool";
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    const send = (delta, finish_reason = null) =>
      response.write(
        `data: ${JSON.stringify({ id: "events", object: "chat.completion.chunk", model: "local", choices: [{ index: 0, delta, finish_reason }] })}\n\n`,
      );
    if (replied) {
      send({ content: "do" });
      send({ content: "ne" }, "stop");
    } else {
      send(
        {
          tool_calls: [
            {
              index: 0,
              id: "events-call",
              type: "function",
              function: { name: "ext_test_echo__echo", arguments: "{}" },
            },
          ],
        },
        "tool_calls",
      );
    }
    response.end("data: [DONE]\n\n");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const model = { ...piCommand.runtimeModel, apiEndpoint: `http://127.0.0.1:${server.address().port}/v1` };
  let sequence = 0;
  const sources = (config = {}) => [
    { ...source, config },
    { ...source, id: "test.witness", entry: witnessEntry },
    tool,
  ];
  const assertSequence = (events) => {
    assert.equal(events[0].type, "run_started");
    assert.equal(events.at(-1).type, "run_finished");
    assert.equal(events.at(-1).status, "completed");
    const started = new Map(),
      finished = new Map();
    const turns = [];
    for (const event of events) {
      if (event.type === "turn_started") turns.push(event.turnIndex);
      if (event.type === "message_started") {
        assert.equal(started.has(event.message.id), false);
        started.set(event.message.id, event.message);
      }
      if (event.type === "message_updated" || event.type === "message_finished") {
        assert.ok(started.has(event.message.id), "开始、流式副本和终态必须共享 ID");
        assert.equal(finished.has(event.message.id), false);
        if (event.type === "message_finished") finished.set(event.message.id, event.message);
      }
      if (event.type === "turn_finished") {
        assert.deepEqual(event.message, finished.get(event.message.id));
        for (const result of event.toolResults) assert.deepEqual(result, finished.get(result.id));
      }
    }
    assert.deepEqual(turns, [0, 1]);
    assert.equal(started.size, 4);
    assert.equal(finished.size, 4);
    assert.equal(events.filter((e) => e.type === "turn_finished").length, 2);
    const ends = [...finished.values()];
    assert.deepEqual(
      ends.map((m) => m.role),
      ["user", "assistant", "tool", "assistant"],
    );
    const call = ends[1].content.find((block) => block.type === "tool_call");
    assert.equal(call.callId, ends[2].callId);
    assert.equal(call.toolName, "ext_test_echo__echo");
    assert.equal(ends[2].isError, false);
    assert.equal(ends[3].content[0].text, "done");
    assert.ok(events.some((e) => e.type === "message_updated" && e.change.type === "text_delta"));
    return [...started.keys()];
  };
  try {
    for (const runtimeId of [mock.id, "pi"]) {
      const target = { workspacePath: workspace, sessionRootDir: join(workspace, `events-session-${++sequence}`) };
      const diagnostics = [];
      const sdk = api.createAgentRuntime({
        runtimeAgents: [mock],
        extensions: sources({ mutate: true }),
        callbacks: { onExtensionError: (e) => diagnostics.push(e) },
      });
      const run = (taskId) =>
        sdk.agent.run({
          ...piCommand,
          ...target,
          resources: { tools: { allowed: ["ext_test_echo__echo"] } },
          runtimeId,
          runtimeModel: model,
          taskId,
          agentRoleId: "main",
          userMessage: "test events",
        });
      try {
        const firstId = `events-${++sequence}`;
        const first = await run(firstId);
        assert.equal(first.success, true, first.message);
        const inspect = (id) => sdk.extensions.executeCommand({ ...target, commandId: `${id}/inspect` });
        const captured = (await inspect("test.events")).events;
        const firstIds = assertSequence(captured);
        assert.ok(captured.every((e) => e.taskId === firstId));
        assert.deepEqual((await inspect("test.witness")).events, captured, "插件修改快照不能影响后续观察器或 Agent");
        const nextId = `events-${++sequence}`;
        const second = await run(nextId);
        assert.equal(second.success, true, second.message);
        const nextEvents = (await inspect("test.events")).events.filter((e) => e.taskId === nextId);
        const secondIds = assertSequence(nextEvents);
        assert.ok(
          secondIds.every((id) => !firstIds.includes(id)),
          "后续运行不得复用旧消息 ID",
        );
        assert.deepEqual(diagnostics, []);
      } finally {
        await sdk.shutdown();
      }

      const failedTarget = {
        workspacePath: workspace,
        sessionRootDir: join(workspace, `events-failure-${++sequence}`),
      };
      const broken = api.createAgentRuntime({
        runtimeAgents: [mock],
        extensions: sources({ fail: true }),
        callbacks: { onExtensionError: (e) => diagnostics.push(e) },
      });
      try {
        const result = await broken.agent.run({
          ...piCommand,
          ...failedTarget,
          resources: { tools: { allowed: ["ext_test_echo__echo"] } },
          runtimeId,
          runtimeModel: model,
          taskId: `events-failed-${sequence}`,
          agentRoleId: "main",
          userMessage: "test failure",
        });
        assert.equal(result.success, true, result.message);
        const state = await broken.extensions.executeCommand({ ...failedTarget, commandId: "test.events/inspect" });
        assert.equal(state.failed, false);
        assert.equal(
          state.events.some((e) => e.type === "message_updated"),
          false,
          "观察器异常只回滚当前事件事务",
        );
        assertSequence(
          (await broken.extensions.executeCommand({ ...failedTarget, commandId: "test.witness/inspect" })).events,
        );
        assert.ok(diagnostics.length > 0);
        assert.ok(diagnostics.every((e) => e.eventType === "message_updated" && e.extensionId === "test.events"));
      } finally {
        await broken.shutdown();
      }

      const ready = join(workspace, `events-ready-${++sequence}`);
      const selected = sources({ ready });
      const cancelledTarget = {
        workspacePath: workspace,
        sessionRootDir: join(workspace, `events-cancel-${sequence}`),
      };
      const engine = api.createAgentEngine({
        registry: api.createRuntimeAgentRegistry([...api.builtinRuntimeAgents, mock]),
        getExtensionSources: () => selected,
      });
      const controller = new AbortController();
      let earlyError;
      const cancelledRun = engine.runAgent(
        {
          ...piCommand,
          ...cancelledTarget,
          resources: { tools: { allowed: ["ext_test_echo__echo"] } },
          runtimeId,
          runtimeModel: model,
          taskId: `events-cancel-${sequence}`,
        },
        {
          emit() {},
          signal: controller.signal,
          callbacks: { requestUserInput: async () => assert.fail("unexpected input") },
        },
      );
      const settled = cancelledRun.catch((error) => {
        earlyError = error;
      });
      try {
        const deadline = Date.now() + 15000;
        while (true) {
          if (earlyError) throw earlyError;
          try {
            await readFile(ready);
            break;
          } catch (error) {
            if (error.code !== "ENOENT" || Date.now() > deadline) throw error;
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
        }
      } finally {
        controller.abort();
        await settled;
        await engine.dispose();
      }
      await assert.rejects(cancelledRun, /取消|abort/i);
      const inspector = api.createAgentRuntime({ extensions: selected });
      try {
        const state = await inspector.extensions.executeCommand({
          ...cancelledTarget,
          commandId: "test.events/inspect",
        });
        assert.equal(state.uncommitted, false);
        assert.equal(
          state.events.some((e) => e.type === "message_updated"),
          false,
        );
        assert.equal(state.events.at(-1).type, "run_finished");
        assert.equal(state.events.at(-1).status, "cancelled");
      } finally {
        await inspector.shutdown();
      }
    }
    console.log("PASS Pi/Mock 消息与回合时序、流式快照 ID、跨轮隔离、观察器回滚和取消终态");
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
