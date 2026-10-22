import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const result = await build({
  entryPoints: [fileURLToPath(new URL("../main/exports.ts", import.meta.url))],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
});
const { createFileExports } = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
);
const context = (viewId = "test-live") => ({
  viewId,
  signal: new AbortController().signal,
});
const png = { name: "design.png", mime: "image/png", size: 6 };

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
