import assert from "node:assert/strict";
import { build } from "esbuild";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import entries from "../../../agent-runtime/build-entries.json" with { type: "json" };

const clientRoot = fileURLToPath(new URL("../../", import.meta.url));
const runtimeRoot = resolve(clientRoot, "../agent-runtime");
const temporary = await realpath(await mkdtemp(join(tmpdir(), "mewvis-image-read-")));
const runtime = join(temporary, "runtime"),
  workspace = join(temporary, "workspace");
const workers = [];
try {
  await mkdir(runtime);
  await mkdir(workspace);
  // Run the real distribution away from the repository and its node_modules.
  for (const name of [entries.executionHost.output, entries.piToolWorker.output, "vendor"])
    await cp(join(runtimeRoot, "dist", name), join(runtime, name), { recursive: true });
  await writeFile(join(runtime, "package.json"), '{"type":"module"}');
  await build({
    stdin: {
      contents: `export * from ${JSON.stringify(join(runtimeRoot, "src/security/execution/index.ts"))};`,
      loader: "ts",
      resolveDir: clientRoot,
    },
    outfile: join(runtime, "api.mjs"),
    bundle: true,
    platform: "node",
    format: "esm",
  });
  const api = await import(pathToFileURL(join(runtime, "api.mjs")).href);
  const config = structuredClone(api.EXECUTION_CONFIG);
  config.enabled = false;
  const start = async (sandbox = false) => {
    const worker = new api.ProgramExecutor({
      policy: api.resolveExecutionPolicy("full", workspace, { ...config, enabled: sandbox }, runtime, {
        access: {
          filesystem: { read: [workspace], write: [workspace] },
          network: { hosts: [] },
          process: { execute: false },
        },
      }),
      program: { executable: process.execPath, args: [join(runtime, entries.piToolWorker.output)] },
    });
    workers.push(worker);
    await worker.call(
      "initialize",
      { workspacePath: workspace, resources: { skills: { enabled: [] } } },
      undefined,
      undefined,
      60_000,
    );
    return worker;
  };
  const worker = await start();
  const read = (worker, path) =>
    worker.call(
      "execute",
      {
        callId: "image-read",
        name: "read",
        arguments: { path },
      },
      undefined,
      undefined,
      60_000,
    );
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAEElEQVR4AQEFAPr/ANxQPP8F3AJoHB1adQAAAABJRU5ErkJggg==",
    "base64",
  );
  const pngPath = join(workspace, "small.png");
  await writeFile(pngPath, png);
  const small = await read(worker, pngPath);
  assert.equal(
    small.content.filter((part) => part.type === "image").length,
    1,
    "a packaged application read must attach image bytes",
  );
  assert.deepEqual(Buffer.from(small.content.find((part) => part.type === "image").data, "base64"), png);

  // Use the shipped image library to prepare self-contained JPEG and large PNG inputs.
  const require = createRequire(pathToFileURL(join(runtime, "api.mjs")));
  const photon = require("./vendor/photon/photon_rs.cjs");
  const image = photon.PhotonImage.new_from_byteslice(png);
  try {
    const jpegPath = join(workspace, "small.jpg");
    await writeFile(jpegPath, image.get_bytes_jpeg(85));
    const jpeg = await read(worker, jpegPath);
    assert.equal(jpeg.content.find((part) => part.type === "image")?.mimeType, "image/jpeg");
    const enlarged = photon.resize(image, 2400, 2100, photon.SamplingFilter.Nearest);
    try {
      const largePath = join(workspace, "large.png");
      await writeFile(largePath, enlarged.get_bytes());
      const large = await read(worker, largePath);
      const output = large.content.find((part) => part.type === "image");
      assert.ok(output, "oversize dimensions are resized, not omitted");
      assert.ok(output.data.length < 4.5 * 1024 * 1024);
      const decoded = photon.PhotonImage.new_from_byteslice(Buffer.from(output.data, "base64"));
      try {
        assert.ok(decoded.get_width() <= 2000 && decoded.get_height() <= 2000);
      } finally {
        decoded.free();
      }
      assert.ok(large.content.some((part) => part.type === "text" && part.text.includes("original 2400x2100")));
    } finally {
      enlarged.free();
    }
  } finally {
    image.free();
  }

  const corruptPath = join(workspace, "corrupt.png");
  await writeFile(corruptPath, png.subarray(0, 24));
  await assert.rejects(read(worker, corruptPath), /图片.*(?:解码|缩放|处理).*失败/);
  const textPath = join(workspace, "plain.txt");
  await writeFile(textPath, "ordinary text still works");
  assert.equal((await read(worker, textPath)).content[0].text, "ordinary text still works");
  if (process.argv[2]) {
    const sample = join(workspace, "provided-sample.png");
    await cp(resolve(process.argv[2]), sample);
    const actual = (await read(worker, sample)).content.find((part) => part.type === "image");
    assert.ok(actual, "the reported image must also attach real bytes");
    assert.deepEqual(Buffer.from(actual.data, "base64"), await readFile(sample));
    console.log("PASS reported sample: original PNG bytes attached without resizing");
  }
  await worker.dispose();

  const isolated = await start(true);
  assert.ok((await read(isolated, pngPath)).content.some((part) => part.type === "image"));
  assert.equal(
    (await read(isolated, join(workspace, "small.jpg"))).content.find((part) => part.type === "image")?.mimeType,
    "image/jpeg",
  );
  assert.ok((await read(isolated, join(workspace, "large.png"))).content.some((part) => part.type === "image"));
  if (process.argv[2])
    assert.ok(
      (await read(isolated, join(workspace, "provided-sample.png"))).content.some((part) => part.type === "image"),
    );
  const outside = join(temporary, "outside.png");
  await writeFile(outside, png);
  await assert.rejects(read(isolated, outside));
  await isolated.dispose();
  console.log("PASS real OS sandbox: image dependencies are readable while an ungranted image path remains denied");

  // A missing runtime asset must not be described as proof that a user's image is too large.
  await rm(join(runtime, "vendor/photon/photon_rs_bg.wasm"));
  const missingAsset = await start();
  await assert.rejects(read(missingAsset, pngPath), (error) => {
    assert.match(error.message, /图片.*处理.*失败/);
    assert.doesNotMatch(error.message, /could not be resized below/);
    assert.match(error.message, /不代表图片体积超限/);
    return true;
  });
  assert.equal((await read(missingAsset, textPath)).content[0].text, "ordinary text still works");
  console.log(
    "PASS packaged image reads outside repository with application process guards: PNG/JPEG bytes, dimension resize, corrupt image and missing-WASM errors, text fallback",
  );
} finally {
  await Promise.allSettled(workers.map((worker) => worker.dispose()));
  await rm(temporary, { recursive: true, force: true });
}
