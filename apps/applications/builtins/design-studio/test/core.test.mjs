import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { api, createFixture } from "./fixture.mjs";

test("new designs reject workshop documents, embedded images and unsafe asset paths", () => {
  const design = api.template("blank");
  for (const kind of ["blank", "intro", "event", "mewvis"]) {
    const original = api.template(kind);
    assert.deepEqual(
      api.restore(JSON.parse(JSON.stringify(original))),
      original,
    );
  }
  assert.throws(() => api.restore({ ...design, format: 1 }), /不支持/);
  for (const src of [
    "data:image/png;base64,AAAA",
    "https://example.com/image.png",
    "../image.png",
    "assets/../image.png",
    "assets/a.svg",
    "assets/a.png?x",
    "C:\\image.png",
  ])
    assert.throws(
      () => api.restore({ ...design, layers: [api.layer("image", { src })] }),
      /工作区/,
    );
  const image = api.layer("image", { src: "assets/image-1.png" });
  assert.equal(
    api.restore({ ...design, layers: [image] }).layers[0].src,
    image.src,
  );
  assert.throws(
    () => api.restore({ ...design, layers: [image, image] }),
    /标识/,
  );
  assert.throws(
    () =>
      api.restore({
        ...design,
        layers: Array.from({ length: 51 }, () => api.layer("text")),
      }),
    /50/,
  );
  assert.deepEqual(api.fitSize(1200, 1600), { width: 2880, height: 3840 });
});

test("workspace creation, original assets, file saves, reopen, detach and attach round-trip on disk", async (t) => {
  const f = await createFixture();
  t.after(f.close);
  const project = await f.repository.create("活动海报", f.root);
  assert.equal(project.workspace.path, join(f.root, "活动海报"));
  const bytes = new Uint8Array(256 * 1024).fill(123);
  const src = await f.repository.importAsset(project, bytes, "image/png");
  const design = {
    ...project.design,
    title: "新版海报",
    layers: [api.layer("image", { src })],
  };
  await f.repository.save(project, design);
  const saved = JSON.parse(
    await readFile(join(project.workspace.path, "design.json"), "utf8"),
  );
  assert.equal(saved.layers[0].src, src);
  assert.ok(!JSON.stringify(saved).includes("data:image"));
  assert.deepEqual(await f.repository.readAsset(project, src), bytes);
  assert.deepEqual(
    (await f.repository.open(project.workspace.id)).design,
    design,
  );
  assert.equal((await f.repository.list())[0].title, "新版海报");
  const exported = await f.repository.exportFile(project, bytes, "png");
  assert.ok(exported.startsWith(join(project.workspace.path, "exports/")));
  assert.deepEqual(new Uint8Array(await readFile(exported)), bytes);
  await f.repository.remove(project.workspace.id);
  assert.deepEqual(await f.repository.list(), []);
  assert.ok(await stat(join(project.workspace.path, "design.json")));
  assert.deepEqual(
    (await f.repository.attach(project.workspace.path)).design,
    design,
  );
});

test("cancellation and directory collisions do not overwrite existing work; failed initialization cleans its new workspace", async (t) => {
  const f = await createFixture();
  t.after(f.close);
  f.state.cancelCreate = true;
  assert.equal(await f.repository.create("取消", f.root), null);
  assert.deepEqual(await readdir(f.root), []);
  f.state.cancelCreate = false;
  const project = await f.repository.create("保留", f.root);
  const original = await readFile(join(project.workspace.path, "design.json"));
  await assert.rejects(f.repository.create("保留", f.root), /exist/);
  assert.deepEqual(
    await readFile(join(project.workspace.path, "design.json")),
    original,
  );
  f.state.failWrite = true;
  await assert.rejects(f.repository.create("失败", f.root), /测试保存失败/);
  assert.deepEqual(await readdir(f.root), ["保留"]);
  assert.equal(f.records.size, 1);
  assert.equal(f.writes.size, 0);
});

test("external file edits are preserved, and a corrupt workspace does not hide healthy projects", async (t) => {
  const f = await createFixture();
  t.after(f.close);
  const project = await f.repository.create("冲突", f.root);
  const path = join(project.workspace.path, "design.json");
  await writeFile(path, "external content");
  await assert.rejects(
    f.repository.save(project, { ...project.design, title: "不能覆盖" }),
    /外部修改/,
  );
  assert.equal(await readFile(path, "utf8"), "external content");
  await f.repository.create("正常", f.root);
  const entries = await f.repository.list();
  assert.equal(entries.length, 2);
  assert.equal(
    entries.find((entry) => entry.title === "正常").error,
    undefined,
  );
  assert.ok(entries.find((entry) => entry.title === "冲突").error);
  await assert.rejects(
    f.repository.readAsset(project, "../escape.png"),
    /路径无效/,
  );
});

test("save queue coalesces pending changes, serializes commits, retains latest content after failure", async () => {
  const committed = [];
  let release;
  const queue = api.createSaveQueue(async (value) => {
    if (value === 1)
      await new Promise((resolve) => {
        release = resolve;
      });
    committed.push(value);
  });
  queue.enqueue(1);
  const first = queue.flush();
  queue.enqueue(2);
  queue.enqueue(3);
  assert.equal(queue.flush(), first);
  release();
  await first;
  assert.deepEqual(committed, [1, 3]);
  let fail = true;
  const retry = api.createSaveQueue(async (value) => {
    if (fail) {
      fail = false;
      throw new Error("disk full");
    }
    committed.push(value);
  });
  retry.enqueue(4);
  await assert.rejects(retry.flush(), /disk full/);
  retry.enqueue(5);
  await retry.flush();
  assert.deepEqual(committed, [1, 3, 5]);
});

test("HTML export escapes content and embeds asset data rather than temporary preview URLs", () => {
  const design = {
    ...api.template("blank"),
    title: '<img src=x onerror="alert(1)">',
    layers: [
      api.layer("text", { text: "</script><script>alert(1)</script>" }),
      api.layer("image", { src: "assets/a.png" }),
    ],
  };
  const html = api.htmlDocument(design, {
    "assets/a.png": "data:image/png;base64,AAAA",
  });
  assert.ok(!html.includes("<img src=x"));
  assert.ok(!html.includes("</script><script>alert(1)"));
  const data = JSON.parse(
    html.match(/type="application\/json">(.*?)<\/script>/s)[1],
  );
  assert.deepEqual(data.design, design);
  assert.deepEqual(data.sources, {
    "assets/a.png": "data:image/png;base64,AAAA",
  });
  assert.ok(!html.includes("blob:"));
});
