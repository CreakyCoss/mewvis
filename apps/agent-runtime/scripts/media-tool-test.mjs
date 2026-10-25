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
import { basename, join } from "node:path";
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
      "engines/drivers/native/agent/tools/media/files.ts",
      "engines/drivers/native/agent/runtimes/pi/tools/media-tool.ts",
      "engines/drivers/native/agent/runtimes/pi/tools/ask-user-tool.ts",
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
        'export { validateToolArguments } from "@earendil-works/pi-ai";',
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
  assert.equal(list.selectedModelId, f.model.modelId);
  assert.equal(list.modelId, undefined);
  assert.equal(list.status, "configuration");
  assert.equal(list.nextAction, undefined);
  assert.deepEqual(list.nextSteps.map((step) => step.tool), ["ask_user", "generate_media"]);
  assert.equal(list.purposes[0].modelId, f.model.modelId);
  assert.equal(list.purposes[0].callExample.action, "generate");
  assert.equal(list.purposes[0].callExample.purpose, "image-generation");
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
  assert.match(a.outputs[0].fileName, /^image-\d{8}T\d{6}Z-[a-f0-9]{8}\.png$/);
  assert.equal(a.outputs[0].fileName, basename(a.outputs[0].filePath));
  assert.doesNotMatch(JSON.stringify(a), /model-fixture-key|base64|iVBOR/);
});

test("descriptive names stay local and batch indices count only media files", async (t) => {
  const requests = [];
  const f = await fixture(t, async (_url, init) => {
    requests.push(JSON.parse(init.body));
    return Response.json({
      base_resp: { status_code: 0 },
      note: "Two variations",
      data: { image_base64: [png.toString("base64"), png.toString("base64")] },
    });
  });
  const purpose = f.model.configuration.purposes[0];
  purpose.output.push("text");
  purpose.response.outputs.unshift({ type: "text", source: "text", path: "/note" });
  const result = await f.generate({ outputName: "橘猫 宇航员.PNG", outputDirectory: "pictures", parameters: { n: 2 } });
  assert.equal(result.status, "completed", JSON.stringify(result));
  assert.equal(requests.length, 1);
  assert.equal(Object.hasOwn(requests[0], "outputName"), false);
  assert.doesNotMatch(JSON.stringify(requests), /橘猫/);
  assert.deepEqual(result.outputs[0], { type: "text", value: "Two variations" });
  const files = result.outputs.slice(1);
  for (let i = 0; i < files.length; i++) {
    assert.match(files[i].fileName, new RegExp(`^橘猫-宇航员-${i + 1}-[a-f0-9]{8}\\.png$`));
    assert.equal(files[i].filePath, join(f.workspace, "pictures", files[i].fileName));
    assert.deepEqual(await readFile(files[i].filePath), png);
  }
  assert.equal(files.length, 2);
});

test("output names are portable, bounded and cannot change the directory or media extension", async (t) => {
  const f = await fixture(t);
  for (const [outputName, pattern] of [
    ["../../封面\\图:<一>\"|?*\u0000.mp4", /^封面-图-一-[a-f0-9]{8}\.png$/],
    ["CON.png", /^media-CON-[a-f0-9]{8}\.png$/],
    ["nul.backup", /^media-nul\.backup-[a-f0-9]{8}\.png$/],
    ["e\u0301.png", /^é-[a-f0-9]{8}\.png$/],
    ["  ... / \\ : * ?  ", /^image-\d{8}T\d{6}Z-[a-f0-9]{8}\.png$/],
    ["", /^image-\d{8}T\d{6}Z-[a-f0-9]{8}\.png$/],
    ["猫".repeat(100), new RegExp(`^${"猫".repeat(40)}-[a-f0-9]{8}\\.png$`)],
  ]) {
    const result = await f.generate({ outputName });
    assert.equal(result.status, "completed", JSON.stringify(result));
    const output = result.outputs[0];
    assert.match(output.fileName, pattern);
    assert.equal(output.filePath, join(f.workspace, "generated-media", output.fileName));
    assert.ok(Buffer.byteLength(output.fileName) < 160);
    assert.deepEqual(await readFile(output.filePath), png);
  }
  for (const outputName of [42, "a".repeat(257)])
    await assert.rejects(f.generate({ outputName }), /参数格式错误/);
});

