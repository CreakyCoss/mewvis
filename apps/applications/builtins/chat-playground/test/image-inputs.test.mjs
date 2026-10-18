import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, rm, readFile, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const temporary = await mkdtemp(join(tmpdir(), "playground-image-inputs-"));
after(() => rm(temporary, { recursive: true, force: true }));
await build({
  entryPoints: ["image-inputs", "examples"].map((name) =>
    fileURLToPath(new URL(`../main/${name}.ts`, import.meta.url)),
  ),
  outdir: temporary,
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
});
const { importWorkspaceImage, imageInputDraft, MAX_IMAGE_BYTES } = await import(
  pathToFileURL(join(temporary, "image-inputs.mjs")).href
);
const { imageInputExamples, mediaExampleUnavailableReason } = await import(
  pathToFileURL(join(temporary, "examples.mjs")).href
);
const png = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
    "base64",
  ),
);
const snapshot = () => ({
  initialized: true,
  config: { selectedModelId: "model" },
  resources: {
    models: [
      {
        value: "model",
        capabilities: { input: ["text", "image"], toolCalling: true },
        mediaPurposes: [
          { type: "image-editing", input: ["text", "image"] },
          { type: "video-generation", input: ["text", "image"] },
        ],
      },
    ],
    tools: [{ value: "read" }, { value: "generate_media" }],
  },
});

test("image understanding uses conversation vision; editing and video use independent media inputs", () => {
  const state = snapshot();
  for (const example of imageInputExamples)
    assert.equal(mediaExampleUnavailableReason(state, example), "");
  state.resources.models[0].capabilities.input = ["text"];
  assert.match(
    mediaExampleUnavailableReason(state, imageInputExamples[0]),
    /对话模型不支持图片/,
  );
  assert.equal(mediaExampleUnavailableReason(state, imageInputExamples[1]), "");
  assert.equal(mediaExampleUnavailableReason(state, imageInputExamples[2]), "");
  state.resources.models[0].mediaPurposes[1].input = ["text"];
  assert.match(
    mediaExampleUnavailableReason(state, imageInputExamples[2]),
    /用途未声明图片/,
  );
});

test("each image flow checks its own tool grants and missing model metadata", () => {
  const state = snapshot();
  state.resources.tools = [{ value: "read" }];
  assert.equal(mediaExampleUnavailableReason(state, imageInputExamples[0]), "");
  assert.match(
    mediaExampleUnavailableReason(state, imageInputExamples[1]),
    /generate_media/,
  );
  state.resources.tools = [{ value: "generate_media" }];
  assert.match(
    mediaExampleUnavailableReason(state, imageInputExamples[0]),
    /read/,
  );
  assert.equal(mediaExampleUnavailableReason(state, imageInputExamples[1]), "");
  delete state.resources.models[0].capabilities;
  assert.match(
    mediaExampleUnavailableReason(state, imageInputExamples[0]),
    /未提供对话模型能力/,
  );
});

function writer(onChunk) {
  const calls = [],
    pending = new Map(),
    saved = new Map();
  return {
    calls,
    saved,
    async beginWrite(path) {
      calls.push("begin");
      const id = crypto.randomUUID();
      pending.set(id, { path, bytes: [] });
      return id;
    },
    async writeChunk(id, offset, bytes) {
      calls.push("chunk");
      const item = pending.get(id);
      assert.ok(bytes.length <= 64 * 1024);
      assert.equal(
        offset,
        item.bytes.reduce((size, value) => size + value.length, 0),
      );
      await onChunk?.();
      item.bytes.push(Uint8Array.from(bytes));
    },
    async commitWrite(id) {
      calls.push("commit");
      const { path, bytes } = pending.get(id);
      const content = Buffer.concat(bytes);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content);
      const result = {
        filePath: path,
        name: path.split("/").at(-1),
        type: "file",
        size: content.length,
        modifiedAt: Date.now(),
      };
      saved.set(path, result);
      pending.delete(id);
      return result;
    },
    async abortWrite(id) {
      calls.push("abort");
      pending.delete(id);
    },
  };
}

test("imports preserve bytes in unique copies inside the chat workspace and normalize unsafe names and extensions", async () => {
  const files = writer(),
    workspace = join(temporary, "chat workspace");
  const source = new File(
    [png, new Uint8Array(150 * 1024)],
    '../cat:"image.txt',
  );
  const original = join(temporary, "original.png");
  await writeFile(original, await source.bytes());
  const first = await importWorkspaceImage(
    files,
    `${workspace}/`,
    source,
    new AbortController().signal,
  );
  const second = await importWorkspaceImage(
    files,
    workspace,
    source,
    new AbortController().signal,
  );
  assert.match(relative(workspace, first.file.filePath), /^media-inputs\//);
  assert.notEqual(first.file.filePath, second.file.filePath);
  assert.match(first.file.name, /\.png$/);
  assert.doesNotMatch(first.file.name, /[/:"\\]/);
  assert.deepEqual(
    await readFile(first.file.filePath),
    await readFile(original),
  );
  assert.equal(files.calls.filter((call) => call === "abort").length, 0);
});

test("invalid signatures, empty files and oversize images never start a write", async () => {
  const files = writer();
  for (const file of [
    new File([], "empty.png"),
    new File(["not a png"], "fake.png"),
    new File([png, new Uint8Array(MAX_IMAGE_BYTES)], "large.png"),
  ]) {
    await assert.rejects(
      importWorkspaceImage(
        files,
        temporary,
        file,
        new AbortController().signal,
      ),
    );
  }
  assert.deepEqual(files.calls, []);
});

test("a failed or cancelled upload aborts staging and never commits partial image data", async () => {
  const source = new File([png, new Uint8Array(150 * 1024)], "image.png");
  const failed = writer(() => {
    throw new Error("disk full");
  });
  await assert.rejects(
    importWorkspaceImage(
      failed,
      temporary,
      source,
      new AbortController().signal,
    ),
    /disk full/,
  );
  assert.deepEqual(failed.calls, ["begin", "chunk", "abort"]);
  const controller = new AbortController();
  const cancelled = writer(() => controller.abort());
  await assert.rejects(
    importWorkspaceImage(cancelled, temporary, source, controller.signal),
    { name: "AbortError" },
  );
  assert.deepEqual(cancelled.calls, ["begin", "chunk", "abort"]);
  const beforeBegin = writer();
  await assert.rejects(
    importWorkspaceImage(beforeBegin, temporary, source, controller.signal),
    { name: "AbortError" },
  );
  assert.deepEqual(beforeBegin.calls, []);
});

test("drafts keep the exact local reference and use schema-bound image inputs without silently dropping the image", () => {
  const path = "/workspace/中文 space/media-inputs/cat.png";
  for (const example of imageInputExamples) {
    const draft = imageInputDraft(example, path);
    assert.deepEqual(draft.blocks[1], { type: "file-reference", path });
    assert.ok(draft.text.includes(JSON.stringify(path)));
    assert.ok(draft.text.endsWith(`@"${path}"`));
    assert.doesNotMatch(draft.text, /data:image\//);
    if (example.mediaPurpose) {
      assert.ok(draft.text.includes(`purpose 固定为 ${example.mediaPurpose}`));
      assert.match(draft.text, /files 数组/);
      assert.match(draft.text, /inputSchema/);
      assert.match(draft.text, /不丢弃图片/);
    } else {
      assert.match(draft.text, /read 工具读取/);
      assert.doesNotMatch(draft.text, /action=generate/);
    }
  }
});
