import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export async function verifyExtensionWorkflow({
  api,
  dist,
  taskPackage,
  workspace,
  source,
  mock,
  command,
  piCommand,
  context,
}) {
  const taskRegistration = {
    path: taskPackage.root,
    commandRisks: { add: "low", list: "low", select: "low", reset: "low" },
  };
  const [taskSource] = api.resolveExtensionPackages([taskRegistration]);
  const nativeCommandAgent = api.createScriptedMockRuntime("native-command", [
    { type: "command", name: "isle.tasks/add", input: { title: "Mock 原生插件命令" } },
  ]);
  const adaptations = [];
  const nativeCommandSdk = api.createAgentRuntime({
    runtimeAgents: [nativeCommandAgent], extensionPackages: [taskRegistration],
    callbacks: { onExtensionAdaptation: (report) => adaptations.push(report) },
  });
  const nativeTarget = { workspacePath: workspace, sessionRootDir: join(workspace, "native-command-session") };
  const nativeResult = await nativeCommandSdk.agent.run({
    ...command, ...nativeTarget, runtimeId: "native-command", taskId: "native-command", agentRoleId: "main",
  });
  assert.equal(nativeResult.success, true, nativeResult.message);
  assert.equal(adaptations.length, 1);
  assert.equal(adaptations[0].degraded, false);
  assert.equal(adaptations[0].mappings.find((entry) => entry.capability === "commands").mode, "direct");
  const nativeState = await nativeCommandSdk.extensions.executeCommand({ ...nativeTarget, commandId: "isle.tasks/list" });
  assert.equal(nativeState.items.length, 1);
  assert.equal(nativeState.items[0].title, "Mock 原生插件命令");
  await nativeCommandSdk.shutdown();
  const target = { workspacePath: workspace, sessionRootDir: join(workspace, "tasks-session") };
  const errors = [];
  const options = {
    runtimeAgents: [mock],
    extensions: [source],
    extensionPackages: [taskRegistration],
    callbacks: { onExtensionError: (error) => errors.push(error) },
  };
  const sdk = api.createAgentRuntime(options);
  const invoke = (runtime, name, args = {}, session = target) =>
    runtime.extensions.executeCommand({ ...session, commandId: `isle.tasks/${name}`, arguments: args });
  assert.deepEqual(
    (await sdk.extensions.listCommands(target)).map((item) => item.id).sort(),
    ["add", "list", "reset", "select"].map((name) => `isle.tasks/${name}`),
  );
  const task = await invoke(sdk, "add", { title: "验证插件工作流" });
  assert.equal(task.status, "pending");
  await invoke(sdk, "select", { id: task.id });
  // A new SDK instance and new worker reconstruct state without retaining plugin objects.
  await sdk.shutdown();
  const resumed = api.createAgentRuntime(options);
  assert.equal((await invoke(resumed, "list")).selectedId, task.id);
  const result = await resumed.agent.run({ ...command, ...target, agentRoleId: "main", taskId: "tasks-mock" });
  assert.equal(result.success, true);
  let listed = await invoke(resumed, "list");
  assert.equal(listed.items[0].status, "completed");
  assert.equal(listed.items[0].toolsCompleted, 1);
  assert.equal(listed.items[0].lastTool, "ext_isle_example__text_stats");
  assert.equal(listed.items[0].runId, "tasks-mock");
  console.log("PASS 任务命令 → 会话恢复 → Mock 事件 → 持久进度：", listed.items[0].status);

  const piTask = await invoke(resumed, "add", { title: "验证 Pi 事件" });
  await invoke(resumed, "select", { id: piTask.id });
  const pi = await resumed.agent.run({ ...piCommand, ...target, taskId: "tasks-pi", agentRoleId: "pi-role" });
  assert.equal(pi.success, true);
  listed = await invoke(resumed, "list");
  assert.equal(listed.items[1].status, "completed");
  assert.equal(listed.items[1].toolsCompleted, 1);
  assert.equal(errors.length, 0);
  console.log("PASS 同一任务插件消费真实 Pi SDK 事件，无需 Pi 专用接口");

  // Independent SDKs editing the same session must not overwrite snapshots.
  const second = api.createAgentRuntime(options);
  await Promise.all(
    Array.from({ length: 6 }, (_, index) => invoke(index % 2 ? resumed : second, "add", { title: `并发-${index}` })),
  );
  assert.equal((await invoke(resumed, "list")).items.length, 8);
  const isolated = { ...target, sessionRootDir: join(workspace, "other-tasks-session") };
  assert.deepEqual((await invoke(resumed, "list", {}, isolated)).items, []);
  await assert.rejects(() => invoke(resumed, "add", { title: 123 }), /参数无效/);
  await assert.rejects(() => invoke(resumed, "select", { id: "missing" }), /待执行/);
  await assert.rejects(() => invoke(resumed, "unknown"), /未启用/);
  await assert.rejects(() => invoke(resumed, "list", {}, { ...target, sessionRootDir: "relative" }), /绝对路径/);

  // Rejected commands never mutate session state; use the SDK's normal approval events.
  let deniedSdk;
  const approvals = [];
  deniedSdk = api.createAgentRuntime({
    extensions: [{ ...taskSource, commandRisks: { list: "low" } }],
    callbacks: {
      onEvent(event) {
        if (event.type === "approval_requested")
          approvals.push(
            deniedSdk.handle({
              type: "answer_approval",
              taskId: event.taskId,
              approvalId: event.approvalId,
              approved: false,
            }),
          );
      },
    },
  });
  await assert.rejects(() => invoke(deniedSdk, "add", { title: "不应添加" }), /未授权/);
  await Promise.all(approvals);
  assert.equal(approvals.length, 1);
  assert.equal((await invoke(resumed, "list")).items.length, 8);
  console.log("PASS 并发状态更新、会话隔离、命令参数校验及审批拒绝");

  const crossTarget = { ...target, sessionRootDir: join(workspace, "cross-process-session") };
  const childPath = join(workspace, "command-child.mjs");
  await writeFile(
    childPath,
    `
    import {createAgentRuntime} from ${JSON.stringify(pathToFileURL(join(dist, "api.js")).href)};
    const sdk=createAgentRuntime({extensions:[${JSON.stringify(taskSource)}]});
    await sdk.extensions.executeCommand({...${JSON.stringify(crossTarget)},commandId:'isle.tasks/add',arguments:{title:'child'}});
    await sdk.shutdown();
  `,
  );
  await Promise.all([
    promisify(execFile)(process.execPath, [childPath]),
    promisify(execFile)(process.execPath, [childPath]),
    invoke(resumed, "add", { title: "parent" }, crossTarget),
  ]);
  assert.equal((await invoke(resumed, "list", {}, crossTarget)).items.length, 3);
  console.log("PASS 多个真实 Node 宿主同时写入，不覆盖彼此的任务");

  // A failed tool run produces a failed observation, not a completed task.
  const failedTask = await invoke(resumed, "add", { title: "失败任务" });
  await invoke(resumed, "select", { id: failedTask.id });
  const bad = api.createScriptedMockRuntime("failing-task", [{ type: "tool", name: "unknown_tool", input: {} }]);
  const failedSdk = api.createAgentRuntime({ ...options, runtimeAgents: [bad] });
  const failed = await failedSdk.agent.run({
    ...command,
    ...target,
    runtimeId: bad.id,
    taskId: "tasks-failed",
    agentRoleId: "failure",
  });
  assert.equal(failed.success, false);
  assert.equal((await invoke(resumed, "list")).items.find((item) => item.id === failedTask.id).status, "failed");

  // Cancelling inside a real worker destroys it; terminal observation resumes in a fresh worker.
  const fixtureDir = join(workspace, "fixtures");
  await mkdir(fixtureDir);
  const slowEntry = join(fixtureDir, "slow.mjs");
  await writeFile(
    slowEntry,
    `export default {id:'test.slow',protocolVersion:1,setup(ctx){
    ctx.registerTool({name:'wait',label:'Wait',description:'Wait',parameters:{type:'object'},async execute(input,{progress}){
      progress({content:[],details:{ready:true}});await new Promise(resolve=>setTimeout(resolve,30000));return {content:[],details:{}};
    }});
  }};`,
  );
  const cancelledTask = await invoke(resumed, "add", { title: "取消任务" });
  await invoke(resumed, "select", { id: cancelledTask.id });
  const slowMock = api.createScriptedMockRuntime("slow", [{ type: "tool", name: "ext_test_slow__wait", input: {} }]);
  const controller = new AbortController();
  let ready;
  const executing = new Promise((resolve) => {
    ready = resolve;
  });
  const slowEngine = api.createAgentEngine({
    registry: api.createRuntimeAgentRegistry([slowMock], "slow"),
    getExtensionSources: () => [taskSource, { id: "test.slow", entry: slowEntry, toolRisks: { wait: "low" } }],
  });
  const slowRun = slowEngine.runAgent(
    { ...command, ...target, runtimeId: "slow", taskId: "tasks-cancelled", agentRoleId: "slow", resources: undefined },
    {
      ...context,
      signal: controller.signal,
      callbacks: { ...context.callbacks, onExtensionError: (error) => errors.push(error) },
      emit(event) {
        if (event.type === "tool_execution_update") ready();
      },
    },
  );
  const cancelled = assert.rejects(slowRun, /取消|abort/i);
  await executing;
  try {
    const progress = await invoke(resumed, "list");
    assert.equal(progress.items.find((item) => item.id === cancelledTask.id).status, "running");
    assert.equal(progress.items.find((item) => item.id === cancelledTask.id).lastTool, "ext_test_slow__wait");
  } finally {
    controller.abort();
  }
  await cancelled;
  await slowEngine.dispose();
  assert.equal((await invoke(resumed, "list")).items.find((item) => item.id === cancelledTask.id).status, "cancelled");
  assert.equal(errors.length, 0);
  console.log("PASS 失败和取消的终态落盘；取消后不重放工具");

  // State edits followed by an exception roll back; observers fail independently.
  const brokenEntry = join(fixtureDir, "broken.mjs");
  await writeFile(
    brokenEntry,
    `export default {id:'test.broken',protocolVersion:1,setup(ctx){
    ctx.registerCommand({name:'fail',description:'Fail',parameters:{type:'object'},async execute(){ctx.session.set('leak',true);throw new Error('command exploded')}});
    ctx.registerCommand({name:'inspect',description:'Inspect',parameters:{type:'object'},async execute(){return ctx.session.get('leak')??null}});
    ctx.on('run_started',()=>{ctx.session.set('leak',true);throw new Error('observer exploded')});
  }};`,
  );
  const brokenSource = { id: "test.broken", entry: brokenEntry, commandRisks: { fail: "low", inspect: "low" } };
  const brokenSdk = api.createAgentRuntime({ ...options, extensions: [brokenSource, ...options.extensions] });
  await assert.rejects(
    () => brokenSdk.extensions.executeCommand({ ...target, commandId: "test.broken/fail" }),
    /command exploded/,
  );
  assert.equal(await brokenSdk.extensions.executeCommand({ ...target, commandId: "test.broken/inspect" }), null);
  const healthyTask = await invoke(resumed, "add", { title: "隔离出错观察器" });
  await invoke(resumed, "select", { id: healthyTask.id });
  const healthy = await brokenSdk.agent.run({
    ...command,
    ...target,
    taskId: "healthy-observer",
    agentRoleId: "healthy",
  });
  assert.equal(healthy.success, true);
  assert.equal((await invoke(resumed, "list")).items.find((item) => item.id === healthyTask.id).status, "completed");
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /observer exploded/);
  assert.equal(await brokenSdk.extensions.executeCommand({ ...target, commandId: "test.broken/inspect" }), null);
  const persisted = JSON.parse(await readFile(join(target.sessionRootDir, "extensions/isle.tasks.json"), "utf8"));
  assert.equal(persisted.version, 1);
  assert.equal(persisted.extensions["isle.tasks"].tasks.items.length, 11);
  console.log("PASS 命令/事件事务回滚、出错插件隔离、宿主诊断回调");

  // Register the built package once, then construct runtimes from host-owned settings.
  const settingsPath = join(workspace, "extension-settings.json");
  const manager = api.createExtensionPackageManager(settingsPath);
  await manager.add(taskPackage.root, { config: { maxTasks: 1 }, commandRisks: taskRegistration.commandRisks });
  const configured = api.createAgentRuntime({ extensionSettingsPath: settingsPath });
  const configTarget = { ...target, sessionRootDir: join(workspace, "configured-session") };
  await invoke(configured, "add", { title: "唯一任务" }, configTarget);
  await assert.rejects(() => invoke(configured, "add", { title: "超出配置" }, configTarget), /maxTasks/);
  await manager.configure("isle.tasks", { enabled: false });
  const disabled = api.createAgentRuntime({ extensionSettingsPath: settingsPath });
  assert.deepEqual(await disabled.extensions.listCommands(configTarget), []);
  await assert.rejects(() => invoke(disabled, "list", {}, configTarget), /未启用/);
  assert.equal((await invoke(configured, "list", {}, configTarget)).items.length, 1); // existing snapshot remains stable
  await manager.configure("isle.tasks", { enabled: true, config: { maxTasks: 2 } });
  const enabled = api.createAgentRuntime({ extensionSettingsPath: settingsPath });
  await invoke(enabled, "add", { title: "恢复后新任务" }, configTarget);
  assert.equal((await invoke(enabled, "list", {}, configTarget)).items.length, 2);
  assert.throws(
    () => api.createAgentRuntime({ extensions: [taskSource], extensionPackages: [taskRegistration] }),
    /重复插件/,
  );
  assert.throws(
    () => api.createAgentRuntime({ extensionPackages: [{ ...taskRegistration, config: { maxTasks: 0 } }] }),
    /配置无效/,
  );

  // A contribution omitted from the manifest cannot register itself at worker startup.
  const undeclared = api.createAgentRuntime({ extensions: [{ ...taskSource, capabilities: [] }] });
  await assert.rejects(() => undeclared.extensions.listCommands(configTarget), /未声明能力/);
  const limited = {
    ...mock,
    id: "limited",
    agent: { ...mock.agent, id: "limited", extensionAdapter: { ...mock.agent.extensionAdapter, capabilities: { commands: { mode: "direct" } } } },
  };
  const limitedSdk = api.createAgentRuntime({ runtimeAgents: [limited], extensionPackages: [taskRegistration] });
  const unsupported = await limitedSdk.agent.run({
    ...command,
    runtimeId: "limited",
    taskId: "unsupported-capability",
  });
  assert.equal(unsupported.success, false);
  assert.match(unsupported.message, /所需能力/);
  console.log("PASS 独立插件包加载、配置生效、持久启停、快照隔离及 Agent 能力协商");
  await Promise.all([configured, disabled, enabled, undeclared, limitedSdk].map((runtime) => runtime.shutdown()));
  await Promise.all([resumed, second, deniedSdk, failedSdk, brokenSdk].map((runtime) => runtime.shutdown()));
}
