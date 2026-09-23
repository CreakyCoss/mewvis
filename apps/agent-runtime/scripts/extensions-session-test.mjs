import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function verifyExtensionSessions({ api, workspace, command, piCommand }) {
  const entry = join(workspace, "session-probe.mjs");
  const log = join(workspace, "session-lifecycle.jsonl");
  await writeFile(
    entry,
    `
    import {randomUUID} from 'node:crypto';
    import {appendFile} from 'node:fs/promises';
    export default {id:'isle.example',protocolVersion:1,setup(ctx){
      const id=randomUUID(); let calls=0, runs=0;
      const record=(phase,extra={})=>appendFile(${JSON.stringify(log)},JSON.stringify({id,phase,...extra})+'\\n');
      ctx.onActivate(()=>record('activate')); ctx.own(()=>record('dispose'));
      ctx.on('run_started',async event=>{runs++;await record('run_started',{taskId:event.taskId})});
      ctx.on('run_finished',async event=>{
        if(event.status==='cancelled') await new Promise(r=>setTimeout(r,30));
        await record('run_finished',{taskId:event.taskId,status:event.status});
      });
      const probe=()=>{
        const persisted=(ctx.session.get('calls')??0)+1; ctx.session.set('calls',persisted);
        return {id,calls:++calls,runs,persisted,config:ctx.config};
      };
      ctx.registerCommand({name:'probe',description:'Probe',parameters:{type:'object'},async execute(){return probe()}});
      ctx.registerTool({name:'text_stats',label:'Probe',description:'Probe',parameters:{type:'object'},async execute(input,{progress}){
        if(input.wait){progress({content:[],details:{ready:true}});await new Promise(r=>setTimeout(r,30000))}
        const details=probe();return {content:[{type:'text',text:JSON.stringify(details)}],details};
      }});
    }};
  `,
  );
  let sources = [{ id: "isle.example", entry, commandRisks: { probe: "low" }, toolRisks: { text_stats: "low" } }];
  const mock = api.createScriptedMockRuntime("session-probe", [
    { type: "command", name: "isle.example/probe", input: {} },
  ]);
  const sdk = api.createAgentRuntime({ extensions: sources, runtimeAgents: [mock] });
  const target = { workspacePath: workspace, sessionRootDir: join(workspace, "live-session") };
  const probe = (selected = target) => sdk.extensions.executeCommand({ ...selected, commandId: "isle.example/probe" });
  const lifecycle = async () => (await readFile(log, "utf8")).trim().split("\n").map(JSON.parse);
  try {
    await sdk.extensions.listCommands(target);
    const first = await probe();
    assert.equal(first.calls, 1);
    const mockResult = await sdk.agent.run({
      ...command,
      ...target,
      runtimeId: mock.id,
      taskId: "session-mock",
      agentRoleId: "main",
    });
    assert.equal(mockResult.success, true, mockResult.message);
    const afterMock = await probe();
    assert.equal(afterMock.id, first.id);
    assert.equal(afterMock.calls, 3);
    assert.equal(afterMock.runs, 1);
    const piResult = await sdk.agent.run({ ...piCommand, ...target, taskId: "session-pi", agentRoleId: "main" });
    assert.equal(piResult.success, true, piResult.message);
    const afterPi = await probe();
    assert.equal(afterPi.id, first.id);
    assert.equal(afterPi.calls, 5);
    assert.equal(afterPi.runs, 2);
    const parallel = await Promise.all(Array.from({ length: 6 }, () => probe()));
    assert.deepEqual(
      parallel.map((v) => v.calls).sort((a, b) => a - b),
      [6, 7, 8, 9, 10, 11],
    );
    const other = await probe({ ...target, sessionRootDir: join(workspace, "live-other") });
    assert.notEqual(other.id, first.id);
    assert.equal(other.calls, 1);
    assert.equal(other.persisted, 1);
    await sdk.extensions.releaseSession(target);
    assert.equal((await lifecycle()).filter((v) => v.id === first.id && v.phase === "dispose").length, 1);
    const resumed = await probe();
    assert.notEqual(resumed.id, first.id);
    assert.equal(resumed.calls, 1);
    assert.equal(resumed.persisted, 12);
  } finally {
    await sdk.shutdown();
  }
  const records = await lifecycle();
  assert.deepEqual(
    records
      .filter((v) => v.phase === "dispose")
      .map((v) => v.id)
      .sort(),
    records
      .filter((v) => v.phase === "activate")
      .map((v) => v.id)
      .sort(),
  );
  await assert.rejects(() => probe(), /abort/i);
  console.log("PASS 同一实例跨桌面命令、Mock、真实 Pi 复用；并发串行、会话隔离、释放与退出清理");

  const slow = api.createScriptedMockRuntime("session-slow", [
    { type: "tool", name: "ext_isle_example__text_stats", input: { wait: true } },
  ]);
  const tool = api.createScriptedMockRuntime("session-tool", [
    { type: "tool", name: "ext_isle_example__text_stats", input: {} },
  ]);
  const engine = api.createAgentEngine({
    registry: api.createRuntimeAgentRegistry([mock, slow, tool], mock.id),
    getExtensionSources: () => sources,
  });
  let sequence = 0;
  const run = (extra = {}, context = {}) =>
    engine.runAgent(
      {
        ...command,
        ...target,
        runtimeId: mock.id,
        taskId: `session-${++sequence}`,
        agentRoleId: "main",
        ...extra,
      },
      { emit() {}, callbacks: {}, ...context },
    );
  const inspect = async (extra, context) => JSON.parse((await run(extra, context)).text);
  try {
    const first = await inspect();
    const second = await inspect();
    assert.equal(second.id, first.id);
    assert.equal(second.calls, 2);
    await assert.rejects(() => run({ runtimeId: tool.id, resources: { tools: { allowed: [] } } }), /未启用/);
    const toolProbe = await inspect({ runtimeId: tool.id });
    assert.equal(toolProbe.id, second.id);
    assert.equal(toolProbe.calls, 3, "同一实例仍执行每次操作的工具筛选");
    sources = [{ ...sources[0], config: { revision: 2 } }];
    const changed = await inspect();
    assert.notEqual(changed.id, first.id);
    assert.deepEqual(changed.config, { revision: 2 });
    assert.equal(changed.calls, 1);
    const restricted = await inspect({ permissions: { mode: "full" } });
    assert.notEqual(restricted.id, changed.id, "沙箱策略变更必须重建");
    await writeFile(entry, (await readFile(entry, "utf8")) + "\n// rebuilt entry\n");
    const rebuilt = await inspect({ permissions: { mode: "full" } });
    assert.notEqual(rebuilt.id, restricted.id);
    const enabledSources = sources;
    sources = [];
    await assert.rejects(() => run(), /未注册|未启用/);
    sources = enabledSources;
    const reenabled = await inspect({ permissions: { mode: "full" } });
    assert.notEqual(reenabled.id, rebuilt.id, "全部禁用也必须释放原实例");
    // Approval decisions and resource filters belong to each operation, not the cached instance.
    sources = [{ ...sources[0], commandRisks: undefined }];
    const approved = await inspect({}, { callbacks: { requestApproval: async () => true } });
    await assert.rejects(() => inspect({}, { callbacks: { requestApproval: async () => false } }), /未授权/);
    const afterDenied = await inspect({}, { callbacks: { requestApproval: async () => true } });
    assert.equal(afterDenied.id, approved.id);
    assert.equal(afterDenied.calls, approved.calls + 1);
    sources = [{ ...sources[0], commandRisks: { probe: "low" } }];

    const active = new AbortController();
    let ready;
    const started = new Promise((resolve) => {
      ready = resolve;
    });
    const running = run(
      { runtimeId: slow.id },
      {
        signal: active.signal,
        emit(event) {
          if (event.type === "tool_execution_update") ready();
        },
      },
    );
    const rejected = assert.rejects(running, /取消|abort/i);
    await started;
    const queued = new AbortController();
    const waiting = assert.rejects(() => run({}, { signal: queued.signal }), /abort/i);
    queued.abort();
    await waiting;
    const following = inspect();
    active.abort();
    await rejected;
    const recovered = await following;
    assert.equal(recovered.calls, 1, "取消后恢复实例，不能重放已取消调用");
    assert.equal(recovered.runs, 1, "排队取消的运行不能投递 run_started");
    const history = await lifecycle();
    const cancelledIndex = history.findIndex((item) => item.phase === "run_finished" && item.status === "cancelled");
    const followingIndex = history.findIndex((item) => item.phase === "run_started" && item.id === recovered.id);
    assert.ok(cancelledIndex >= 0 && followingIndex > cancelledIndex, "取消终态必须先于下一轮 run_started 投递");

    // Shutdown interrupts a borrowed worker and rejects queued operations without waiting 30s.
    let readyShutdown;
    const shuttingDown = new Promise((resolve) => {
      readyShutdown = resolve;
    });
    const long = assert.rejects(
      () =>
        run(
          { runtimeId: slow.id },
          {
            emit(event) {
              if (event.type === "tool_execution_update") readyShutdown();
            },
          },
        ),
      /取消|释放|关闭|abort/i,
    );
    await shuttingDown;
    const pending = assert.rejects(() => run(), /abort/i);
    await engine.dispose();
    await Promise.all([long, pending]);
  } finally {
    await engine.dispose();
  }
  console.log("PASS 配置/权限/入口变更重建，逐次审批，排队取消，worker 失效恢复及执行中退出");
}
