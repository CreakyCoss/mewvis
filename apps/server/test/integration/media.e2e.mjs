import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ApplicationHost } from "../../dist/modules/applications/host.js";
import { runtimeConfig } from "../../dist/config/runtime.js";
import { ApplicationFiles } from "../../dist/modules/files/application-files.js";
import { ApplicationMedia } from "../../dist/modules/media/service.js";
import { EventHub } from "../../dist/infrastructure/events/event-hub.js";
import { createApplicationMediaClient } from "../../../../packages/app/sdk/media/index.js";

const ffmpeg = process.env.MEWVIS_FFMPEG_PATH || "ffmpeg";
const sleep = (ms = 25) => new Promise((resolve) => setTimeout(resolve, ms));
async function fixture(t, env = process.env) {
  const root = await fs.realpath(
    await fs.mkdtemp(join(tmpdir(), "mewvis-media-")),
  );
  const workspaces = { a: join(root, "a"), b: join(root, "b") };
  const enabled = new Set(["a", "b"]);
  for (const path of Object.values(workspaces)) await fs.mkdir(path);
  const state = join(root, "state");
  const files = new ApplicationFiles(async (owner) => {
    if (!enabled.has(owner)) {
      const error = new Error("denied");
      error.code = "PERMISSION_DENIED";
      throw error;
    }
    return {
      dataPath: workspaces[owner],
      workspacePaths: [],
      protectedPaths: [join(workspaces[owner], "protected.mp4")],
    };
  }, new EventHub());
  const media = new ApplicationMedia(files, state, env);
  const connections = {};
  const client = async (owner) => {
    const token = await files.connect(owner);
    connections[owner] = token;
    return createApplicationMediaClient({
      version: 1,
      request: async (request) => {
        try {
          return { ok: true, value: await media.request(token, request) };
        } catch (error) {
          return {
            ok: false,
            error: {
              code: error.code || "MEDIA_ERROR",
              message: error.message,
            },
          };
        }
      },
    });
  };
  const a = await client("a"),
    b = await client("b");
  t.after(async () => {
    await media.close();
    await files.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  return {
    root,
    state,
    workspaces,
    enabled,
    files,
    media,
    a,
    b,
    connections,
    client,
  };
}
function generate(args) {
  execFileSync(
    ffmpeg,
    ["-hide_banner", "-v", "error", "-threads", "2", ...args],
    { timeout: 15000, stdio: "pipe" },
  );
}
async function sources(q) {
  const image = join(q.workspaces.a, "red.png"),
    video = join(q.workspaces.a, "blue.mp4"),
    audio = join(q.workspaces.a, "voice.wav");
  generate([
    "-f",
    "lavfi",
    "-i",
    "color=c=red:s=64x48:d=0.1",
    "-frames:v",
    "1",
    image,
  ]);
  generate([
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:s=80x48:r=24:d=0.7",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=330:duration=0.7",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    video,
  ]);
  generate(["-f", "lavfi", "-i", "sine=frequency=880:duration=0.4", audio]);
  return { image, video, audio };
}
async function settled(client, id) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const job = await client.get(id);
    if (["completed", "failed", "cancelled"].includes(job.status)) return job;
    await sleep();
  }
  throw new Error("media job did not settle");
}
const input = (q, image, extra = {}) => ({
  clips: [{ visual: { kind: "image", filePath: image }, duration: 0.6 }],
  outputFilePath: join(q.workspaces.a, "exports", "movie.mp4"),
  width: 96,
  height: 64,
  fps: 24,
  ...extra,
});