test("filename collisions retry only local commit and never overwrite existing files", async (t) => {
  const f = await fixture(t);
  const directory = join(f.workspace, "generated-media");
  await mkdir(directory);
  let occupied;
  const result = await api.collectMedia(
    { type: "image", source: "base64", value: png.toString("base64") },
    {
      directory,
      outputName: "封面",
      transport: { signal: new AbortController().signal, authorizeUrl: async () => { throw new Error("no network"); } },
      authorize: async (path) => {
        if (!occupied && path.endsWith(".png")) {
          occupied = path;
          await writeFile(path, "existing file");
        }
        return path;
      },
    },
  );
  assert.notEqual(result.filePath, occupied);
  assert.equal(result.fileName, basename(result.filePath));
  assert.equal(await readFile(occupied, "utf8"), "existing file");
  assert.deepEqual(await readFile(result.filePath), png);
  assert.equal((await readdir(directory)).length, 2);
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
      parameter.schema = { ...parameter.schema, enum: [1, 2, 4], description: "生成数量" };
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
  assert.equal(needed.questions[0].context, "生成数量");
  assert.deepEqual(
    needed.questions[0],
    list.purposes[0].questionTemplates.find((question) => question.parameter === "n"),
  );
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

test("speech can clarify from the catalog before generation and use an already explicit voice without asking again", async (t) => {
  const requests = [];
  const f = await fixture(t, async (_url, init) => {
    requests.push(init);
    return init.method === "POST"
      ? Response.json({
          base_resp: { status_code: 0 },
          data: { audio: "https://cdn.example/clarified.mp3" },
        })
      : new Response(Buffer.from("ID3-confirmed-voice"), {
          headers: { "content-type": "audio/mpeg" },
        });
  });
  const preset = api.minimaxPreset.models.find(
    (model) => model.modelId === "speech-2.8-hd",
  );
  const purpose = structuredClone(preset.templates[0].purpose);
  purpose.modelId = preset.modelId;
  purpose.connection = { apiEndpoint: "https://tts.example", apiKey: "speech-secret" };
  const voice = purpose.parameters.find((parameter) => parameter.name === "voice_id");
  voice.default = "female-shaonv";
  voice.askWhenMissing = true;
  voice.description = "用户音色参数说明";
  voice.schema.description = "仅允许配置的音色 ID";
  voice.schema.options.find((option) => option.value === "male-qn-qingse").description = "用户配置的音色说明";
  f.model.configuration.purposes = [purpose];
  let workers = 0;
  const run = f.context.run;
  f.context.run = (...args) => {
    workers++;
    return run(...args);
  };
  let askTool;
  let questions = 0;
  api.registerPiAskUserTool(
    { registerTool: (tool) => { askTool = tool; } },
    "speech-clarification",
    async (question) => {
      questions++;
      assert.equal(question.input.type, "select");
      const male = question.input.options.find((option) => JSON.parse(option.value) === "male-qn-qingse");
      assert.match(male.label, /男声.*青涩青年/);
      assert.equal(male.description, "用户配置的音色说明");
      assert.match(question.context, /音色/);
      assert.match(question.context, /用户音色参数说明/);
      assert.match(question.context, /仅允许配置的音色 ID/);
      assert.equal(workers, 0);
      assert.equal(requests.length, 0);
      return male.value;
    },
  );
  const pi = api.createPiMediaTool(f.context);
  const list = (await pi.execute("catalog", { action: "list", purpose: "speech" })).details;
  assert.equal(list.status, "configuration");
  assert.equal(list.questions, undefined);
  assert.equal(list.nextAction, undefined);
  assert.equal(questions, 0);
  assert.equal(workers, 0);
  assert.equal(requests.length, 0);
  const entry = list.purposes[0];
  assert.equal(entry.parameters.find((parameter) => parameter.name === "voice_id").description, "用户音色参数说明");
  assert.match(pi.parameters.properties.parameters.properties.voice_id.description, /用户音色参数说明/);
  assert.match(list.parameterFields.description, /用途/);
  await assert.rejects(pi.execute("invalid-voice", {
    action: "generate", purpose: "speech", input: { text: "Hello" }, parameters: { voice_id: "not-in-options" },
  }), /enum/);
  assert.equal(workers, 0);
  assert.equal(requests.length, 0);
  assert.deepEqual(entry.requiredUserParameters, ["voice_id"]);
  assert.equal(Object.hasOwn(entry.callExample.parameters, "voice_id"), false);
  assert.equal(entry.parameters.find((parameter) => parameter.name === "voice_id").default, "female-shaonv");
  // Optional parameters also have templates, for an unclear user preference rather than a missing default.
  assert.deepEqual(entry.questionTemplates.map((question) => question.parameter), ["voice_id", "speed", "vol", "pitch", "emotion"]);
  assert.match(list.parameterFields["schema.options"], /value/);
  assert.match(list.parameterFields.askWhenMissing, /明确/);
  const template = entry.questionTemplates.find((question) => question.parameter === "voice_id");
  const askArguments = api.validateToolArguments(askTool, {
    type: "toolCall",
    id: "ask-voice",
    name: "ask_user",
    arguments: { question: template.question, context: template.context, input: template.input },
  });
  const answer = (await askTool.execute("ask-voice", askArguments)).details.answer;
  const confirmed = api.validateToolArguments(pi, {
    type: "toolCall",
    id: "confirmed",
    name: pi.name,
    arguments: {
      ...entry.callExample,
      input: { text: "Hello" },
      parameters: { ...entry.callExample.parameters, voice_id: JSON.parse(answer), speed: 1.2 },
    },
  });
  const result = (await pi.execute("confirmed", confirmed)).details;
  assert.equal(result.status, "completed", JSON.stringify(result));
  assert.equal(questions, 1);
  assert.equal(workers, 1);
  assert.equal(requests.length, 2);
  const body = JSON.parse(requests[0].body);
  assert.equal(body.voice_setting.voice_id, "male-qn-qingse");
  assert.equal(body.voice_setting.speed, 1.2);
  // A value already provided in the user request can go straight to generate despite askWhenMissing.
  const explicit = (await pi.execute("explicit", {
    action: "generate",
    purpose: "speech",
    input: { text: "Already specified" },
    parameters: { voice_id: "male-qn-jingying" },
  })).details;
  assert.equal(explicit.status, "completed", JSON.stringify(explicit));
  assert.equal(questions, 1);
  assert.equal(workers, 2);
  assert.equal(JSON.parse(requests[2].body).voice_setting.voice_id, "male-qn-jingying");
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
  purpose.parameters.find((parameter) => parameter.name === "voice_id").schema.options.push({
    value: "custom-user-voice", label: "用户音色", description: "用户已配置的自定义音色",
  });
  purpose.connection = {
    apiEndpoint: "https://tts.example",
    apiKey: "speech-secret",
  };
  f.model.configuration.purposes = [purpose];
  const pi = api.createPiMediaTool(f.context);
  const list = (await pi.execute("speech-list", { action: "list", purpose: "speech" })).details;
  assert.deepEqual(
    list.purposes.map((entry) => entry.purpose),
    ["speech"],
  );
  assert.deepEqual(list.purposes[0].inputSchema.required, ["text"]);
  assert.equal(list.purposes[0].modelId, "speech-2.8-hd");
  assert.equal(list.purposes[0].parameterPaths.voice_id, "parameters.voice_id");
  assert.deepEqual(list.purposes[0].inputPaths, ["input.text"]);
  assert.equal(typeof list.purposes[0].callExample.input.text, "string");
  assert.doesNotMatch(JSON.stringify(list), /speech-secret|tts\.example/);
  const args = {
    ...list.purposes[0].callExample,
    input: { text: "Hello" },
    outputName: "欢迎语配音",
    parameters: { voice_id: "custom-user-voice", speed: 1.2 },
  };
  const validated = api.validateToolArguments(pi, {
    type: "toolCall",
    id: "speech",
    name: pi.name,
    arguments: args,
  });
  const result = (await pi.execute("speech", validated)).details;
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
  assert.equal(body.voice_setting.voice_id, "custom-user-voice");
  assert.equal(body.audio_setting.format, "mp3");
  assert.equal(result.outputs[0].type, "audio");
  assert.equal(result.outputs[0].mimeType, "audio/mpeg");
  assert.match(result.outputs[0].fileName, /^欢迎语配音-[a-f0-9]{8}\.mp3$/);
  assert.match(result.outputs[0].filePath, /\.mp3$/);
  assert.deepEqual(await readFile(result.outputs[0].filePath), audio);
  assert.doesNotMatch(
    JSON.stringify(result),
    /speech-secret|cdn\.example|ID3-synthesized/,
  );
  assert.deepEqual((await pi.execute("speech", validated)).details, result);
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
  const result = await f.generate({ purpose: "video-generation", outputName: "宣传片开场" });
  assert.equal(result.status, "completed", JSON.stringify(result));
  assert.equal(result.taskId, "job/1");
  assert.equal(submissions, 1);
  assert.equal(queries, 2);
  assert.match(result.outputs[0].fileName, /^宣传片开场-[a-f0-9]{8}\.mp4$/);
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
  await assert.rejects(
    tool.execute("string-duration", { ...args, parameters: { duration: "6" } }),
    /可调参数无效.*尚未提交生成请求/,
  );
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
    { outputDirectory: temporary },
    { outputDirectory: ".git" },
    { outputDirectory: "workspace.db" },
  ])
    assert.equal(
      (await f.generate(args)).status,
      "failed",
      JSON.stringify(args),
    );
  for (const parameters of [{ response_format: "base64" }, { unknown: 1 }, { n: 0 }, { n: "1" }])
    await assert.rejects(f.generate({ parameters }), /可调参数无效.*尚未提交生成请求/);
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
  assert.deepEqual(tool.parameters.properties.action.enum, ["list", "generate"]);
  assert.equal(tool.parameters.properties.action.anyOf, undefined);
  const validated = api.validateToolArguments(tool, {
    type: "toolCall",
    id: "action-probe",
    name: tool.name,
    arguments: {
      action: "generate",
      purpose: "image-generation",
      input: { prompt: "cat" },
    },
  });
  assert.equal(validated.action, "generate");
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
      outputName: "工作进程图片",
    });
    assert.equal(result.status, "completed", JSON.stringify(result));
    assert.match(result.outputs[0].fileName, /^工作进程图片-[a-f0-9]{8}\.png$/);
    assert.deepEqual(await readFile(result.outputs[0].filePath), png);
  },
);

