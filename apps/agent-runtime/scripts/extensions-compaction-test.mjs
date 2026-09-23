import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function verifyExtensionCompaction({
  api,
  workspace,
  piCommand,
  createPiAgentSession,
  createAgentSessionPlan,
}) {
  const entry = join(workspace, "compaction-plugin.mjs");
  await writeFile(
    entry,
    `import {writeFile} from 'node:fs/promises';
  export default {id:'test.compaction',protocolVersion:1,setup(ctx){
    let calls=0;
    ctx.use('session_compact',async data=>{
      calls++;ctx.session.set('before',data);ctx.session.set('pending',true);
      const mode=ctx.session.get('mode');
      if(mode==='fail')throw new Error('compact middleware failed');
      if(mode==='reserved-error')throw new Error('Nothing to compact');
      if(mode==='invalid')return {action:'replace',value:{...data,instructions:'changed'}};
      if(mode==='wait'){await writeFile(ctx.config.ready,'ready');await new Promise(r=>setTimeout(r,30000))}
      ctx.session.delete('pending');
      if(mode==='block')return {action:'block',reason:'preserve history'};
      return {action:'continue'};
    });
    ctx.use('session_compact',()=>{ctx.session.set('second',(ctx.session.get('second')??0)+1);return {action:'continue'}});
    ctx.on('session_compact_finished',event=>{
      ctx.session.set('result',event);
      if(ctx.session.get('mode')==='observer-fail')throw new Error('compact observer failed');
    });
    ctx.registerCommand({name:'control',description:'Control',parameters:{type:'object'},async execute(input){
      if(input.mode){ctx.session.set('mode',input.mode);for(const key of ['before','result','second'])ctx.session.delete(key)}
      return {calls,before:ctx.session.get('before')??null,result:ctx.session.get('result')??null,second:ctx.session.get('second')??0,pending:ctx.session.get('pending')??false};
    }});
  }};`,
  );
  const requests = [];
  let failProvider = false;
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    requests.push(JSON.parse(body));
    if (failProvider) {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: { message: "summary rejected" } }));
      return;
    }
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    response.end(
      `data: ${JSON.stringify({ id: "compact", object: "chat.completion.chunk", model: "local", choices: [{ index: 0, delta: { content: "retained summary" }, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`,
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const model = { ...piCommand.runtimeModel, apiEndpoint: `http://127.0.0.1:${server.address().port}/v1` };
  const ready = join(workspace, "compaction-ready");
  const source = {
    id: "test.compaction",
    entry,
    config: { ready },
    capabilities: ["commands", "session.state", "middleware.session_compact", "events.session"],
    commandRisks: { control: "low" },
  };
  const mock = api.createScriptedMockRuntime("compact-mock", [{ type: "compact", summary: "retained summary" }]);
  const mockFailed = api.createScriptedMockRuntime("compact-mock-failed", [
    { type: "compact", fail: "native compact failed" },
  ]);
  const mockSkipped = api.createScriptedMockRuntime("compact-mock-skipped", [{ type: "compact" }]);
  const diagnostics = [];
  const sdk = api.createAgentRuntime({
    extensions: [source],
    runtimeAgents: [mock, mockFailed, mockSkipped],
    callbacks: { onExtensionError: (e) => diagnostics.push(e) },
  });
  let index = 0;
  const seed = async (target) => {
    const plan = await createAgentSessionPlan({ ...target, runtimeId: "pi", agentRoleId: "main" });
    const native = await createPiAgentSession(
      { ...piCommand, ...target, ...plan, runtimeModel: model, taskId: "seed", agentTaskPrompt: "" },
      {},
    );
    try {
      for (let i = 0; i < 3; i++) {
        native.session.sessionManager.appendMessage({
          role: "user",
          content: `part ${i}:` + "history ".repeat(14000),
          timestamp: Date.now(),
        });
        native.session.sessionManager.appendMessage({
          role: "assistant",
          content: [{ type: "text", text: "acknowledged" }],
          api: "openai-completions",
          provider: native.session.model.provider,
          model: native.session.model.id,
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          stopReason: "stop",
          timestamp: Date.now(),
        });
      }
    } finally {
      native.session.dispose();
      await native.disposeResources();
    }
  };
  const control = (target, mode) =>
    sdk.extensions.executeCommand({ ...target, commandId: "test.compaction/control", arguments: mode ? { mode } : {} });
  const compactInput = (target) => ({
    ...target,
    target: { scope: "agent", agentRoleId: "main" },
    runtime: { model, resources: { tools: { allowed: [] }, skills: { enabled: [] } } },
    options: { compactInstruction: "keep decisions" },
  });
  try {
    for (const runtimeId of [mock.id, "pi"]) {
      for (const mode of ["allow", "block", "fail", "invalid", "observer-fail"]) {
        const target = { workspacePath: workspace, sessionRootDir: join(workspace, `compact-${++index}`) };
        if (runtimeId === "pi") await seed(target);
        await control(target, mode);
        const beforeRequests = requests.length;
        if (runtimeId === "pi") {
          if (mode === "fail" || mode === "invalid")
            await assert.rejects(sdk.session.agent.compact(compactInput(target)), /compact middleware failed|仅支持/);
          else assert.equal((await sdk.session.agent.compact(compactInput(target))).compacted, mode !== "block");
          assert.equal(
            requests.length > beforeRequests,
            mode === "allow" || mode === "observer-fail",
            "拦截/错误不能继续调用摘要模型",
          );
        } else {
          const result = await sdk.agent.run({ ...piCommand, ...target, runtimeId, taskId: `compact-${index}` });
          assert.equal(result.success, mode !== "fail" && mode !== "invalid", result.message);
        }
        const state = await control(target);
        assert.equal(state.calls, 1);
        assert.equal(state.pending, false);
        assert.equal(state.second, mode === "allow" || mode === "observer-fail" ? 1 : 0);
        if (mode === "observer-fail") assert.equal(state.result, null, "观察器失败不能回滚原生已完成的压缩");
        else {
          assert.equal(state.result.status, mode === "block" ? "blocked" : mode === "allow" ? "completed" : "failed");
          if (mode === "fail" || mode === "invalid") assert.equal(state.before, null, "错误返回回滚压缩前事务");
          else assert.equal(state.before.operationId, state.result.operationId);
          if (runtimeId === "pi" && state.before) assert.equal(state.before.instructions, "keep decisions");
        }
        // A block must leave the native session compactable; the next allowed attempt performs real work.
        if (mode === "block" && runtimeId === "pi") {
          await control(target, "allow");
          assert.equal((await sdk.session.agent.compact(compactInput(target))).compacted, true);
          assert.equal((await control(target)).calls, 2, "维护操作复用同一会话插件实例");
        }
      }
    }
    assert.equal(diagnostics.length, 2);
    const reserved = { workspacePath: workspace, sessionRootDir: join(workspace, "compact-reserved-error") };
    await seed(reserved);
    await control(reserved, "reserved-error");
    await assert.rejects(sdk.session.agent.compact(compactInput(reserved)), /Nothing to compact/);
    assert.equal((await control(reserved)).result.status, "failed", "插件错误文本不能被误识别为原生跳过");
    for (const mode of ["allow", "block", "fail"]) {
      const target = { workspacePath: workspace, sessionRootDir: join(workspace, `compact-auto-${mode}`) };
      await seed(target);
      await control(target, mode);
      const beforeRequests = requests.length;
      const result = await sdk.agent.run({
        ...piCommand,
        ...target,
        taskId: `compact-auto-${mode}`,
        resources: { tools: { allowed: [] }, skills: { enabled: [] } },
        runtimeModel: { ...model, contextWindow: 90000 },
      });
      assert.equal(result.success, mode !== "fail", result.message);
      const state = await control(target);
      assert.equal(state.result.reason, "threshold");
      assert.equal(state.result.status, mode === "allow" ? "completed" : mode === "block" ? "blocked" : "failed");
      if (mode === "fail") assert.equal(requests.length, beforeRequests, "自动压缩钩子错误不能继续生成摘要或请求模型");
      if (mode === "block") assert.equal(requests.length, beforeRequests + 1, "阻止自动压缩仍允许本轮普通模型请求");
      if (mode === "allow") assert.ok(requests.length >= beforeRequests + 2, "真实自动压缩必须先请求摘要模型");
    }
    const empty = { workspacePath: workspace, sessionRootDir: join(workspace, "compact-empty") };
    assert.equal((await sdk.session.agent.compact(compactInput(empty))).compacted, false);
    assert.equal((await control(empty)).result.status, "skipped");
    const rejected = { workspacePath: workspace, sessionRootDir: join(workspace, "compact-provider-error") };
    await seed(rejected);
    failProvider = true;
    await assert.rejects(sdk.session.agent.compact(compactInput(rejected)), /summary rejected/);
    failProvider = false;
    assert.equal((await control(rejected)).result.status, "failed");
    for (const [runtimeId, status] of [
      [mockFailed.id, "failed"],
      [mockSkipped.id, "skipped"],
    ]) {
      const target = { workspacePath: workspace, sessionRootDir: join(workspace, runtimeId) };
      await sdk.agent.run({ ...piCommand, ...target, runtimeId, taskId: runtimeId });
      assert.equal((await control(target)).result.status, status);
    }
    // Hold an actual compaction middleware transaction, queue a command, then cancel.
    const target = { workspacePath: workspace, sessionRootDir: join(workspace, "compact-cancel") };
    await seed(target);
    await control(target, "wait");
    const controller = new AbortController();
    const running = sdk.session.agent.compact(compactInput(target), { signal: controller.signal });
    const settled = running.catch(() => {});
    try {
      const deadline = Date.now() + 15000;
      while (true) {
        try {
          await readFile(ready);
          break;
        } catch (error) {
          if (error.code !== "ENOENT" || Date.now() > deadline) throw error;
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }
      let queried = false;
      const queued = control(target).then((value) => {
        queried = true;
        return value;
      });
      await new Promise((resolve) => setTimeout(resolve, 40));
      assert.equal(queried, false, "命令不能插入正在压缩的同会话");
      controller.abort();
      await assert.rejects(running, /abort|取消/i);
      const state = await queued;
      assert.equal(state.pending, false);
      assert.equal(state.before, null);
      assert.equal(state.calls, 0, "取消后旧 worker 失效，不复用闭包");
    } finally {
      controller.abort();
      await settled;
    }
    console.log("PASS 原生 Pi 压缩与 Mock：允许/阻止、错误拒绝继续、结果通知、状态回滚、会话排队与取消");
  } finally {
    await sdk.shutdown();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
