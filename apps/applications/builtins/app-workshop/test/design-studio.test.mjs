import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const result = await build({
  stdin: {
    contents: `export * from './main/exports.ts';
export * from './mini-apps/design-studio/source/src/model.ts';
export { htmlDocument } from './mini-apps/design-studio/source/src/render.ts';`,
    resolveDir: fileURLToPath(new URL("..", import.meta.url)),
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
});
const {
  createFileExports,
  restore,
  template,
  layer,
  hitTest,
  fitSize,
  htmlDocument,
} = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
);
const context = (viewId = "test-live") => ({
  viewId,
  signal: new AbortController().signal,
});
const png = { name: "design.png", mime: "image/png", size: 6 };

test("designs round-trip, exports preserve aspect ratio, and rotated locked layers do not capture input", () => {
  for (const kind of ["blank", "intro", "event", "mewvis"]) {
    const value = template(kind);
    assert.deepEqual(restore(JSON.parse(JSON.stringify(value))), value);
  }
  assert.deepEqual(fitSize(1920, 1080), { width: 3840, height: 2160 });
  assert.deepEqual(fitSize(1200, 1600), { width: 2880, height: 3840 });
  const a = layer("rect", { x: 0, y: 0, width: 200, height: 50, rotation: 90 });
  const b = layer("rect", { x: 0, y: 0, width: 200, height: 50, locked: true });
  const design = { ...template("blank"), layers: [a, b] };
  assert.equal(hitTest(design, 100, 90)?.id, a.id);
  assert.equal(hitTest(design, 10, 10), undefined);
  a.hidden = true;
  assert.equal(hitTest(design, 100, 90), undefined);
});

test("import rejects remote and SVG resources, duplicate IDs, and oversized documents", () => {
  const design = template("blank");
  for (const src of [
    "https://example.com/a.png",
    "data:image/svg+xml;base64,AAAA",
    "javascript:alert(1)",
  ])
    assert.throws(
      () => restore({ ...design, layers: [layer("image", { src })] }),
      /图片/,
    );
  const item = layer("text");
  assert.throws(() => restore({ ...design, layers: [item, item] }), /标识/);
  assert.throws(
    () =>
      restore({
        ...design,
        layers: Array.from({ length: 51 }, () => layer("text")),
      }),
    /50/,
  );
  const images = Array.from({ length: 4 }, () =>
    layer("image", { src: "data:image/png;base64," + "A".repeat(80000) }),
  );
  assert.throws(() => restore({ ...design, layers: images }), /200 KiB/);
  const cleaned = restore({
    ...design,
    width: Infinity,
    height: -1,
    background: "url(evil)",
    layers: [layer("text", { fontSize: 99999, opacity: -2 })],
  });
  assert.equal(cleaned.width, 1920);
  assert.equal(cleaned.height, 320);
  assert.equal(cleaned.background, "#faf8f4");
  assert.equal(cleaned.layers[0].fontSize, 400);
  assert.equal(cleaned.layers[0].opacity, 0);
});

test("standalone HTML escapes user text and contains its scene and renderer", () => {
  const design = {
    ...template("blank"),
    title: '<img src=x onerror="alert(1)">',
    layers: [layer("text", { text: "</script><script>alert(1)</script>" })],
  };
  const html = htmlDocument(design);
  assert.ok(!html.includes("<img src=x"));
  assert.ok(!html.includes("</script><script>alert(1)"));
  const data = html.match(/type="application\/json">(.*?)<\/script>/s)[1];
  assert.deepEqual(JSON.parse(data), design);
  assert.match(html, /canvas/);
  assert.match(html, /async function renderDesign/);
});

test("file export assembles ordered chunks, commits once and never accepts a child path", async () => {
  const saved = [];
  const bridge = createFileExports({
    viewId: "test-live",
    passive: false,
    async save(bytes, name) {
      saved.push({ bytes: [...bytes], name });
      return "/owned/exports/design.png";
    },
  });
  const call = (name, params) =>
    bridge.methods[`file.export.${name}`](params, context());
  await assert.rejects(
    call("begin", { ...png, path: "/tmp/escape" }),
    /不能导出/,
  );
  await assert.rejects(
    call("begin", { ...png, name: "../design.png" }),
    /仅支持/,
  );
  await assert.rejects(
    call("begin", { ...png, size: 16 * 1024 * 1024 + 1 }),
    /仅支持/,
  );
  const { id } = await call("begin", png);
  await assert.rejects(call("finish", { id }), /完整/);
  await assert.rejects(call("chunk", { id, offset: 1, data: "AQID" }), /顺序/);
  await assert.rejects(
    call("chunk", { id, offset: 0, data: "@@==" }),
    /数据块/,
  );
  await call("chunk", { id, offset: 0, data: "AQID" });
  await call("chunk", { id, offset: 3, data: "BAUG" });
  assert.deepEqual(await call("finish", { id }), {
    path: "/owned/exports/design.png",
  });
  assert.deepEqual(saved, [{ bytes: [1, 2, 3, 4, 5, 6], name: "design.png" }]);
  await assert.rejects(call("finish", { id }), /不存在/);
});

test("passive, foreign, aborted, canceled and disposed views cannot export", async () => {
  const save = async () => {
    throw new Error("must not save");
  };
  const passive = createFileExports({
    viewId: "test-live",
    passive: true,
    save,
  });
  await assert.rejects(
    passive.methods["file.export.begin"](png, context()),
    /不能导出/,
  );
  const bridge = createFileExports({
    viewId: "test-live",
    passive: false,
    save,
  });
  const begin = bridge.methods["file.export.begin"];
  await assert.rejects(begin(png, context("other-live")), /不能导出/);
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(
    begin(png, { viewId: "test-live", signal: abort.signal }),
    /abort/i,
  );
  const { id } = await begin(png, context());
  await bridge.methods["file.export.cancel"]({ id }, context());
  await assert.rejects(
    bridge.methods["file.export.finish"]({ id }, context()),
    /不存在/,
  );
  bridge.dispose();
  await assert.rejects(begin(png, context()), /不能导出/);
});
