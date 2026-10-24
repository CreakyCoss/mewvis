import test, { after } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import {
  mkdtemp,
  mkdir,
  realpath,
  readFile,
  writeFile,
  symlink,
  readdir,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";
import entries from "../build-entries.json" with { type: "json" };

const temporary = await realpath(
  await mkdtemp(join(tmpdir(), "mewvis-media-tool-")),
);
after(() => rm(temporary, { recursive: true, force: true }));
const runtime = fileURLToPath(new URL("../", import.meta.url));
const runtimeDirectory = join(temporary, "runtime");
await mkdir(runtimeDirectory);
const bundle = join(runtimeDirectory, "tools.mjs");
const common = {
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  banner: {
    js: "import {createRequire as __mediaCreateRequire} from 'node:module'; const require = __mediaCreateRequire(import.meta.url);",
  },
};
await build({
  ...common,
  stdin: {
    contents: [
      "engines/drivers/native/agent/tools/media/index.ts",
      "engines/drivers/native/agent/tools/media/generate.ts",
      "engines/drivers/native/agent/runtimes/pi/tools/media-tool.ts",
      "engines/drivers/native/agent/runtimes/pi/tools/safety.ts",
      "security/access/index.ts",
      "security/execution/index.ts",
    ]
      .map(
        (path) =>
          `export * from ${JSON.stringify(join(runtime, "src", path))};`,
      )
      .concat(
        `export { minimaxPreset } from ${JSON.stringify(join(runtime, "../client/src/workbench/pages/settings/llm/edit/presets/providers/minimax.ts"))};`,
      )
      .join("\n"),
    loader: "ts",
    resolveDir: runtime,
  },
  outfile: bundle,
});
for (const entry of [entries.executionHost, entries.mediaToolWorker])
  await build({
    ...common,
    entryPoints: [join(runtime, entry.source)],
    outfile: join(runtimeDirectory, entry.output),
  });
const api = await import(pathToFileURL(bundle));
const configuration = JSON.parse(
  await readFile(
    new URL(
      "../../server/test/support/fixtures/model-configuration.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  Buffer.alloc(96 * 1024, 42),
]);
const image = () =>
  Response.json({
    base_resp: { status_code: 0 },
    data: { image_base64: [png.toString("base64")] },
  });

async function fixture(t, fetch = async () => image()) {
  const workspace = await realpath(
    await mkdtemp(join(temporary, "workspace-")),
  );
  const model = {
    modelId: "upstream-image",
    provider: "Test",
    configuration: structuredClone(configuration),
  };
  const context = {
    workspacePath: workspace,
    runtimeModel: model,
    execution: { workspacePath: workspace, environment: [], sandbox: null },
    protectedPaths: [],
    run: (request, execution) =>
      api.runMediaGeneration(request, { ...execution, fetch }),
  };
  let tool;
  let next = 0;
  const call = (args, id = String(++next), signal) =>
    (tool ??= api.createMediaTool(context)).execute(id, args, { signal });
  const generate = (args = {}, id, signal) =>
    call(
      {
        action: "generate",
        purpose: "image-generation",
        input: { prompt: "cat" },
        ...args,
      },
      id,
      signal,
    );
  t.after(() => rm(workspace, { recursive: true, force: true }));
  return {
    workspace,
    model,
    context,
    call,
    generate,
    reset: () => {
      tool = undefined;
    },
  };
}

test("generic definition lists only the selected model's executable purposes and hides credentials and templates", async (t) => {
  const f = await fixture(t, async () => {
    throw new Error("no network for list");
  });
  const list = await f.call({ action: "list" });
  assert.equal(list.modelId, f.model.modelId);
  assert.deepEqual(list.purposes[0].inputSchema.required, ["prompt"]);
  assert.deepEqual(
    list.purposes[0].parameters.map((p) => p.name),
    ["aspect_ratio", "n", "prompt_optimizer"],
  );
  assert.doesNotMatch(
    JSON.stringify(list),
    /model-fixture-key|Authorization|apiEndpoint|request/,
  );
  f.model.configuration = null;
  f.reset();
  assert.equal(api.createMediaTool(f.context), undefined);
});

test("generic workflow composes requests, saves large outputs and deduplicates calls", async (t) => {
  const requests = [];
  const f = await fixture(t, async (url, init) => {
    requests.push({ url: String(url), init });
    return image();
  });
  const [a, b] = await Promise.all([
    f.generate({ parameters: { n: 1 } }, "same"),
    f.generate({ parameters: { n: 1 } }, "same"),
  ]);
  assert.equal(a.status, "completed", JSON.stringify(a));
  assert.deepEqual(a, b);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://api.example.com/v1/image_generation");
  assert.equal(
    new Headers(requests[0].init.headers).get("authorization"),
    "Bearer model-fixture-key",
  );
  assert.equal(JSON.parse(requests[0].init.body).n, 1);
  assert.deepEqual(await readFile(a.outputs[0].filePath), png);
  assert.doesNotMatch(JSON.stringify(a), /model-fixture-key|base64|iVBOR/);
});

test("missing user-choice parameters ask before any worker or paid request and preserve typed choices on retry", async (t) => {
  let requests = 0;
  const f = await fixture(t, async (_url, init) => {
    requests++;
    const body = JSON.parse(init.body);
    assert.equal(body.aspect_ratio, "1:1");
    assert.equal(body.n, 2);
    assert.equal(body.prompt_optimizer, false);
    return image();
  });
  const purpose = f.model.configuration.purposes[0];
  for (const parameter of purpose.parameters) {
    if (["aspect_ratio", "n", "prompt_optimizer"].includes(parameter.name))
      parameter.askWhenMissing = true;
    if (parameter.name === "n") {
      parameter.default = 1;
      parameter.schema = { ...parameter.schema, enum: [1, 2, 4] };
    }
    if (parameter.name === "prompt_optimizer")
      parameter.schema = { enum: [true, false] };
  }
  let workers = 0;
  const run = f.context.run;
  f.context.run = (...args) => {
    workers++;
    return run(...args);
  };
  const list = await f.call({ action: "list" });
  assert.equal(list.purposes[0].parameters[0].askWhenMissing, true);
  const needed = await f.generate(
    { parameters: { aspect_ratio: "1:1", prompt_optimizer: false } },
    "choice",
  );
  assert.equal(needed.status, "needs_input");
  assert.equal(needed.nextAction, "ask_user");
  assert.deepEqual(
    needed.questions.map((question) => question.parameter),
    ["n"],
  );
  assert.equal(needed.questions[0].input.type, "select");
  assert.deepEqual(
    needed.questions[0].input.options.map((option) => JSON.parse(option.value)),
    [1, 2, 4],
  );
  assert.equal(needed.questions[0].input.selected, "1");
  assert.equal(workers, 0);
  assert.equal(requests, 0);
  const pending = await f.generate({}, "unanswered");
  assert.equal(pending.status, "needs_input");
  assert.equal(workers, 0);
  const selected = JSON.parse(needed.questions[0].input.options[1].value);
  const done = await f.generate(
    {
      parameters: { aspect_ratio: "1:1", n: selected, prompt_optimizer: false },
    },
    "choice",
  );
  assert.equal(done.status, "completed", JSON.stringify(done));
  assert.equal(workers, 1);
  assert.equal(requests, 1);
  assert.deepEqual(
    await f.generate(
      { parameters: { aspect_ratio: "1:1", n: 2, prompt_optimizer: false } },
      "choice",
    ),
    done,
  );
  assert.equal(requests, 1);
});

test("choice questions fall back to text without multiple options and direct execution cannot use a missing default", async (t) => {
  let requests = 0;
  const f = await fixture(t, async () => {
    requests++;
    return image();
  });
  const purpose = f.model.configuration.purposes[0];
  const parameter = purpose.parameters.find(
    (parameter) => parameter.name === "n",
  );
  parameter.askWhenMissing = true;
  const question = await f.generate();
  assert.equal(question.questions[0].input.type, "text");
  assert.equal(question.questions[0].input.options, undefined);
  const direct = await api.runMediaGeneration(
    {
      model: f.model,
      purpose,
      arguments: { action: "generate", input: { prompt: "cat" } },
      execution: f.context.execution,
      protectedPaths: [],
    },
    {
      fetch: async () => {
        requests++;
        return image();
      },
    },
  );
  assert.equal(direct.status, "failed");
  assert.match(direct.error, /询问用户/);
  assert.equal(requests, 0);
});

test("speech presets list, submit and save playable audio paths through the existing media workflow", async (t) => {
  const audio = Buffer.from("ID3-synthesized-audio");
  const requests = [];
  const f = await fixture(t, async (url, init) => {
    requests.push({ url: String(url), init });
    if (init.method === "POST")
      return Response.json({
        base_resp: { status_code: 0 },
        data: { audio: "https://cdn.example/speech.mp3" },
      });
    assert.equal(new Headers(init.headers).get("authorization"), null);
    return new Response(audio, { headers: { "content-type": "audio/mpeg" } });
  });
  const preset = api.minimaxPreset.models.find(
    (model) => model.modelId === "speech-2.8-hd",
  );
  const purpose = structuredClone(preset.templates[0].purpose);
  purpose.modelId = preset.modelId;
  purpose.connection = {
    apiEndpoint: "https://tts.example",
    apiKey: "speech-secret",
  };
  f.model.configuration.purposes = [purpose];
  const list = await f.call({ action: "list", purpose: "speech" });
  assert.deepEqual(
    list.purposes.map((entry) => entry.purpose),
    ["speech"],
  );
  assert.deepEqual(list.purposes[0].inputSchema.required, ["text"]);
  assert.doesNotMatch(JSON.stringify(list), /speech-secret|tts\.example/);
  const args = {
    purpose: "speech",
    input: { text: "Hello" },
    parameters: { speed: 1.2 },
  };
  const result = await f.generate(args, "speech");
  assert.equal(result.status, "completed", JSON.stringify(result));
  assert.equal(result.modelId, "speech-2.8-hd");
  assert.equal(result.purpose, "speech");
  assert.equal(requests[0].url, "https://tts.example/v1/t2a_v2");
  assert.equal(
    new Headers(requests[0].init.headers).get("authorization"),
    "Bearer speech-secret",
  );
  const body = JSON.parse(requests[0].init.body);
  assert.equal(body.model, "speech-2.8-hd");
  assert.equal(body.text, "Hello");
  assert.equal(body.stream, false);
  assert.equal(body.output_format, "url");
  assert.equal(body.voice_setting.speed, 1.2);
  assert.equal(body.audio_setting.format, "mp3");
  assert.equal(result.outputs[0].type, "audio");
  assert.equal(result.outputs[0].mimeType, "audio/mpeg");
  assert.match(result.outputs[0].filePath, /\.mp3$/);
  assert.deepEqual(await readFile(result.outputs[0].filePath), audio);
  assert.doesNotMatch(
    JSON.stringify(result),
    /speech-secret|cdn\.example|ID3-synthesized/,
  );
  assert.deepEqual(await f.generate(args, "speech"), result);
  assert.equal(requests.length, 2);
});

test("base64 speech infers WAV MIME and rejects mismatched media without leaving files", async (t) => {
  const audio = Buffer.from("RIFF0000WAVE-audio-data");
  const f = await fixture(t, async () =>
    Response.json({
      base_resp: { status_code: 0 },
      data: { audio: audio.toString("base64") },
    }),
  );
  const purpose = structuredClone(
    api.minimaxPreset.models.find(
      (model) => model.modelId === "speech-2.8-turbo",
    ).templates[0].purpose,
  );
  purpose.connection = { apiEndpoint: "https://tts.example" };
  purpose.response.outputs = [
    { type: "audio", source: "base64", path: "/data/audio" },
  ];
  f.model.configuration.purposes = [purpose];
  const args = { purpose: "speech", input: { text: "Hello" } };
  const result = await f.generate(args);
  assert.equal(result.status, "completed", JSON.stringify(result));
  assert.equal(result.outputs[0].mimeType, "audio/wav");
  assert.match(result.outputs[0].filePath, /\.wav$/);
  assert.deepEqual(await readFile(result.outputs[0].filePath), audio);
  purpose.response.outputs[0].mimeType = "video/mp4";
  f.reset();
  const failed = await f.generate(args);
  assert.equal(failed.status, "failed");
  assert.match(failed.error, /媒体类型/);
  assert.deepEqual(failed.outputs, []);
  assert.equal((await readdir(join(f.workspace, "generated-media"))).length, 1);
});

test("media tools are absent unless the selected model has executable media purposes and tool calling", async (t) => {
  const f = await fixture(t);
  const configured = structuredClone(f.model.configuration);
  for (const configuration of [
    undefined,
    null,
    {},
    { ...configured, purposes: [] },
  ]) {
    f.model.configuration = configuration;
    assert.equal(api.createMediaTool(f.context), undefined);
    assert.equal(api.createPiMediaTool(f.context), undefined);
  }
  f.model.configuration = configured;
  f.model.capabilities = { toolCalling: false };
  assert.equal(api.createPiMediaTool(f.context), undefined);
  f.model.capabilities.toolCalling = true;
  assert.ok(api.createPiMediaTool(f.context));
  f.model.configuration.purposes.unshift({
    type: "chat",
    adapter: "native",
    input: ["text"],
    output: ["text"],
    toolCalling: false,
    parameters: [],
  });
  assert.equal(api.createPiMediaTool(f.context), undefined);
});

test("only selected configuration supplies media execution and inherited connection defaults", async (t) => {
  let submitted;
  const f = await fixture(t, async (url, init) => {
    submitted = {
      url: String(url),
      headers: new Headers(init.headers),
      body: JSON.parse(init.body),
    };
    return image();
  });
  delete f.model.configuration.purposes[0].connection;
  f.model.apiKey = "inherited-key";
  f.model.apiEndpoint = "https://inherited.example";
  f.model.configuration.purposes[0].modelId = "image-01";
  await assert.rejects(
    f.generate({ modelConfigId: "another-model" }),
    /modelConfigId/,
  );
  await assert.rejects(f.generate({ purpose: "video-generation" }), /当前模型/);
  assert.equal(submitted, undefined);
  const result = await f.generate();
  assert.equal(result.status, "completed", JSON.stringify(result));
  assert.equal(result.modelId, "image-01");
  assert.equal(submitted.url, "https://inherited.example/v1/image_generation");
  assert.equal(submitted.headers.get("authorization"), "Bearer inherited-key");
  assert.equal(submitted.body.model, "image-01");
});

test("model snapshots remain stable and keyless providers preserve usable file paths", async (t) => {
  const f = await fixture(t);
  await f.call({ action: "list" });
  f.model.configuration.purposes.length = 0;
  assert.equal((await f.generate()).status, "completed");
  f.model.configuration = structuredClone(configuration);
  delete f.model.configuration.purposes[0].connection.apiKey;
  f.reset();
  const result = await f.generate();
  assert.equal(result.status, "completed");
  assert.deepEqual(await readFile(result.outputs[0].filePath), png);
});

test("image purpose overrides inherit omitted fields and resolved empty keys stay empty", async (t) => {
  let submitted;
  const f = await fixture(t, async (url, init) => {
    submitted = {
      url: String(url),
      key: new Headers(init.headers).get("authorization"),
      body: JSON.parse(init.body),
    };
    return image();
  });
  f.model.modelId = "chat-model";
  f.model.apiKey = "chat-secret";
  f.model.apiEndpoint = "https://chat.example";
  f.model.configuration.purposes[0].modelId = "image-01";
  const result = await f.generate();
  assert.equal(result.status, "completed");
  assert.equal(result.modelId, "image-01");
  assert.equal(submitted.body.model, "image-01");
  assert.equal(submitted.url, "https://api.example.com/v1/image_generation");
  assert.equal(submitted.key, "Bearer model-fixture-key");
  delete f.model.configuration.purposes[0].connection.apiKey;
  f.reset();
  assert.equal((await f.generate()).status, "completed");
  assert.equal(submitted.key, "Bearer chat-secret");
  f.model.configuration.purposes[0].connection.apiKey = "";
  f.reset();
  assert.equal((await f.generate()).status, "completed");
  assert.equal(submitted.key, "Bearer");
});

test("video polling and collection remain inside the generic tool without model or Server polling", async (t) => {
  let submissions = 0,
    queries = 0;
  const f = await fixture(t, async (url, init) => {
    if (init.method === "POST") {
      submissions++;
      return Response.json({ id: "job/1" });
    }
    if (String(url).includes("/tasks/")) {
      assert.match(String(url), /job%2F1/);
      return Response.json(
        ++queries < 2
          ? { state: "running" }
          : { state: "ready", video: "https://cdn.example/video.mp4" },
      );
    }
    assert.equal(new Headers(init.headers).get("authorization"), null);
    return new Response("video", { headers: { "content-type": "video/mp4" } });
  });
  const purpose = f.model.configuration.purposes[0];
  purpose.type = "video-generation";
  purpose.output = ["video"];
  purpose.response = {
    mode: "task",
    outputs: [{ type: "video", source: "url", path: "/video" }],
    task: {
      idPath: "/id",
      request: {
        method: "GET",
        path: "/tasks/{{task.id}}",
        headers: { Authorization: "Bearer {{auth.apiKey}}" },
      },
      statusPath: "/state",
      successValues: ["ready"],
      failureValues: ["failed"],
      intervalSeconds: 1,
    },
  };
  const result = await f.generate({ purpose: "video-generation" });
  assert.equal(result.status, "completed", JSON.stringify(result));
  assert.equal(result.taskId, "job/1");
  assert.equal(submissions, 1);
  assert.equal(queries, 2);
  assert.equal(await readFile(result.outputs[0].filePath, "utf8"), "video");
});

test("Hailuo 2.3 retrieves task file URLs and saves videos without resubmitting", async (t) => {
  const preset = api.minimaxPreset.models.find((model) => model.modelId === "MiniMax-Hailuo-2.3");
  const template = preset.templates[0];
  const inputs = [template.sampleInput, { ...template.sampleInput, image: "https://example.com/first.png" }];
  for (const input of inputs) await t.test(input.image ? "image to video" : "text to video", async (t) => {
    const calls = [];
    const ok = { base_resp: { status_code: 0 } };
    const f = await fixture(t, async (url, init) => {
      const path = new URL(url).pathname;
      calls.push({ url: String(url), init });
      if (path === "/video.mp4") {
        assert.equal(new Headers(init.headers).get("authorization"), null);
        return new Response("hailuo-video", { headers: { "content-type": "video/mp4" } });
      }
      assert.equal(new Headers(init.headers).get("authorization"), "Bearer hailuo-secret");
      if (path === "/v1/video_generation") {
        assert.equal(init.method, "POST");
        return Response.json({ ...ok, task_id: "job/1" });
      }
      if (path === "/v1/query/video_generation") {
        assert.equal(init.method, "GET");
        assert.equal(new URL(url).searchParams.get("task_id"), "job/1");
        return Response.json({ ...ok, status: "Success", file_id: "file/1" });
      }
      assert.equal(path, "/v1/files/retrieve");
      assert.equal(init.method, "GET");
      assert.equal(new URL(url).searchParams.get("file_id"), "file/1");
      return Response.json({ ...ok, file: { download_url: "https://cdn.example/video.mp4" } });
    });
    const purpose = structuredClone(template.purpose);
    purpose.modelId = preset.modelId;
    purpose.connection = { apiEndpoint: "https://video.example/anthropic", apiKey: "hailuo-secret" };
    purpose.response.task.intervalSeconds = 1;
    f.model.configuration.purposes = [purpose];
    const args = { purpose: "video-generation", input, parameters: { duration: 10, resolution: "768P" } };
    const result = await f.generate(args, "hailuo");
    assert.equal(result.status, "completed", JSON.stringify(result));
    assert.equal(result.taskId, "job/1");
    assert.equal(result.outputs[0].type, "video");
    assert.equal(result.outputs[0].mimeType, "video/mp4");
    assert.equal(await readFile(result.outputs[0].filePath, "utf8"), "hailuo-video");
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.model, "MiniMax-Hailuo-2.3");
    assert.equal(body.duration, 10);
    assert.equal(body.first_frame_image, input.image);
    assert.equal(Object.hasOwn(body, "first_frame_image"), Object.hasOwn(input, "image"));
    assert.equal(calls.length, 4);
    assert.deepEqual(await f.generate(args, "hailuo"), result);
    assert.equal(calls.filter((call) => call.init.method === "POST").length, 1);
    assert.doesNotMatch(JSON.stringify(result), /hailuo-secret|cdn\.example|file\/1/);
  });
  await t.test("retrieval business failures stop without another submission", async (t) => {
    let submissions = 0;
    const f = await fixture(t, async (url, init) => {
      if (init.method === "POST") {
        submissions++;
        return Response.json({ task_id: "job", base_resp: { status_code: 0 } });
      }
      if (new URL(url).pathname === "/v1/query/video_generation")
        return Response.json({ status: "Success", file_id: "file", base_resp: { status_code: 0 } });
      assert.equal(new URL(url).pathname, "/v1/files/retrieve");
      return Response.json({ base_resp: { status_code: 1004, status_msg: "File unavailable" } });
    });
    const purpose = structuredClone(preset.templates[0].purpose);
    purpose.connection = { apiEndpoint: "https://video.example" };
    purpose.response.task.intervalSeconds = 1;
    f.model.configuration.purposes = [purpose];
    const args = { purpose: "video-generation" };
    const result = await f.generate(args, "failed-hailuo");
    assert.equal(result.status, "failed");
    assert.match(result.error, /File unavailable/);
    assert.deepEqual(result.outputs, []);
    assert.deepEqual(await f.generate(args, "failed-hailuo"), result);
    assert.equal(submissions, 1);
  });
});

test("Hailuo local first-frame calls expose typed files and overrides and reject malformed bindings before execution", async (t) => {
  const requests = [];
  const f = await fixture(t, async (url, init) => {
    const path = new URL(url).pathname;
    requests.push({ path, init });
    const ok = { base_resp: { status_code: 0 } };
    if (path === "/v1/video_generation")
      return Response.json({ ...ok, task_id: "local-frame-task" });
    if (path === "/v1/query/video_generation")
      return Response.json({ ...ok, status: "Success", file_id: "local-frame-file" });
    if (path === "/v1/files/retrieve")
      return Response.json({ ...ok, file: { download_url: "https://cdn.example/video.mp4" } });
    assert.equal(path, "/video.mp4");
    return new Response("local-frame-video", { headers: { "content-type": "video/mp4" } });
  });
  const preset = api.minimaxPreset.models.find((model) => model.modelId === "MiniMax-Hailuo-2.3");
  const purpose = structuredClone(preset.templates[0].purpose);
  purpose.modelId = preset.modelId;
  purpose.connection = { apiEndpoint: "https://video.example" };
  purpose.response.task.intervalSeconds = 1;
  f.model.configuration.purposes = [purpose];
  const reference = join(f.workspace, "first.png");
  await writeFile(reference, png);
  const tool = api.createPiMediaTool(f.context);
  const schema = tool.parameters.properties;
  assert.equal(schema.files.type, "array");
  assert.equal(schema.files.items.type, "object");
  assert.deepEqual(schema.files.items.required, ["pointer", "filePath"]);
  assert.equal(schema.parameters.type, "object");
  assert.equal(schema.parameters.properties.duration.type, "integer");
  assert.equal(schema.parameters.properties.resolution.type, "string");
  assert.equal(schema.parameters.properties.prompt_optimizer.type, "boolean");
  const args = {
    action: "generate",
    purpose: "video-generation",
    input: { prompt: "Rain on a window" },
    files: [{ pointer: "/image", filePath: reference }],
    parameters: { duration: 6, resolution: "768P" },
  };
  for (const files of [{ item: args.files[0] }, null, Array(9).fill(args.files[0])])
    await assert.rejects(tool.execute("bad-files", { ...args, files }), /files/);
  const invalid = await tool.execute("string-duration", { ...args, parameters: { duration: "6" } });
  assert.equal(invalid.details.status, "failed");
  assert.equal(requests.length, 0);
  const result = await tool.execute("local-frame", args);
  assert.equal(result.details.status, "completed", JSON.stringify(result));
  const body = JSON.parse(requests[0].init.body);
  assert.equal(body.first_frame_image, `data:image/png;base64,${png.toString("base64")}`);
  assert.equal(body.duration, 6);
  assert.equal(requests.filter((request) => request.init.method === "POST").length, 1);
  assert.equal(await readFile(result.details.outputs[0].filePath, "utf8"), "local-frame-video");
});

test("schema errors, immutable parameters, protected paths and symlinks fail before submission", async (t) => {
  let requests = 0;
  const f = await fixture(t, async () => {
    requests++;
    return image();
  });
  for (const args of [
    { input: {} },
    { parameters: { response_format: "base64" } },
    { parameters: { unknown: 1 } },
    { outputDirectory: temporary },
    { outputDirectory: ".git" },
    { outputDirectory: "workspace.db" },
  ])
    assert.equal(
      (await f.generate(args)).status,
      "failed",
      JSON.stringify(args),
    );
  await symlink(temporary, join(f.workspace, "alias"));
  assert.equal(
    (await f.generate({ outputDirectory: "alias" })).status,
    "failed",
  );
  assert.equal(requests, 0);
});

test("existing Agent access and execution policy constrain network, reference reads and writes", async (t) => {
  let requests = 0;
  const f = await fixture(t, async () => {
    requests++;
    return image();
  });
  f.context.execution.access = api.resolveAgentAccess(
    {
      filesystem: { write: [{ base: "workspace", path: "outputs" }] },
      network: { hosts: ["other.example"] },
    },
    { workspacePath: f.workspace },
  );
  assert.match((await f.generate()).error, /写入权限/);
  assert.match(
    (await f.generate({ outputDirectory: "outputs" })).error,
    /网络访问权限/,
  );
  assert.equal(requests, 0);
  delete f.context.execution.access;
  f.context.execution.sandbox = {
    filesystem: { allowWrite: [f.workspace], denyWrite: [], denyRead: [] },
    network: { allow: ["api.example.com"], deny: ["api.example.com"] },
  };
  f.reset();
  assert.match((await f.generate()).error, /执行策略禁止/);
  assert.equal(requests, 0);
});

test("local references bind to configured input fields with JSON Pointer protections", async (t) => {
  let body;
  const f = await fixture(t, async (_url, init) => {
    body = JSON.parse(init.body);
    return image();
  });
  const path = join(f.workspace, "reference.png");
  await writeFile(path, png);
  const purpose = f.model.configuration.purposes[0];
  purpose.inputSchema.properties.reference = { type: "string" };
  purpose.request.body.reference = "{{input.reference}}";
  assert.equal(
    (await f.generate({ files: [{ pointer: "/reference", filePath: path }] }))
      .status,
    "completed",
  );
  assert.equal(
    body.reference,
    `data:image/png;base64,${png.toString("base64")}`,
  );
  assert.equal(
    (
      await f.generate({
        files: [
          { pointer: "/reference", filePath: join(temporary, "other.png") },
        ],
      })
    ).status,
    "failed",
  );
  assert.equal(
    (
      await f.generate({
        files: [{ pointer: "/__proto__/polluted", filePath: path }],
      })
    ).status,
    "failed",
  );
  assert.equal({}.polluted, undefined);
});

test("stopping a tool call aborts execution without resubmission and redacts upstream errors", async (t) => {
  let count = 0;
  const f = await fixture(t, async (_url, init) => {
    if (++count === 1)
      return Response.json({
        base_resp: { status_code: 1, status_msg: "bad key model-fixture-key" },
      });
    return new Promise((_resolve, reject) =>
      init.signal.addEventListener("abort", () => reject(init.signal.reason), {
        once: true,
      }),
    );
  });
  assert.equal((await f.generate()).error, "bad key [redacted]");
  const controller = new AbortController();
  const pending = f.generate({}, "cancel", controller.signal);
  const timer = setTimeout(() => controller.abort(), 25);
  const result = await pending;
  clearTimeout(timer);
  assert.equal(result.status, "stopped");
  assert.equal(result.resubmitAutomatically, false);
  assert.deepEqual(await f.generate({}, "cancel"), result);
  assert.equal(count, 2);
});

test("partial collection keeps completed files and removes incomplete writes", async (t) => {
  const f = await fixture(t, async (url, init) => {
    if (init.method === "POST")
      return Response.json({
        base_resp: { status_code: 0 },
        data: {
          image_urls: [
            "https://cdn.example/first",
            "https://cdn.example/second",
          ],
        },
      });
    if (String(url).endsWith("first"))
      return new Response(png, { headers: { "content-type": "image/png" } });
    let sent = false;
    return new Response(
      new ReadableStream({
        pull(controller) {
          if (!sent) {
            sent = true;
            controller.enqueue(png.subarray(0, 30));
          } else controller.error(new Error("interrupted"));
        },
      }),
      { headers: { "content-type": "image/png" } },
    );
  });
  const result = await f.generate();
  assert.equal(result.status, "failed");
  assert.equal(result.outputs.length, 1);
  assert.deepEqual(await readFile(result.outputs[0].filePath), png);
  assert.equal((await readdir(join(f.workspace, "generated-media"))).length, 1);
});

test("Pi is a thin adapter over the generic tool and its existing safety analysis", async (t) => {
  const f = await fixture(t);
  const tool = api.createPiMediaTool(f.context);
  assert.equal(tool.name, api.MEDIA_TOOL_DEFINITION.name);
  assert.deepEqual(tool.parameters.required, ["action"]);
  const list = await tool.execute("list", { action: "list" });
  assert.equal(JSON.parse(list.content[0].text).purposes.length, 1);
  const result = await tool.execute("pi-generate", {
    action: "generate",
    purpose: "image-generation",
    input: { prompt: "cat" },
  });
  assert.equal(result.details.status, "completed");
  assert.doesNotMatch(JSON.stringify(result), /model-fixture-key/);
  const analysis = api.analyzePiExecution({
    executionId: "call",
    entry: "generate_media",
    workspacePath: f.workspace,
    input: {
      action: "generate",
      outputDirectory: "outputs",
      files: [{ filePath: join(f.workspace, "ref.png") }],
    },
  });
  assert.deepEqual(
    analysis.operations.map((value) => [
      value.kind,
      value.action ?? value.risk,
    ]),
    [
      ["tool", "medium"],
      ["filesystem", "write"],
      ["filesystem", "read"],
    ],
  );
});

test(
  "sandboxed generation cannot inspect host databases but can save media and read authorized references",
  { skip: process.platform !== "darwin", timeout: 20_000 },
  async (t) => {
    const f = await fixture(t);
    const hostData = await realpath(
      await mkdtemp(join(tmpdir(), "mewvis-media-protected-")),
    );
    t.after(() => rm(hostData, { recursive: true, force: true }));
    const database = join(hostData, "config.db");
    await writeFile(database, "host configuration must stay private");
    const managed = join(f.workspace, "managed");
    await mkdir(managed);
    const alias = join(hostData, "managed-alias");
    await symlink(managed, alias);
    const deniedReference = join(f.workspace, "private-reference.png");
    await writeFile(deniedReference, png);
    f.context.protectedPaths = [database, database + "-wal", alias];
    f.context.execution = api.resolveExecutionPolicy(
      "auto",
      f.workspace,
      { ...api.EXECUTION_CONFIG, enabled: true },
      runtimeDirectory,
      {
        access: api.resolveAgentAccess(
          {
            filesystem: {
              read: [{ base: "workspace" }],
              write: [{ base: "workspace" }],
            },
            network: { hosts: ["api.example.com"] },
          },
          { workspacePath: f.workspace },
        ),
      },
    );
    f.context.execution.sandbox.filesystem.denyRead.push(deniedReference);
    const probeWorker = join(runtimeDirectory, "sandbox-media-probe.mjs");
    await writeFile(
      probeWorker,
      `import { lstat } from "node:fs/promises";
import { serveWorker, runMediaGeneration } from ${JSON.stringify(pathToFileURL(bundle).href)};
let submissions = 0;
serveWorker({
  async execute(method, request, context) {
    if (method === "submissions") return submissions;
    if (method === "probe") {
      try { await lstat(request); return { readable: true }; }
      catch (error) { return { code: error.code }; }
    }
    return runMediaGeneration(request, {
      ...context,
      fetch: async () => {
        submissions++;
        return Response.json({
          base_resp: { status_code: 0 },
          data: { image_base64: [${JSON.stringify(png.toString("base64"))}] },
        });
      },
    });
  },
});`,
    );
    let worker;
    t.after(() => worker?.dispose());
    f.context.run = async (request, context) => {
      worker ??= new api.ProgramExecutor({
        policy: request.execution,
        program: { executable: process.execPath, args: [probeWorker] },
      });
      const probe = await worker.call("probe", database);
      assert.match(probe.code ?? "", /^(EPERM|EACCES)$/);
      return worker.call("generate", request, context.signal, context.progress);
    };
    const result = await f.generate();
    assert.equal(result.status, "completed", JSON.stringify(result));
    assert.deepEqual(await readFile(result.outputs[0].filePath), png);

    const reference = join(f.workspace, "reference.png");
    await writeFile(reference, png);
    f.model.configuration.purposes[0].inputSchema.properties.reference = {
      type: "string",
    };
    f.model.configuration.purposes[0].request.body.reference =
      "{{input.reference}}";
    f.reset();
    const withReference = await f.generate({
      files: [{ pointer: "/reference", filePath: reference }],
    });
    assert.equal(
      withReference.status,
      "completed",
      JSON.stringify(withReference),
    );
    const denied = await f.generate({ outputDirectory: "managed/outputs" });
    assert.equal(denied.status, "failed");
    assert.match(denied.error, /不能修改宿主管理/);
    assert.equal(denied.stage, "preparing");
    const deniedRead = await f.generate({
      files: [{ pointer: "/reference", filePath: deniedReference }],
    });
    assert.equal(deniedRead.status, "failed");
    assert.equal(deniedRead.stage, "preparing");
    assert.equal(await worker.call("submissions"), 2);
  },
);

test(
  "default execution runs the same generic workflow in an independent execution worker",
  { timeout: 15_000 },
  async (t) => {
    const server = createServer(async (request, response) => {
      for await (const _chunk of request) {
      }
      assert.equal(request.headers.authorization, "Bearer model-fixture-key");
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          base_resp: { status_code: 0 },
          data: { image_base64: [png.toString("base64")] },
        }),
      );
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    t.after(
      () =>
        new Promise((resolve) => {
          server.closeAllConnections();
          server.close(resolve);
        }),
    );
    const f = await fixture(t);
    f.model.configuration.purposes[0].connection.apiEndpoint = `http://127.0.0.1:${server.address().port}`;
    const { run: _run, ...context } = f.context;
    const tool = api.createMediaTool(context);
    const result = await tool.execute("real-worker", {
      action: "generate",
      purpose: "image-generation",
      input: { prompt: "cat" },
    });
    assert.equal(result.status, "completed", JSON.stringify(result));
    assert.deepEqual(await readFile(result.outputs[0].filePath), png);
  },
);
