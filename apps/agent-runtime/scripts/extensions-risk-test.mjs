import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildExtensionPackage,
  createExtensionPackage,
} from "@mewvis/extension-dev";

export async function verifyExtensionRisks({
  api,
  hostApi,
  workspace,
  command,
}) {
  const project = join(workspace, "risk-project");
  await createExtensionPackage(project, "test.risks");
  await writeFile(
    join(project, "src/index.ts"),
    `import { defineExtension } from '@mewvis/extension-sdk/agent';
    export default defineExtension({id:'test.risks',apiVersion:1,setup(ctx){
      for (const name of ['low','medium','high','legacy']) {
        const declaration = name === 'legacy' ? {} : {risk:name};
        const parameters = {type:'object',properties:{risk:{type:'string'}},additionalProperties:false};
        ctx.registerTool({name,label:name,description:name,...declaration,
          ...(ctx.config.invalidKind === 'tool' && {risk:ctx.config.invalidRisk}),
          parameters,async execute(input){return {content:[{type:'text',text:name}],details:input}}});
        ctx.registerCommand({name,description:name,...declaration,
          ...(ctx.config.invalidKind === 'command' && {risk:ctx.config.invalidRisk}),
          parameters,async execute(){return name}});
      }
    }});`,
  );
  // Scaffold packages initially declare only commands.
  const metadata = JSON.parse(
    await readFile(join(project, "package.json"), "utf8"),
  );
  metadata["mewvis.extension"].modules.agent.capabilities = [
    "tools",
    "commands",
  ];
  await writeFile(join(project, "package.json"), JSON.stringify(metadata));
  const built = await buildExtensionPackage(project);
  const [source] = api.resolveExtensionPackages([{ path: built.root }]);
  const host = await hostApi.createExtensionHost([source], workspace);
  try {
    for (const kind of ["tools", "commands"]) {
      assert.deepEqual(
        host.catalog[kind].map((entry) => entry.risk),
        ["low", "medium", "high", undefined],
      );
    }
  } finally {
    await host.dispose();
  }

  const runtimes = ["tool", "command"].flatMap((kind) =>
    ["low", "medium", "high", "legacy"].map((risk) =>
      api.createScriptedMockRuntime(`${kind}-${risk}`, [
        {
          type: kind,
          name:
            kind === "tool" ? `ext_test_risks__${risk}` : `test.risks/${risk}`,
          // Invocation arguments must never lower a registered declaration.
          input: { risk: "low" },
        },
      ]),
    ),
  );
  let sources = [source];
  const engine = api.createAgentEngine({
    registry: api.createRuntimeAgentRegistry(runtimes, runtimes[0].id),
    getExtensionSources: () => sources,
  });
  let approvals = 0;
  let approvalResult = false;
  const context = {
    emit() {},
    callbacks: {
      requestApproval: async () => {
        approvals++;
        return approvalResult;
      },
    },
  };
  const run = async (kind, risk, mode, needsApproval, approve = false) => {
    approvals = 0;
    approvalResult = approve;
    const execution = engine.runAgent(
      {
        ...command,
        runtimeId: `${kind}-${risk}`,
        taskId: `risk-${kind}-${risk}-${mode}`,
        resources: undefined,
        permissions: { mode },
      },
      context,
    );
    if (needsApproval && !approve) await assert.rejects(execution, /未授权/);
    else {
      const result = await execution;
      assert.equal(result.text, kind === "tool" ? risk : JSON.stringify(risk));
    }
    assert.equal(approvals, needsApproval ? 1 : 0);
  };
  try {
    for (const kind of ["tool", "command"]) {
      for (const [mode, permitted] of [
        ["ask", ["low"]],
        ["auto", ["low", "medium"]],
        ["full", ["low", "medium", "high", "legacy"]],
      ]) {
        for (const risk of ["low", "medium", "high", "legacy"]) {
          await run(kind, risk, mode, !permitted.includes(risk));
        }
      }
      await run(kind, "high", "ask", true, true);
      // Overrides win in both directions; unrelated entries retain their declaration.
      const key = kind === "tool" ? "toolRisks" : "commandRisks";
      sources = [
        { ...source, [key]: { low: "high", high: "low", legacy: "low" } },
      ];
      await run(kind, "low", "ask", true);
      await run(kind, "high", "ask", false);
      await run(kind, "legacy", "ask", false);
      await run(kind, "medium", "ask", true);
      sources = [source];
    }
    // A valid host override cannot hide a malformed plugin declaration.
    for (const invalidKind of ["tool", "command"]) {
      for (const invalidRisk of ["critical", "", null, 1]) {
        sources = [
          {
            ...source,
            config: { invalidKind, invalidRisk },
            toolRisks: { low: "low" },
            commandRisks: { low: "low" },
          },
        ];
        await assert.rejects(
          engine.runAgent(
            { ...command, runtimeId: "tool-low", resources: undefined },
            context,
          ),
          /risk/,
        );
      }
    }
  } finally {
    await engine.dispose();
  }

  const sdk = api.createAgentRuntime({ extensions: [source] });
  const target = {
    workspacePath: workspace,
    sessionRootDir: join(workspace, "risk-command-session"),
    permissions: { mode: "ask" },
  };
  try {
    const commands = await sdk.extensions.listCommands(target);
    assert.equal(
      commands.find((entry) => entry.id === "test.risks/low").risk,
      "low",
    );
    assert.equal(
      await sdk.extensions.executeCommand({
        ...target,
        commandId: "test.risks/low",
      }),
      "low",
    );
  } finally {
    await sdk.shutdown();
  }
  console.log(
    "PASS SDK 插件风险声明 → 注册/worker/命令发现 → ask/auto/full 审批；宿主覆盖、旧插件兼容、无效声明和参数降级保护",
  );
}
