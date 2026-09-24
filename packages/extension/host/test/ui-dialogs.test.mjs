import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { transform } from "esbuild";
const { code } = await transform(
  await readFile(new URL("../ui/runtime/dialogs.ts", import.meta.url), "utf8"),
  { loader: "ts", format: "esm" },
);
const { DialogRuntime } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
);
const contribution = {
  id: "details",
  type: "dialog",
  slot: "session.dialog",
  title: "详情",
  size: "lg",
  view: { id: "details" },
  extensionId: "one",
  revision: "1",
};
const owner = () => ({
  key: Symbol(),
  extensionId: "one",
  revision: "1",
  context: { workspacePath: "/test", chatId: "a" },
});
const fixture = () => {
  const runtime = new DialogRuntime();
  runtime.update([contribution]);
  return runtime;
};

test("dialogs require a mounted slot and belong to the originating plugin and revision", async () => {
  const runtime = fixture();
  await assert.rejects(runtime.open(owner(), { id: "details" }), {
    code: "UI_UNSUPPORTED",
  });
  const detach = runtime.attach();
  await assert.rejects(
    runtime.open({ ...owner(), extensionId: "other" }, { id: "details" }),
    { code: "UI_DENIED" },
  );
  await assert.rejects(
    runtime.open({ ...owner(), revision: "old" }, { id: "details" }),
    { code: "UI_DENIED" },
  );
  await assert.rejects(runtime.open(owner(), { id: "missing" }), {
    code: "UI_DENIED",
  });
  assert.throws(() => runtime.attach(), /Only one/);
  detach();
});
test("serializable input is isolated and caller context is inherited; only one modal is active", async () => {
  const runtime = fixture();
  runtime.attach();
  const source = owner(),
    input = { runId: "run-a" };
  const closed = runtime.open(source, { id: "details", input });
  input.runId = "changed";
  assert.deepEqual(runtime.snapshot().input, { runId: "run-a" });
  assert.equal(runtime.snapshot().owner, source);
  await assert.rejects(runtime.open(owner(), { id: "details" }), {
    code: "UI_BUSY",
  });
  runtime.close(999);
  assert.ok(runtime.snapshot());
  runtime.close(runtime.snapshot().id);
  await closed;
  assert.equal(runtime.snapshot(), null);
});
test("invalid or oversized dialog payloads are rejected without opening a view", async () => {
  const runtime = fixture();
  runtime.attach();
  const cyclic = {};
  cyclic.self = cyclic;
  for (const input of [
    [],
    { x: undefined },
    { x: Infinity },
    { x: new Map() },
    cyclic,
    { x: "中".repeat(23000) },
  ])
    await assert.rejects(runtime.open(owner(), { id: "details", input }), {
      code: "UI_INVALID_REQUEST",
    });
  await assert.rejects(
    runtime.open(owner(), { id: "details", extensionId: "other" }),
    { code: "UI_INVALID_REQUEST" },
  );
  assert.equal(runtime.snapshot(), null);
});
test("source disposal, plugin disable/update and slot unmount close pending dialogs", async () => {
  for (const reason of ["source", "disable", "update", "unmount"]) {
    const runtime = fixture(),
      source = owner();
    const detach = runtime.attach();
    const closed = runtime.open(source, { id: "details" });
    runtime.release(Symbol());
    assert.ok(runtime.snapshot());
    if (reason === "source") runtime.release(source.key);
    if (reason === "disable") runtime.update([]);
    if (reason === "update")
      runtime.update([{ ...contribution, revision: "2" }]);
    if (reason === "unmount") detach();
    await closed;
    assert.equal(runtime.snapshot(), null);
  }
});

test("host confirmation returns a decision without invoking a plugin action", async () => {
  const runtime = fixture();
  const detach = runtime.attach();
  const source = owner();
  const accepted = runtime.confirm(source, {
    title: "删除规则？",
    description: "删除后无法恢复",
    confirmText: "删除",
    tone: "danger",
  });
  assert.deepEqual(
    { kind: runtime.snapshot().kind, title: runtime.snapshot().title, tone: runtime.snapshot().tone },
    { kind: "confirm", title: "删除规则？", tone: "danger" },
  );
  await assert.rejects(runtime.open(source, { id: "details" }), { code: "UI_BUSY" });
  runtime.close(runtime.snapshot().id, true);
  assert.equal(await accepted, true);
  const view = runtime.open(source, { id: "details" });
  await assert.rejects(runtime.confirm(source, { title: "删除？", confirmText: "删除" }), { code: "UI_BUSY" });
  runtime.close();
  await view;
  const cancelled = runtime.confirm(source, { title: "删除？", confirmText: "删除" });
  runtime.close();
  assert.equal(await cancelled, false);
  const removed = runtime.confirm(source, { title: "删除？", confirmText: "删除" });
  runtime.release(source.key);
  assert.equal(await removed, false);
  detach();
});

test("confirmation validates data and closes when its plugin or slot disappears", async () => {
  const runtime = fixture();
  const detach = runtime.attach();
  const source = owner();
  for (const input of [null, {}, { title: "删除？", confirmText: "删除", tone: "invalid" }, { title: "删除？", confirmText: "删除", extra: true }])
    await assert.rejects(runtime.confirm(source, input), { code: "UI_INVALID_REQUEST" });
  await assert.rejects(runtime.confirm({ ...source, revision: "old" }, { title: "删除？", confirmText: "删除" }), { code: "UI_DENIED" });
  const disabled = runtime.confirm(source, { title: "删除？", confirmText: "删除" });
  runtime.update([]);
  assert.equal(await disabled, false);
  runtime.update([contribution]);
  const unmounted = runtime.confirm(source, { title: "删除？", confirmText: "删除" });
  detach();
  assert.equal(await unmounted, false);
});
