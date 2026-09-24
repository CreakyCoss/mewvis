import assert from "node:assert/strict";
import { writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";

export async function verifyExtensionServices({ api, workspace, hostApi }) {
  const providerEntry = join(workspace, "provider.mjs"),
    callerEntry = join(workspace, "consumer.mjs");
  await writeFile(
    providerEntry,
    `export default {id:'test.provider',protocolVersion:1,setup(ctx){
    ctx.provide('decisions.evaluate',async(input,{signal})=>{
      if(input.question==='cycle') return ctx.services.decisions.evaluate(input,{signal});
      if(input.question==='wait') { await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('cancelled')),{once:true})); }
      const calls=(ctx.session.get('calls')??0)+1;ctx.session.set('calls',calls);
      return {type:'boolean',value:true,status:'accepted',reason:ctx.config.tag+':'+calls};
    });
  }};`,
  );
  await writeFile(
    callerEntry,
    `export default {id:'test.consumer',protocolVersion:1,setup(ctx){
    ctx.registerCommand({name:'judge',description:'Judge',parameters:{type:'object',properties:{question:{type:'string'}},required:['question']},async execute(input,{signal}){
      ctx.session.set('caller',true);
      return ctx.services.decisions.evaluate({input:'material',question:input.question,output:{type:'boolean'}},{signal});
    }});
  }};`,
  );
  const provider = {
    id: "test.provider",
    entry: providerEntry,
    config: { tag: "provider-config" },
    capabilities: ["session.state"],
    host: {
      provides: ["decisions.evaluate"],
      optional: ["decisions.evaluate"],
    },
  };
  const caller = {
    id: "test.consumer",
    entry: callerEntry,
    capabilities: ["commands", "session.state"],
    host: { optional: ["decisions.evaluate"] },
    commandRisks: { judge: "low" },
  };
  const sdk = api.createAgentRuntime({ extensions: [caller, provider] });
  const target = {
    workspacePath: workspace,
    sessionRootDir: join(workspace, "services-session"),
    commandId: "test.consumer/judge",
  };
  try {
    const result = await sdk.extensions.executeCommand({
      ...target,
      arguments: { question: "normal" },
    });
    assert.equal(result.reason, "provider-config:1");
    const state = (id) =>
      readFile(
        join(target.sessionRootDir, "extensions", `${id}.json`),
        "utf8",
      ).then(JSON.parse);
    assert.deepEqual(Object.keys((await state("test.provider")).extensions), [
      "test.provider",
    ]);
    assert.deepEqual(Object.keys((await state("test.consumer")).extensions), [
      "test.consumer",
    ]);
    const timeout = AbortSignal.timeout(2000);
    await assert.rejects(
      sdk.extensions.executeCommand(
        { ...target, arguments: { question: "cycle" } },
        { signal: timeout },
      ),
      /循环|失败/,
    );
    const controller = new AbortController();
    const pending = sdk.extensions.executeCommand(
      { ...target, arguments: { question: "wait" } },
      { signal: controller.signal },
    );
    const timer = setTimeout(() => controller.abort(), 500);
    try {
      await assert.rejects(pending);
    } finally {
      clearTimeout(timer);
    }
  } finally {
    await sdk.shutdown();
  }
  const absent = api.createAgentRuntime({ extensions: [caller] });
  try {
    await assert.rejects(
      absent.extensions.executeCommand({
        ...target,
        arguments: { question: "normal" },
      }),
      /未实现/,
    );
  } finally {
    await absent.shutdown();
  }
  await assert.rejects(
    hostApi.createExtensionHost([{ ...provider, host: {} }], workspace),
    /未声明/,
  );
  const missing = join(workspace, "unregistered-service.mjs");
  await writeFile(
    missing,
    `export default {id:'test.empty',protocolVersion:1,setup(){}};`,
  );
  await assert.rejects(
    hostApi.createExtensionHost(
      [
        {
          id: "test.empty",
          entry: missing,
          host: { provides: ["decisions.evaluate"] },
        },
      ],
      workspace,
    ),
    /未注册/,
  );
  const other = join(workspace, "other-provider.mjs");
  await writeFile(
    other,
    (await readFile(providerEntry, "utf8")).replace(
      "test.provider",
      "test.other",
    ),
  );
  const duplicate = api.createAgentRuntime({
    extensions: [provider, { ...provider, id: "test.other", entry: other }],
  });
  try {
    await assert.rejects(
      duplicate.extensions.listCommands({ workspacePath: workspace, sessionRootDir: target.sessionRootDir }),
      /多个提供者/,
    );
  } finally {
    await duplicate.shutdown();
  }
  console.log(
    "PASS 标准服务：跨插件路由、提供者配置与状态隔离、递归拒绝、取消、缺失和重复提供者",
  );
}