test("real FFmpeg composition, file preview, application-owned history and reconnection", async (t) => {
  const q = await fixture(t),
    s = await sources(q);
  assert.equal((await q.a.capabilities()).available, true);
  assert.equal((await q.a.probe(s.image)).video.width, 64);
  assert.ok((await q.a.probe(s.audio)).duration > 0);
  const request = input(q, s.image, {
    requestId: "render-once",
    clips: [
      {
        visual: { kind: "image", filePath: s.image },
        duration: 0.6,
        audio: { filePath: s.audio },
      },
      {
        visual: { kind: "video", filePath: s.video },
        duration: 0.6,
        sourceAudio: "keep",
      },
    ],
  });
  const job = await q.a.compose(request);
  assert.equal((await q.a.compose(request)).id, job.id);
  await q.files.disconnect(q.connections.a);
  const reconnected = await q.client("a");
  const done = await settled(reconnected, job.id);
  assert.equal(done.status, "completed", JSON.stringify(done));
  assert.equal(done.progress, 1);
  assert.ok(done.output.size > 0);
  assert.equal((await fs.stat(done.outputFilePath)).nlink, 1);
  const info = await reconnected.probe(done.outputFilePath);
  assert.equal(info.video.width, 96);
  assert.equal(info.video.height, 64);
  assert.ok(Math.abs(info.duration - 1.2) < 0.2, JSON.stringify(info));
  assert.equal(info.audio.codec, "aac");
  const frameAt = (seconds) =>
    execFileSync(ffmpeg, [
      "-v",
      "error",
      "-ss",
      String(seconds),
      "-i",
      done.outputFilePath,
      "-frames:v",
      "1",
      "-vf",
      "scale=1:1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "pipe:1",
    ]);
  const red = frameAt(0.2),
    blue = frameAt(0.9);
  assert.ok(
    red[0] > 200 && red[2] < 30,
    "first clip retains the selected red image",
  );
  assert.ok(
    blue[2] > 200 && blue[0] < 30,
    "second clip retains the selected blue video",
  );
  const preview = await q.files.request(q.connections.a, {
    version: 1,
    method: "preview.create",
    params: { filePath: done.outputFilePath },
  });
  assert.equal(preview.kind, "video");
  assert.equal((await reconnected.list())[0].id, job.id);
  await assert.rejects(q.b.get(job.id), /未找到/);
  await assert.rejects(q.b.cancel(job.id), /未找到/);
  await assert.rejects(
    reconnected.compose({ ...request, width: 100 }),
    (error) => error.code === "REQUEST_CONFLICT",
  );
  const bytes = await fs.readFile(done.outputFilePath);
  await assert.rejects(
    reconnected.compose({ ...request, requestId: "different-request" }),
    (error) => error.code === "FILE_EXISTS",
  );
  assert.deepEqual(await fs.readFile(done.outputFilePath), bytes);
  await q.media.close();
  const restarted = new ApplicationMedia(q.files, q.state);
  try {
    const saved = await restarted.request(q.connections.a, {
      version: 1,
      method: "get",
      params: { id: job.id },
    });
    assert.deepEqual(saved, done);
  } finally {
    await restarted.close();
  }
  assert.equal(
    (await fs.readdir(q.state)).some((name) => name.startsWith("work-")),
    false,
  );
});

test("file scope, symlinks, protected outputs and executable/filter injection are rejected", async (t) => {
  const q = await fixture(t),
    s = await sources(q);
  await assert.rejects(
    q.b.probe(s.image),
    (error) => error.code === "PERMISSION_DENIED",
  );
  await assert.rejects(
    q.b.compose(input(q, s.image)),
    (error) => error.code === "PERMISSION_DENIED",
  );
  await assert.rejects(
    q.a.compose(
      input(q, s.image, {
        outputFilePath: join(q.workspaces.a, "protected.mp4"),
      }),
    ),
    (error) => error.code === "PERMISSION_DENIED",
  );
  const link = join(q.workspaces.a, "linked.png");
  await fs.symlink(s.image, link);
  await assert.rejects(
    q.a.probe(link),
    (error) => error.code === "PERMISSION_DENIED",
  );
  await assert.rejects(
    q.a.compose(input(q, s.image, { ffmpegArgs: ["-y"] })),
    /未知字段/,
  );
  await assert.rejects(
    q.a.compose(
      input(q, s.image, {
        clips: [
          {
            visual: { kind: "image", filePath: "https://example.com/a.png" },
            duration: 1,
          },
        ],
      }),
    ),
    /完整路径/,
  );
  await assert.rejects(
    q.a.compose(
      input(q, s.image, {
        clips: [
          {
            visual: { kind: "image", filePath: s.image },
            duration: 1,
            fit: "movie=/secret",
          },
        ],
      }),
    ),
    /无效/,
  );
  await assert.rejects(q.a.compose(input(q, s.image, { width: 97 })), /偶数/);
  await assert.rejects(
    q.a.compose(input(q, s.image, { workspaceId: "someone-else" })),
    /未知字段/,
  );
});

