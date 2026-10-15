import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { AgentRuntimeHost } from "../../dist/modules/agent/host.js";
import { setup } from "../support/helpers.mjs";

const configuration = JSON.parse(
  await readFile(
    new URL("../support/fixtures/model-configuration.json", import.meta.url),
    "utf8",
  ),
);

test("Agent host forwards only the selected model configuration without loading other models", async (t) => {
  const f = await setup(t);
  let captured;
  f.supervisor.submit = (submission) => {
    captured = submission.command;
    return { taskId: submission.taskId };
  };
  const host = new AgentRuntimeHost(
    f.supervisor,
    undefined,
    undefined,
    async () => ["/private/config.db"],
  );
  const runtimeModel = {
    provider: "Test",
    apiFormat: "openai-completions",
    catalogModelId: "selected",
    modelId: "selected",
    apiKey: "provider-key",
    configuration,
  };
  const input = {
    taskId: "selected-model",
    userMessage: "image",
    workspacePath: f.root,
    runtimeModel,
  };
  await host.invoke("run_agent_runtime_agent", { input });
  assert.deepEqual(captured.params.runtimeModel, runtimeModel);
  assert.equal(captured.params.resources.media, undefined);
  assert.deepEqual(captured.params.resources.protectedPaths, [
    "/private/config.db",
  ]);
  await host.invoke("run_agent_runtime_agent", {
    input: {
      ...input,
      runtimeModel: { ...runtimeModel, configuration: undefined },
    },
  });
  assert.equal(captured.params.runtimeModel.configuration, undefined);
  assert.equal(captured.params.resources.media, undefined);
});

test("Agent host rejects client-injected model resources and protected paths", async (t) => {
  const f = await setup(t);
  const host = new AgentRuntimeHost(f.supervisor);
  const input = {
    taskId: "selected-model",
    userMessage: "image",
    workspacePath: f.root,
  };
  for (const resources of [{ media: { models: [] } }, { protectedPaths: [] }])
    await assert.rejects(
      host.invoke("run_agent_runtime_agent", {
        input: { ...input, resources },
      }),
      /未知字段/,
    );
});
