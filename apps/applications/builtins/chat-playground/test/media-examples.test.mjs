import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const temporary = await mkdtemp(join(tmpdir(), "playground-media-examples-"));
after(() => rm(temporary, { recursive: true, force: true }));
const entry = join(temporary, "examples.mjs");
await build({
  entryPoints: [fileURLToPath(new URL("../main/examples.ts", import.meta.url))],
  outfile: entry,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
});
const { mediaExamples, mediaExampleUnavailableReason } = await import(
  pathToFileURL(entry).href
);
const snapshot = () => ({
  initialized: true,
  config: { selectedModelId: "configured" },
  resources: {
    models: [
      {
        value: "configured",
        capabilities: { toolCalling: true },
        mediaPurposes: mediaExamples.map((example) => ({
          type: example.mediaPurpose,
          input: ["text"],
        })),
      },
    ],
    tools: [{ value: "generate_media" }],
  },
});

test("each media example follows the selected model's purpose and its declared input", () => {
  const state = snapshot();
  for (const example of mediaExamples)
    assert.equal(mediaExampleUnavailableReason(state, example), "");
  state.resources.models[0].mediaPurposes =
    state.resources.models[0].mediaPurposes.slice(1);
  assert.match(
    mediaExampleUnavailableReason(state, mediaExamples[0]),
    /模型设置/,
  );
  assert.equal(mediaExampleUnavailableReason(state, mediaExamples[1]), "");
  state.resources.models[0].mediaPurposes[0].input = ["image"];
  assert.match(
    mediaExampleUnavailableReason(state, mediaExamples[1]),
    /文字输入/,
  );
});

test("model switching, missing metadata and disabled tool calling never enable a media example", () => {
  const state = snapshot();
  state.config.selectedModelId = "other";
  assert.match(
    mediaExampleUnavailableReason(state, mediaExamples[0]),
    /选择模型/,
  );
  state.config.selectedModelId = "configured";
  delete state.resources.models[0].mediaPurposes;
  assert.match(
    mediaExampleUnavailableReason(state, mediaExamples[0]),
    /未提供媒体用途/,
  );
  state.resources.models[0].capabilities.toolCalling = false;
  assert.match(
    mediaExampleUnavailableReason(state, mediaExamples[0]),
    /未启用工具调用/,
  );
});

test("revoked or failed tool grants block examples even when the media purpose remains configured", () => {
  const state = snapshot();
  assert.equal(mediaExampleUnavailableReason(state, mediaExamples[0]), "");
  state.resources.tools = [];
  assert.match(
    mediaExampleUnavailableReason(state, mediaExamples[0]),
    /应用管理/,
  );
  state.resources.errors = { tools: "offline" };
  assert.match(
    mediaExampleUnavailableReason(state, mediaExamples[0]),
    /授权信息加载失败/,
  );
  state.resources.errors = { models: "offline" };
  assert.match(
    mediaExampleUnavailableReason(state, mediaExamples[0]),
    /模型信息加载失败/,
  );
});

test("initialization blocks media examples while ordinary prompts keep their existing behavior", () => {
  const state = snapshot();
  state.initialized = false;
  assert.match(
    mediaExampleUnavailableReason(state, mediaExamples[0]),
    /正在加载/,
  );
  assert.equal(
    mediaExampleUnavailableReason(state, {
      label: "Markdown",
      text: "演示 Markdown",
    }),
    "",
  );
});