test("duration mismatches fail explicitly; freeze/trim are opt-in; cancellation never publishes partial files", async (t) => {
  const q = await fixture(t),
    s = await sources(q);
  // A long soundtrack must not hide a short video stream behind the container duration.
  const longAudio = join(q.workspaces.a, "long-audio.mp4");
  generate([
    "-i",
    s.video,
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=2",
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    longAudio,
  ]);
  assert.ok((await q.a.probe(longAudio)).duration < 1);
  const badVideo = await q.a.compose(
    input(q, s.image, {
      clips: [
        { visual: { kind: "video", filePath: longAudio }, duration: 1.2 },
      ],
    }),
  );
  assert.equal(
    (await settled(q.a, badVideo.id)).error.code,
    "DURATION_MISMATCH",
  );
  const frozen = await q.a.compose(
    input(q, s.image, {
      clips: [
        {
          visual: { kind: "video", filePath: s.video },
          duration: 1.2,
          shortVideo: "freeze",
        },
      ],
    }),
  );
  assert.equal((await settled(q.a, frozen.id)).status, "completed");
  const short = input(q, s.image, {
    outputFilePath: join(q.workspaces.a, "short.mp4"),
    clips: [
      {
        visual: { kind: "image", filePath: s.image },
        duration: 0.2,
        audio: { filePath: s.audio },
      },
    ],
  });
  const badAudio = await q.a.compose(short);
  assert.equal(
    (await settled(q.a, badAudio.id)).error.code,
    "DURATION_MISMATCH",
  );
  const trimmed = await q.a.compose({
    ...short,
    clips: [{ ...short.clips[0], audio: { filePath: s.audio, trim: true } }],
  });
  assert.equal((await settled(q.a, trimmed.id)).status, "completed");
  const cancel = await q.a.compose(
    input(q, s.image, {
      outputFilePath: join(q.workspaces.a, "cancelled.mp4"),
      width: 1080,
      height: 1920,
      clips: [{ visual: { kind: "image", filePath: s.image }, duration: 60 }],
    }),
  );
  while ((await q.a.get(cancel.id)).phase === "preparing") await sleep();
  await q.a.cancel(cancel.id);
  assert.equal((await settled(q.a, cancel.id)).status, "cancelled");
  await assert.rejects(fs.stat(cancel.outputFilePath), { code: "ENOENT" });
});

test("missing encoders report capability unavailability without fake successful jobs", async (t) => {
  const q = await fixture(t, {
    ...process.env,
    MEWVIS_FFMPEG_PATH: "/missing/ffmpeg",
    MEWVIS_FFPROBE_PATH: "/missing/ffprobe",
  });
  assert.equal((await q.a.capabilities()).available, false);
  const image = join(q.workspaces.a, "image.png");
  await fs.writeFile(image, "not important before encoder availability check");
  const job = await q.a.compose(input(q, image));
  const failed = await settled(q.a, job.id);
  assert.equal(failed.status, "failed");
  assert.equal(failed.error.code, "CAPABILITY_UNAVAILABLE");
});