test("list cannot silently accept generation fields or start a worker", async (t) => {
  let workers = 0;
  const f = await fixture(t);
  f.context.run = async () => {
    workers++;
    throw new Error("must not run");
  };
  for (const extra of [
    { input: { prompt: "cat" } },
    { parameters: {} },
    { files: [] },
    { outputDirectory: "generated-media" },
    { outputName: "封面" },
    { timeoutSeconds: 30 },
  ]) {
    await assert.rejects(
      f.call({ action: "list", purpose: "image-generation", ...extra }),
      /只查询配置.*action="generate".*调用格式/,
    );
  }
  await assert.rejects(
    f.call({ action: "list", purpose: "speech" }),
    /未配置此媒体用途/,
  );
  assert.equal(workers, 0);
  const list = await f.call({ action: "list" });
  assert.equal(list.status, "configuration");
  assert.equal(list.nextAction, undefined);
  assert.equal(workers, 0);
});

test("misplaced speech parameters are rejected before workers or network instead of using defaults", async (t) => {
  let workers = 0,
    requests = 0;
  const f = await fixture(t, async () => {
    requests++;
    throw new Error("must not request");
  });
  const purpose = structuredClone(
    api.minimaxPreset.models.find((model) => model.modelId === "speech-2.8-hd")
      .templates[0].purpose,
  );
  purpose.modelId = "speech-2.8-hd";
  purpose.connection = {
    apiEndpoint: "https://tts.example",
    apiKey: "speech-secret",
  };
  f.model.configuration.purposes = [purpose];
  f.context.run = async () => {
    workers++;
    throw new Error("must not run");
  };
  for (const input of [
    { text: "Hello", voice_id: "requested-voice" },
    {
      text: "Hello",
      voice_setting: { voice_id: "requested-voice", speed: 1.2 },
    },
    { text: "Hello", model: "other-model" },
  ])
    await assert.rejects(
      f.call({ action: "generate", purpose: "speech", input }),
      /输入字段位置不正确.*parameters/,
    );
  await assert.rejects(
    f.call({
      action: "generate",
      purpose: "speech",
      input: { text: "Hello" },
      voice_id: "requested-voice",
    }),
    /顶层 parameters.*调用格式/,
  );
  await assert.rejects(
    f.call({
      action: "generate",
      purpose: "speech",
      input: { text: "Hello" },
      description: { voice_id: "requested-voice" },
    }),
    /顶层 parameters.*调用格式/,
  );
  await assert.rejects(
    f.call({ action: "generate", purpose: "speech" }),
    /生成需要 input/,
  );
  assert.equal(workers, 0);
  assert.equal(requests, 0);
  const direct = await api.runMediaGeneration(
    {
      model: f.model,
      purpose: {
        ...purpose,
        connection: { ...purpose.connection, apiFormat: "http-json" },
      },
      arguments: {
        action: "generate",
        input: {
          text: "Hello",
          voice_setting: { voice_id: "requested-voice" },
        },
      },
      execution: f.context.execution,
      protectedPaths: [],
    },
    {
      fetch: async () => {
        requests++;
        throw new Error("must not request");
      },
    },
  );
  assert.equal(direct.status, "failed");
  assert.match(direct.error, /parameters.voice_id/);
  assert.equal(requests, 0);
});

