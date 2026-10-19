import assert from "node:assert/strict";
import { after, test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { createApplicationFileClient } from "@mewvis/app-sdk/files";
import { createApplicationMediaClient } from "@mewvis/app-sdk/media";

const app = fileURLToPath(new URL("../", import.meta.url));
const temporary = await realpath(
  await mkdtemp(join(tmpdir(), "playground-local-media-")),
);
after(() => rm(temporary, { recursive: true, force: true }));
const entry = join(temporary, "local-media.mjs");
await build({
  entryPoints: [join(app, "main/local-media.ts")],
  outfile: entry,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
});
const { importLocalMedia, localComposeInput, mergeMediaJobs } = await import(
  pathToFileURL(entry).href
);
const capability = {
  available: true,
  inputs: { image: ["png", "jpg"], video: ["mp4"], audio: ["wav", "mp3"] },
  output: { format: "mp4", videoCodec: "h264", audioCodec: "aac" },
  limits: { clips: 200, duration: 7200, width: 3840, height: 3840, fps: 60 },
};
const config = () => ({
  capabilities: capability,
  dataPath: "/app-data",
  requestId: "request-1",
  image: {
    filePath: "/workspace/image.png",
    size: 100,
    video: { codec: "png", width: 128, height: 72 },
  },
  audio: {
    filePath: "/workspace/voice.wav",
    size: 200,
    duration: 2,
    audio: { codec: "pcm_s16le", sampleRate: 8000, channels: 1 },
  },
  duration: 3,
  width: 640,
  height: 360,
  fit: "contain",
  trimAudio: false,
});

test("composition rejects invalid durations, unprobed kinds, unsupported sizes and implicit audio trimming", () => {
  for (const duration of [0, -1, NaN, Infinity, 60.1])
    assert.throws(() => localComposeInput({ ...config(), duration }), /时长/);
  assert.throws(
    () =>
      localComposeInput({
        ...config(),
        image: { ...config().image, filePath: "/workspace/video.mp4" },
      }),
    /图片/,
  );
  assert.throws(
    () =>
      localComposeInput({
        ...config(),
        audio: { ...config().audio, audio: undefined },
      }),
    /配音文件/,
  );
  assert.throws(() => localComposeInput({ ...config(), width: 639 }), /尺寸/);
  assert.throws(
    () =>
      localComposeInput({
        ...config(),
        capabilities: {
          ...capability,
          limits: { ...capability.limits, width: 320 },
        },
      }),
    /尺寸/,
  );
  assert.throws(
    () =>
      localComposeInput({
        ...config(),
        capabilities: {
          ...capability,
          available: false,
          reason: "FFmpeg unavailable",
        },
      }),
    /FFmpeg unavailable/,
  );
  assert.throws(
    () => localComposeInput({ ...config(), duration: 1 }),
    /裁剪配音/,
  );
  const input = localComposeInput({
    ...config(),
    duration: 1,
    trimAudio: true,
  });
  assert.equal(input.clips[0].audio.trim, true);
  assert.equal(
    input.outputFilePath,
    "/app-data/local-media/outputs/request-1/movie.mp4",
  );
  assert.notEqual(input.outputFilePath, config().image.filePath);
  assert.equal(
    localComposeInput({ ...config(), audio: undefined }).clips[0].audio,
    undefined,
  );
});

test("out-of-order polling never revives a completed job or reverses cancellation", () => {
  const job = { id: "one", status: "completed", createdAt: 1, updatedAt: 3 };
  assert.equal(
    mergeMediaJobs([job], [{ ...job, status: "running", updatedAt: 4 }])[0]
      .status,
    "completed",
  );
  assert.equal(
    mergeMediaJobs(
      [{ ...job, status: "cancelling" }],
      [{ ...job, status: "running", updatedAt: 4 }],
    )[0].status,
    "cancelling",
  );
  assert.equal(
    mergeMediaJobs(
      [{ ...job, status: "running" }],
      [{ ...job, status: "queued", updatedAt: 2 }],
    )[0].status,
    "running",
  );
  assert.deepEqual(
    mergeMediaJobs([job], [{ ...job, id: "two", createdAt: 4 }]).map(
      (item) => item.id,
    ),
    ["two", "one"],
  );
});

test("invalid files do not write; cancellation and read failures abort incomplete streams", async () => {
  for (const file of [
    new File([], "empty.png"),
    new File(["text"], "file.txt"),
  ]) {
    await assert.rejects(
      importLocalMedia(
        {},
        "/data",
        file,
        capability,
        new AbortController().signal,
      ),
    );
  }
  for (const fail of [false, true]) {
    const controller = new AbortController();
    const calls = [];
    const files = {
      beginWrite: async () => {
        calls.push("begin");
        return "write";
      },
      writeChunk: async (_id, _offset, bytes) => {
        calls.push("chunk");
        assert.ok(bytes.length <= 64 * 1024);
        if (fail) throw new Error("disk full");
        controller.abort();
      },
      abortWrite: async () => calls.push("abort"),
      commitWrite: async () => calls.push("commit"),
    };
    await assert.rejects(
      importLocalMedia(
        files,
        "/data",
        new File([new Uint8Array(200 * 1024)], "image.png"),
        capability,
        controller.signal,
      ),
    );
    assert.deepEqual(calls, ["begin", "chunk", "abort"]);
  }
});

test(
  "real SDK and FFmpeg import, probe, compose, preview, cancel and recover jobs",
  { timeout: 60000 },
  async (t) => {
    const serviceEntry = join(temporary, "services.mjs");
    await build({
      stdin: {
        contents: `export { ApplicationFiles } from ${JSON.stringify(join(app, "../../../server/src/modules/files/application-files.ts"))};
      export { ApplicationMedia } from ${JSON.stringify(join(app, "../../../server/src/modules/media/service.ts"))};
      export { EventHub } from ${JSON.stringify(join(app, "../../../server/src/infrastructure/events/event-hub.ts"))};`,
        resolveDir: app,
      },
      outfile: serviceEntry,
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node22",
    });
    const { ApplicationFiles, ApplicationMedia, EventHub } = await import(
      pathToFileURL(serviceEntry).href
    );
    const dataPath = join(temporary, "app-data");
    const workspace = join(temporary, "workspace");
    await Promise.all([mkdir(dataPath), mkdir(workspace)]);
    const files = new ApplicationFiles(
      async () => ({
        dataPath,
        workspacePaths: [workspace],
        protectedPaths: [],
      }),
      new EventHub(),
    );
    const media = new ApplicationMedia(files, join(temporary, "jobs"));
    t.after(async () => {
      await media.close();
      await files.close();
    });
    const connection = await files.connect("@mewvis/chat-playground");
    const transport = (service, token = connection) => ({
      version: 1,
      request: async (request) => {
        try {
          return { ok: true, value: await service.request(token, request) };
        } catch (error) {
          return {
            ok: false,
            error: { code: error.code || "ERROR", message: error.message },
          };
        }
      },
    });
    const fileClient = createApplicationFileClient(transport(files));
    const mediaClient = createApplicationMediaClient(transport(media));
    const capabilities = await mediaClient.capabilities();
    if (!capabilities.available) {
      t.skip(capabilities.reason);
      return;
    }
    const original = join(workspace, "source.png");
    const voice = join(workspace, "voice.wav");
    const ffmpeg = process.env.MEWVIS_FFMPEG_PATH || "ffmpeg";
    const generate = (args) =>
      execFileSync(ffmpeg, ["-v", "error", "-threads", "2", ...args], {
        timeout: 10000,
      });
    generate([
      "-f",
      "lavfi",
      "-i",
      "color=c=red:s=64x48",
      "-frames:v",
      "1",
      original,
    ]);
    generate(["-f", "lavfi", "-i", "sine=frequency=440:duration=0.4", voice]);
    const sourceBytes = await readFile(original);
    const imported = await importLocalMedia(
      fileClient,
      dataPath,
      new File([sourceBytes], '中文:"frame.PNG'),
      capabilities,
      new AbortController().signal,
    );
    assert.match(
      imported.filePath,
      /local-media\/inputs\/[^/]+\/中文__frame.png$/,
    );
    assert.deepEqual(await readFile(imported.filePath), sourceBytes);
    const image = await mediaClient.probe(imported.filePath),
      audio = await mediaClient.probe(voice);
    assert.equal(image.video.width, 64);
    assert.ok(audio.duration > 0);
    const input = localComposeInput({
      ...config(),
      capabilities,
      dataPath,
      image,
      audio,
      duration: 0.6,
      requestId: crypto.randomUUID(),
    });
    const job = await mediaClient.compose(input);
    assert.equal(
      (await mediaClient.compose(input)).id,
      job.id,
      "same request never duplicates a job",
    );
    const settled = async (id) => {
      for (let attempt = 0; attempt < 400; attempt++) {
        const latest = await mediaClient.get(id);
        if (["completed", "failed", "cancelled"].includes(latest.status))
          return latest;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error("local job timed out");
    };
    const completed = await settled(job.id);
    assert.equal(
      completed.status,
      "completed",
      JSON.stringify(completed.error),
    );
    const output = await mediaClient.probe(completed.outputFilePath);
    assert.equal(output.video.codec, "h264");
    assert.equal(output.audio.codec, "aac");
    assert.equal(output.video.width, 640);
    assert.ok(Math.abs(output.duration - 0.6) < 0.15);
    const preview = await fileClient.preview.create({
      filePath: completed.outputFilePath,
    });
    assert.equal(preview.kind, "video");
    await fileClient.preview.close(preview.id);
    const next = await mediaClient.compose(
      localComposeInput({
        ...config(),
        capabilities,
        dataPath,
        image,
        audio,
        duration: 60,
        width: 1280,
        height: 720,
        requestId: crypto.randomUUID(),
      }),
    );
    await mediaClient.cancel(next.id);
    assert.equal((await settled(next.id)).status, "cancelled");
    const reconnected = createApplicationMediaClient(
      transport(media, await files.connect("@mewvis/chat-playground")),
    );
    assert.ok(
      (await reconnected.list({ limit: 20 })).some(
        (item) => item.id === job.id && item.status === "completed",
      ),
    );
    await assert.rejects(
      mediaClient.probe(join(temporary, "outside.png")),
      /范围|目录|权限|访问/,
    );
    assert.deepEqual(
      await readFile(original),
      sourceBytes,
      "original input is never modified",
    );
  },
);
