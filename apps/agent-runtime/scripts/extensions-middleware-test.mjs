import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function verifyExtensionMiddleware({ api, workspace, command, piCommand }) {
  const toolsEntry = join(workspace, "middleware-tools.mjs");
  await writeFile(
    toolsEntry,
    `export default {id:'isle.example',protocolVersion:1,setup(ctx){
    ctx.registerTool({name:'text_stats',label:'Echo',description:'Echo',parameters:{type:'object',properties:{text:{type:'string'}},required:['text'],additionalProperties:false},
      async execute(input){ctx.session.set('calls',(ctx.session.get('calls')??0)+1);ctx.session.set('input',input);if(ctx.config.fail)throw new Error('producer failed');return {content:[{type:'text',text:input.text}],details:input}}});
    ctx.registerCommand({name:'inspect',description:'Inspect',parameters:{type:'object'},async execute(){return {calls:ctx.session.get('calls')??0,input:ctx.session.get('input')??null}}});
  }};`,
  );
  const entries = [];
  for (const label of ["first", "second"]) {
    const entry = join(workspace, `middleware-${label}.mjs`);
    entries.push(entry);
    await writeFile(
      entry,
      `import {writeFile} from 'node:fs/promises';
      export default {id:'test.${label}',protocolVersion:1,setup(ctx){
        for(const type of ['input','system_prompt','context','tool_call','tool_result']) ctx.use(type,async data=>{
          ctx.session.set('seen.'+type,true);
          if(ctx.config.fail===type) throw new Error('middleware failed: '+type);
          if(ctx.config.invalid===type) return {action:'replace',value:{bad:true}};
          if(ctx.config.wait===type){await writeFile(ctx.config.ready,'ready');await new Promise(r=>setTimeout(r,30000))}
          if(ctx.config.block===type) return {action:'block',reason:'blocked by ${label}'};
          if(type==='input'||type==='system_prompt') return {action:'replace',value:{text:data.text+' [${label}-'+type+']'}};
          if(type==='context') {
            if(ctx.config.badRef) return {action:'replace',value:{messages:[{id:'missing',role:'user',text:'forged'}]}};
            return {action:'replace',value:{messages:[{role:'user',text:'${label}-context'},...data.messages]}};
          }
          if(type==='tool_call'){
            if(ctx.config.invalidArgs) return {action:'replace',value:{...data,input:{text:{bad:true}}}};
            if(ctx.config.identity) return {action:'replace',value:{...data,toolName:'different'}};
            if(ctx.config.rewritePath) return {action:'replace',value:{...data,input:{...data.input,path:ctx.config.rewritePath}}};
            if(typeof data.input.text==='string') return {action:'replace',value:{...data,input:{text:data.input.text+'-${label}'}}};
            return {action:'continue'};
          }
          return {action:'replace',value:{...data,result:{...data.result,isError:ctx.config.heal?false:data.result.isError,details:ctx.config.clearDetails?null:data.result.details,content:[{type:'text',text:data.result.content.filter(p=>p.type==='text').map(p=>p.text).join('')+'-${label}-result'}]}}};
        });
        ctx.registerCommand({name:'inspect',description:'Inspect',parameters:{type:'object'},async execute(input){return ctx.session.get('seen.'+input.type)??false}});
      }};`,
    );
  }
  const sources = (config = {}, second = true) => [
    {
      id: "isle.example",
      entry: toolsEntry,
      config: { fail: !!config.failTool },
      capabilities: ["tools", "commands", "session.state"],
      toolRisks: { text_stats: "low" },
      commandRisks: { inspect: "low" },
    },
    ...entries.slice(0, second ? 2 : 1).map((entry, index) => ({
      id: `test.${index ? "second" : "first"}`,
      entry,
      config: index ? {} : config,
      capabilities: [
        "commands",
        "session.state",
        ...["input", "system_prompt", "context", "tool_call", "tool_result"].map((t) => `middleware.${t}`),
      ],
      commandRisks: { inspect: "low" },
    })),
  ];
  const requests = [];
  let tool = { name: "ext_isle_example__text_stats", input: { text: "original" } };
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body);
    requests.push(payload);
    const replied = payload.messages.at(-1).role === "tool";
    const delta = replied
      ? { content: "finished" }
      : {
          tool_calls: [
            {
              index: 0,
              id: "middleware-call",
              type: "function",
              function: { name: tool.name, arguments: JSON.stringify(tool.input) },
            },
          ],
        };
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    response.end(
      `data: ${JSON.stringify({ id: "middleware", object: "chat.completion.chunk", model: "local", choices: [{ index: 0, delta, finish_reason: replied ? "stop" : "tool_calls" }] })}\n\ndata: [DONE]\n\n`,
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const model = { ...piCommand.runtimeModel, apiEndpoint: `http://127.0.0.1:${server.address().port}/v1` };
  const mock = api.createScriptedMockRuntime("middleware-mock", [{ type: "tool", name: tool.name, input: tool.input }]);
  const requestMock = api.createScriptedMockRuntime("middleware-request", [{ type: "request" }]);
  let sequence = 0;
  const create = (config, second = true) => {
    const events = [];
    const sdk = api.createAgentRuntime({
      runtimeAgents: [mock, requestMock],
      extensions: sources(config, second),
      callbacks: { onEvent: (e) => events.push(e) },
    });
    const target = { workspacePath: workspace, sessionRootDir: join(workspace, `middleware-session-${++sequence}`) };
    return {
      sdk,
      events,
      target,
      run: (runtimeId, extra = {}) =>
        sdk.agent.run({
          ...piCommand,
          ...target,
          runtimeId,
          runtimeModel: model,
          taskId: `middleware-${++sequence}`,
          agentRoleId: "main",
          userMessage: "input",
          ...extra,
        }),
      inspect: (commandId = "isle.example/inspect", args = {}) =>
        sdk.extensions.executeCommand({ ...target, commandId, arguments: args }),
    };
  };
  try {
    const sample = create();
    try {
      const request = await sample.run(requestMock.id);
      assert.equal(request.success, true, request.message);
      const frame = JSON.parse(
        sample.events
          .filter((e) => e.type === "text_delta")
          .map((e) => e.delta)
          .join(""),
      );
      assert.match(frame.text, /\[first-input\] \[second-input\]$/);
      assert.match(frame.systemPrompt, /\[first-system_prompt\] \[second-system_prompt\]$/);
      assert.deepEqual(
        frame.messages.slice(0, 2).map((m) => m.text),
        ["second-context", "first-context"],
      );
      const mockResult = await sample.run(mock.id);
      assert.equal(mockResult.success, true, mockResult.message);
      assert.deepEqual(await sample.inspect(), { calls: 1, input: { text: "original-first-second" } });
      assert.ok(
        sample.events.some(
          (e) =>
            e.type === "tool_execution_end" &&
            JSON.stringify(e.result).includes("original-first-second-first-result-second-result"),
        ),
      );
      requests.length = 0;
      const pi = await sample.run("pi");
      assert.equal(pi.success, true, pi.message);
      assert.equal(requests.length, 2);
      assert.match(JSON.stringify(requests[0].messages), /first-input.*second-input/);
      assert.match(JSON.stringify(requests[0].messages), /first-system_prompt.*second-system_prompt/);
      assert.match(JSON.stringify(requests[0].messages), /second-context.*first-context/);
      assert.match(JSON.stringify(requests[1].messages.at(-1)), /original-first-second-first-result-second-result/);
      assert.deepEqual(await sample.inspect(), { calls: 2, input: { text: "original-first-second" } });
    } finally {
      await sample.sdk.shutdown();
    }
    console.log("PASS 两插件按序串联输入、系统提示、上下文、工具参数和结果；真实 Pi 请求与 Mock 一致");

    for (const runtimeId of [mock.id, "pi"]) {
      for (const hook of ["input", "tool_call"]) {
        const sample = create({ block: hook });
        try {
          requests.length = 0;
          const result = await sample.run(runtimeId);
          assert.equal(result.success, hook === "tool_call", result.message);
          assert.equal((await sample.inspect()).calls, 0);
          assert.equal(await sample.inspect("test.second/inspect", { type: hook }), false, "block 必须短路后续插件");
          if (runtimeId === "pi") assert.equal(requests.length, hook === "input" ? 0 : 2);
        } finally {
          await sample.sdk.shutdown();
        }
      }
      for (const hook of ["input", "system_prompt", "context", "tool_call", "tool_result"]) {
        const sample = create({ fail: hook }, false);
        try {
          requests.length = 0;
          const result = await sample.run(runtimeId);
          assert.equal(result.success, false, `${runtimeId}:${hook}`);
          assert.match(result.message, /middleware failed/);
          assert.equal(await sample.inspect("test.first/inspect", { type: hook }), false, "失败处理器状态必须回滚");
          assert.equal((await sample.inspect()).calls, hook === "tool_result" ? 1 : 0);
          if (runtimeId === "pi")
            assert.equal(requests.length, hook.startsWith("tool_") ? 1 : 0, "失败后不能继续发送模型请求");
        } finally {
          await sample.sdk.shutdown();
        }
      }
      const invalid = create({ invalid: "context" }, false);
      try {
        requests.length = 0;
        const result = await invalid.run(runtimeId);
        assert.equal(result.success, false);
        assert.equal((await invalid.inspect()).calls, 0);
        assert.equal(await invalid.inspect("test.first/inspect", { type: "context" }), false);
        if (runtimeId === "pi") assert.equal(requests.length, 0);
      } finally {
        await invalid.sdk.shutdown();
      }
      const invalidArgs = create({ invalidArgs: true }, false);
      try {
        await invalidArgs.run(runtimeId);
        assert.equal((await invalidArgs.inspect()).calls, 0, "变更后的无效参数必须被最终 schema 检查拒绝");
        assert.ok(invalidArgs.events.some((e) => e.type === "tool_execution_end" && e.isError));
      } finally {
        await invalidArgs.sdk.shutdown();
      }
      for (const config of [{ badRef: true }, { identity: true }]) {
        const invalidIdentity = create(config, false);
        try {
          const result = await invalidIdentity.run(runtimeId);
          assert.equal(result.success, false);
          assert.equal((await invalidIdentity.inspect()).calls, 0);
        } finally {
          await invalidIdentity.sdk.shutdown();
        }
      }
      const cleared = create({ clearDetails: true }, false);
      try {
        const result = await cleared.run(runtimeId);
        assert.equal(result.success, true, result.message);
        assert.equal(cleared.events.find((e) => e.type === "tool_execution_end").result.details, null);
      } finally {
        await cleared.sdk.shutdown();
      }
      const healed = create({ failTool: true, heal: true }, false);
      try {
        const result = await healed.run(runtimeId);
        assert.equal(result.success, true, result.message);
        const end = healed.events.find((e) => e.type === "tool_execution_end");
        assert.equal(end.isError, false);
        assert.match(JSON.stringify(end.result), /producer failed-first-result/);
        assert.equal((await healed.inspect()).calls, 0, "工具失败事务回滚，结果转换不应重放工具");
        assert.equal(await healed.inspect("test.first/inspect", { type: "tool_result" }), true);
      } finally {
        await healed.sdk.shutdown();
      }
    }
    console.log("PASS 输入/工具阻断短路，五种中间件异常阻止继续执行，错误结果回滚及最终参数重检");

    // Pi built-in tools use the same final safety boundary after plugin argument changes.
    tool = { name: "write", input: { path: join(workspace, "middleware-safe.txt"), content: "must not write" } };
    const protectedPath = join(workspace, ".env");
    const guarded = create({ rewritePath: protectedPath }, false);
    try {
      const result = await guarded.run("pi", { resources: { tools: { allowed: ["write"] } } });
      assert.equal(result.success, true, result.message);
      assert.ok(guarded.events.some((e) => e.type === "tool_execution_end" && e.toolName === "write" && e.isError));
      await assert.rejects(() => readFile(protectedPath), { code: "ENOENT" });
      await assert.rejects(() => readFile(tool.input.path), { code: "ENOENT" });
    } finally {
      await guarded.sdk.shutdown();
    }
    console.log("PASS Pi 内置工具参数经中间件修改后仍受最终文件权限检查");

    // Cancellation occurs inside a real middleware worker; no call or uncommitted state survives.
    for (const runtimeId of [mock.id, "pi"]) {
      const ready = join(workspace, `middleware-ready-${runtimeId}`);
      const target = { workspacePath: workspace, sessionRootDir: join(workspace, `middleware-cancel-${runtimeId}`) };
      const selected = sources({ wait: "input", ready }, false);
      const engine = api.createAgentEngine({
        registry: api.createRuntimeAgentRegistry([...api.builtinRuntimeAgents, mock]),
        getExtensionSources: () => selected,
      });
      const controller = new AbortController();
      const run = engine.runAgent(
        { ...piCommand, ...target, runtimeId, runtimeModel: model, taskId: `cancel-${runtimeId}` },
        { signal: controller.signal, emit() {}, callbacks: {} },
      );
      const rejected = assert.rejects(run, /取消|abort/i);
      try {
        const deadline = Date.now() + 10000;
        while (true) {
          try {
            await readFile(ready);
            break;
          } catch (error) {
            if (error.code !== "ENOENT" || Date.now() >= deadline) throw error;
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
        }
      } finally {
        controller.abort();
        await rejected;
        await engine.dispose();
      }
      const sdk = api.createAgentRuntime({ extensions: selected });
      try {
        assert.equal(
          await sdk.extensions.executeCommand({
            ...target,
            commandId: "test.first/inspect",
            arguments: { type: "input" },
          }),
          false,
        );
        assert.equal((await sdk.extensions.executeCommand({ ...target, commandId: "isle.example/inspect" })).calls, 0);
      } finally {
        await sdk.shutdown();
      }
    }
    console.log("PASS 真实 Pi/Mock 中间件执行中取消：状态回滚，不重放调用");
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