test("queued cancellation and application revocation stop jobs without publishing; restart marks unfinished records interrupted", async (t) => {
  const q = await fixture(t),
    s = await sources(q);
  const jobs = [];
  for (let i = 0; i < 3; i++)
    jobs.push(
      await q.a.compose(
        input(q, s.image, {
          outputFilePath: join(q.workspaces.a, `job-${i}.mp4`),
          width: 1080,
          height: 1920,
          clips: [
            { visual: { kind: "image", filePath: s.image }, duration: 60 },
          ],
        }),
      ),
    );
  assert.equal((await q.a.get(jobs[2].id)).phase, "queued");
  assert.equal((await q.a.cancel(jobs[2].id)).status, "cancelled");
  q.enabled.delete("a");
  await q.media.revoke("a");
  await assert.rejects(
    q.a.get(jobs[0].id),
    (error) => error.code === "PERMISSION_DENIED",
  );
  for (const job of jobs)
    await assert.rejects(fs.stat(job.outputFilePath), { code: "ENOENT" });
  await q.media.close();
  const directory = (await fs.readdir(q.state)).find((name) =>
    /^[a-f0-9]{64}$/.test(name),
  );
  const file = join(q.state, directory, `${jobs[0].id}.json`);
  const record = JSON.parse(await fs.readFile(file, "utf8"));
  record.job.status = "running";
  record.job.phase = "rendering";
  delete record.job.error;
  await fs.writeFile(file, JSON.stringify(record));
  q.enabled.add("a");
  const restarted = new ApplicationMedia(q.files, q.state);
  try {
    const recovered = await restarted.request(q.connections.a, {
      version: 1,
      method: "get",
      params: { id: jobs[0].id },
    });
    assert.equal(recovered.status, "failed");
    assert.equal(recovered.error.code, "INTERRUPTED");
  } finally {
    await restarted.close();
  }
});

test("native application tools compose through ctx.media and the production reverse RPC host", async (t) => {
  const q = await fixture(t),
    s = await sources(q);
  const pkg = join(q.root, "native-package"),
    runtime = join(q.root, "runtime"),
    entry = join(pkg, "index.js");
  await fs.mkdir(pkg);
  await fs.mkdir(join(runtime, "app-host"), { recursive: true });
  await fs.copyFile(
    fileURLToPath(
      new URL(
        "../../../../packages/app/host/dist/service.mjs",
        import.meta.url,
      ),
    ),
    join(runtime, "app-host/service.mjs"),
  );
  await fs.writeFile(
    join(pkg, "package.json"),
    JSON.stringify({
      name: "a",
      type: "module",
      version: "1.0.0",
      mewvis: {
        app: { version: 1, entry: "./index.js" },
        permissions: ["workspace-files"],
      },
    }),
  );
  const sdk = new URL("../../../../packages/app/sdk/index.js", import.meta.url)
    .href;
  await fs.writeFile(
    entry,
    `import {defineApplication,defineTool} from ${JSON.stringify(sdk)};
export default defineApplication({inject:["media","tools"],apply(ctx){ctx.tools.register(defineTool({
 name:"compose_fixture",description:"Compose a local media clip",risk:"medium",parameters:{type:"object",properties:{filePath:{type:"string"},outputFilePath:{type:"string"}},required:["filePath","outputFilePath"]},
 output:{schema:{type:"object"},render:(_a,v)=>[{type:"text",text:JSON.stringify(v)}]},
 execute:({filePath,outputFilePath})=>ctx.media.compose({clips:[{visual:{kind:"image",filePath},duration:0.5}],width:96,height:64,outputFilePath})
}));}});`,
  );
  const config = runtimeConfig({
    dataDir: join(q.root, "host-data"),
    cliPath: join(runtime, "cli.js"),
  });
  const packages = {
    path: join(q.root, "packages"),
    list: async () => [
      {
        id: "a",
        name: "a",
        version: "1.0.0",
        runtimeKind: "mewvis",
        source: "builtin",
        enabled: true,
        path: pkg,
        entry,
        permissionStatus: "declared",
        permissions: ["workspace-files"],
      },
    ],
  };
  const host = new ApplicationHost(
    config,
    packages,
    {},
    new EventHub(),
    q.files,
    q.media,
  );
  t.after(() => host.close());
  const result = await host.invoke("execute", {
    applicationId: "a",
    toolName: "compose_fixture",
    arguments: {
      filePath: s.image,
      outputFilePath: join(q.workspaces.a, "native.mp4"),
    },
  });
  const done = await settled(q.a, result.value.id);
  assert.equal(done.status, "completed", JSON.stringify(done));
  await assert.rejects(
    host.invoke("execute", {
      applicationId: "a",
      toolName: "compose_fixture",
      arguments: {
        filePath: join(q.workspaces.b, "elsewhere.png"),
        outputFilePath: join(q.workspaces.a, "denied.mp4"),
      },
    }),
    /数据目录或工作区/,
  );
});