test("catalog examples never fill parameters that require user answers and remain credential-free", async (t) => {
  const f = await fixture(t);
  const purpose = f.model.configuration.purposes[0];
  purpose.modelId = "image-model";
  purpose.parameters.find(
    (parameter) => parameter.name === "aspect_ratio",
  ).askWhenMissing = true;
  const list = await f.call({ action: "list" });
  const entry = list.purposes[0];
  assert.equal(list.selectedModelId, "upstream-image");
  assert.equal(entry.modelId, "image-model");
  assert.deepEqual(entry.requiredUserParameters, ["aspect_ratio"]);
  assert.equal(
    Object.hasOwn(entry.callExample.parameters, "aspect_ratio"),
    false,
  );
  assert.equal(entry.parameterPaths.aspect_ratio, "parameters.aspect_ratio");
  assert.equal(entry.callExample.parameters.n, 3);
  assert.doesNotMatch(
    JSON.stringify(list),
    /model-fixture-key|Authorization|apiEndpoint/,
  );
});

test("input binding checks preserve nested, optional, polling and whole-input templates", async (t) => {
  const f = await fixture(t);
  const p = f.model.configuration.purposes[0];
  p.inputSchema = {
    type: "object",
    properties: {
      content: { type: "object" },
      settings: { type: "object" },
      optional: { type: "string" },
      poll_seed: { type: "string" },
      result_file: { type: "string" },
    },
  };
  p.request.body = {
    content: "{{input.content.text}}",
    settings: "{{input.settings}}",
    optional: "{{input.optional?}}",
  };
  p.response.mode = "task";
  p.response.task = {
    idPath: "/id",
    statusPath: "/status",
    successValues: ["done"],
    failureValues: ["failed"],
    intervalSeconds: 1,
    request: {
      method: "GET",
      path: "/tasks/{{task.id}}?seed={{input.poll_seed}}",
      headers: {},
    },
    resultRequest: {
      method: "GET",
      path: "/files/{{input.result_file}}",
      headers: {},
    },
  };
  const sent = [];
  f.context.run = async (request) => {
    sent.push(request.arguments.input);
    return {
      status: "completed",
      modelId: request.purpose.modelId,
      purpose: request.purpose.type,
      outputs: [],
    };
  };
  const list = await f.call({ action: "list" });
  assert.deepEqual(list.purposes[0].inputPaths, [
    "input.content.text",
    "input.settings",
    "input.optional",
    "input.poll_seed",
    "input.result_file",
  ]);
  await f.generate({
    input: {
      content: { text: "Hello" },
      settings: { arbitrary: true },
      poll_seed: "seed",
      result_file: "file",
    },
  });
  await assert.rejects(
    f.generate({
      input: { content: { text: "Hello", voice_id: "ignored" }, settings: {} },
    }),
    /input.content.voice_id/,
  );
  assert.equal(sent.length, 1);
  p.request.body = "{{input}}";
  f.reset();
  await f.generate({
    input: { voice_id: "actually consumed", arbitrary: { nested: true } },
  });
  assert.equal(sent.length, 2);
});

test("file-injected unused input is rejected by the worker before the paid request", async (t) => {
  let requests = 0;
  const f = await fixture(t, async () => {
    requests++;
    return image();
  });
  const path = join(f.workspace, "ref.png");
  await writeFile(path, png);
  const result = await f.generate({
    files: [{ pointer: "/unused", filePath: path }],
  });
  assert.equal(result.status, "failed");
  assert.match(result.error, /input.unused.*未被请求模板使用/);
  assert.equal(requests, 0);
});
