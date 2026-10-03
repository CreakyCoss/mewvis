import assert from "node:assert/strict";
import { test, after } from "node:test";
import { build } from "esbuild";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fixture } from "./fixture.mjs";
import { loadBuiltins, prepareBuiltins } from "../scripts/builtins.mjs";
import { packApplication } from "@mewvis/app-dev/tooling";

const applicationRoot = fileURLToPath(new URL("..", import.meta.url));
const runtimeRoot = await mkdtemp(join(tmpdir(), "workshop-builtin-runtime-"));
after(() => rm(runtimeRoot, { recursive: true, force: true }));
await build({
  stdin: {
    contents: `export { createProjectService, starterFiles, previewWorkspaces } from './main/host/projects.ts';
export { createBuiltinService } from './main/host/builtins.ts';`,
    resolveDir: applicationRoot,
  },
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: join(runtimeRoot, "runtime.mjs"),
});
const {
  createProjectService,
  createBuiltinService,
  starterFiles,
  previewWorkspaces,
} = await import(pathToFileURL(join(runtimeRoot, "runtime.mjs")));
const template = (id = "counter", version = 1) => ({
  id,
  name: `测试 ${id}`,
  description: "仅用于隔离测试的模板",
  version,
  files: {
    ...starterFiles(id),
    "src/App.tsx": `export default function App() { return <h1>模板 ${version}</h1> }`,
  },
});
const journalPath = (f) => join(f.root, ".workshop/builtins.json");
const journal = async (f) => JSON.parse(await readFile(journalPath(f), "utf8"));
const services = (f, definitions) => {
  const projects = createProjectService(f.workspaces);
  return {
    projects,
    builtins: createBuiltinService(f.workspaces, projects, definitions),
  };
};

test("an empty catalog initializes without projects or a journal", async (t) => {
  const f = await fixture(t);
  const { builtins } = services(f, []);
  assert.deepEqual(await builtins.initialize(), {
    builtins: [],
    errors: [],
  });
  assert.deepEqual((await f.run("workshop_list_projects")).projects, []);
  await assert.rejects(readFile(journalPath(f)), { code: "ENOENT" });
  await assert.rejects(
    f.run("workshop_create_from_builtin", { builtinId: "unknown" }),
    /不存在/,
  );
  assert.equal(f.tools.get("workshop_initialize_builtins").risk, "medium");
  assert.equal(f.tools.get("workshop_create_from_builtin").risk, "medium");
});

test("the shipped cat mini-app initializes as a runnable saved version without duplicate installation", async (t) => {
  const f = await fixture(t);
  const catalog = (await f.run("workshop_list_builtins")).builtins;
  assert.ok(
    catalog.some(
      (item) => item.id === "cat-packing" && item.name === "猫猫收纳所",
    ),
  );
  assert.deepEqual((await f.run("workshop_initialize_builtins")).errors, []);
  const first = (await f.run("workshop_list_projects")).projects;
  const cat = first.find((item) => item.name === "猫猫收纳所");
  assert.ok(cat?.savedVersionId);
  const { artifact } = await f.run("workshop_read_build", {
    workspaceId: cat.id,
    mode: "saved",
  });
  assert.match(artifact.script, /cat-packing-v1/);
  assert.match(artifact.script, /data:image\/webp;base64/);
  await f.run("workshop_initialize_builtins");
  assert.deepEqual(
    (await f.run("workshop_list_projects")).projects.map((item) => item.id),
    first.map((item) => item.id),
  );
});

test("concurrent initialization and restart install one runnable V1 per template in catalog order", async (t) => {
  const f = await fixture(t);
  const definitions = [template("first"), template("second")];
  const { projects, builtins } = services(f, definitions);
  const results = await Promise.all([
    builtins.initialize(),
    services(f, definitions).builtins.initialize(),
    builtins.initialize(),
  ]);
  for (const result of results) assert.deepEqual(result.errors, []);
  const initial = await projects.list();
  assert.deepEqual(
    initial.map((p) => p.name),
    definitions.map((p) => p.name),
  );
  for (const p of initial) {
    const detail = await projects.inspect(p.id);
    assert.equal(detail.versions.length, 1);
    assert.deepEqual(detail.changedFiles, []);
    assert.equal(detail.revision, 0);
    const artifact = await projects.readArtifact(p.id, "saved");
    assert.equal(artifact.sourceRevision, 0);
    assert.match(artifact.script, /createElement/);
  }
  await services(f, definitions).builtins.initialize();
  assert.deepEqual(await projects.list(), initial);
});

test("upgrades preserve edited projects and explicit creation uses the latest template in a new workspace", async (t) => {
  const f = await fixture(t);
  const { projects, builtins } = services(f, [template()]);
  // An ordinary project with the same name cannot suppress builtin installation.
  await f.create(template().name);
  await builtins.initialize();
  const original = (await projects.list())[1];
  await projects.writeFile(
    original.id,
    "src/App.tsx",
    "export default () => <p>我的修改</p>",
    0,
  );
  const before = await projects.inspect(original.id);
  const saved = await projects.readArtifact(original.id, "saved");
  const upgraded = services(f, [template("counter", 2)]).builtins;
  await upgraded.initialize();
  assert.deepEqual(await projects.inspect(original.id), before);
  assert.deepEqual(await projects.readArtifact(original.id, "saved"), saved);
  const copy = await upgraded.create("counter");
  assert.notEqual(copy.id, original.id);
  assert.equal(
    (await projects.readFile(copy.id, "src/App.tsx")).content,
    template("counter", 2).files["src/App.tsx"],
  );
  assert.equal(
    (await projects.readFile(original.id, "src/App.tsx")).content,
    "export default () => <p>我的修改</p>",
  );
  assert.ok(copy.savedVersionId);
  assert.equal((await projects.list()).length, 3);
});

test("deletion persists across restarts and upgrades; an explicit action can add the template again", async (t) => {
  const f = await fixture(t);
  const { projects, builtins } = services(f, [template()]);
  await builtins.initialize();
  const original = (await projects.list())[0];
  // The installed app uses the same deletion wrapper, including an empty catalog.
  await f.run("workshop_remove_project", { workspaceId: original.id });
  const upgraded = services(f, [template("counter", 2)]).builtins;
  await upgraded.initialize();
  assert.deepEqual(await projects.list(), []);
  assert.equal((await journal(f)).entries.counter.status, "deleted");
  const restored = await upgraded.create("counter");
  assert.notEqual(restored.id, original.id);
  await upgraded.initialize();
  assert.equal((await projects.list()).length, 1);
});

test("workspace creation and final journal interruptions resume without duplicating or replacing V1", async (t) => {
  const f = await fixture(t);
  const originalCreate = f.workspaces.create;
  let fail = true;
  f.workspaces.create = async (input) => {
    const workspace = await originalCreate.call(f.workspaces, input);
    if (fail) {
      fail = false;
      throw new Error("模拟登记后中断");
    }
    return workspace;
  };
  const { projects, builtins } = services(f, [template()]);
  assert.equal((await builtins.initialize()).errors.length, 1);
  const interruptedId = [...f.enrolled.values()].find((w) => !w.isDefault).id;
  assert.deepEqual((await builtins.initialize()).errors, []);
  assert.equal((await projects.list())[0].id, interruptedId);
  const before = await projects.inspect(interruptedId);
  const state = await journal(f);
  state.entries.counter.status = "pending";
  state.entries.counter.projectId = null;
  await writeFile(journalPath(f), JSON.stringify(state));
  assert.deepEqual(
    (await services(f, [template()]).builtins.initialize()).errors,
    [],
  );
  assert.deepEqual(await projects.inspect(interruptedId), before);
});

test("one failed template does not prevent others or ordinary projects from loading", async (t) => {
  const f = await fixture(t);
  await f.create("原有项目");
  const broken = template("broken");
  broken.files["src/App.tsx"] =
    "import fs from 'node:fs'; export default () => null";
  const { projects, builtins } = services(f, [broken, template("working")]);
  const result = await builtins.initialize();
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /node:fs/);
  assert.deepEqual(
    (await projects.list()).map((p) => p.name),
    ["原有项目", "测试 working"],
  );
  assert.deepEqual(
    (
      await services(f, [
        template("broken"),
        template("working"),
      ]).builtins.initialize()
    ).errors,
    [],
  );
  assert.equal((await projects.list()).length, 3);
});

test("an interrupted install preserves external edits and can be explicitly deleted", async (t) => {
  const f = await fixture(t);
  const create = f.workspaces.create;
  f.workspaces.create = async (input) => {
    const workspace = await create.call(f.workspaces, input);
    await mkdir(join(workspace.path, "source/src"), { recursive: true });
    await writeFile(join(workspace.path, "source/src/App.tsx"), "我的外部内容");
    return workspace;
  };
  const { builtins } = services(f, [template()]);
  assert.match((await builtins.initialize()).errors[0], /外部修改/);
  const workspace = [...f.enrolled.values()].find((w) => !w.isDefault);
  assert.equal(
    await readFile(join(workspace.path, "source/src/App.tsx"), "utf8"),
    "我的外部内容",
  );
  await builtins.remove(workspace.id);
  assert.deepEqual((await builtins.initialize()).errors, []);
  assert.equal(f.enrolled.size, 1);
});

test("failed deletion restores the installation record", async (t) => {
  const f = await fixture(t);
  const { projects, builtins } = services(f, [template()]);
  await builtins.initialize();
  const original = (await projects.list())[0];
  f.workspaces.remove = async () => {
    throw new Error("共享工作区不能删除");
  };
  await assert.rejects(builtins.remove(original.id), /共享工作区/);
  assert.equal((await journal(f)).entries.counter.status, "installed");
  assert.equal((await projects.list()).length, 1);
});

test("an invalid journal and an active process lock leave existing content intact", async (t) => {
  const f = await fixture(t);
  const { projects, builtins } = services(f, [template()]);
  await builtins.initialize();
  const before = await projects.list();
  const source = await readFile(journalPath(f), "utf8");
  await writeFile(journalPath(f), '{"format":99,"entries":{}}');
  await assert.rejects(builtins.initialize(), /安装记录无效/);
  assert.deepEqual(await projects.list(), before);
  await writeFile(journalPath(f), source);
  const lock = join(f.root, ".workshop/.write-lock");
  await mkdir(lock);
  await writeFile(
    join(lock, "owner.json"),
    JSON.stringify({ pid: process.pid }),
  );
  await assert.rejects(builtins.initialize(), /正在保存或构建/);
  assert.equal(await readFile(journalPath(f), "utf8"), source);
});

test("build-time catalog validation packages only registered source and rejects invalid registrations and code", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "workshop-builtin-catalog-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const writeJSON = (name, value) =>
    writeFile(join(root, name), JSON.stringify(value));
  const registration = (entries) =>
    writeJSON("registry.json", { applications: entries });
  const expected = template();
  await mkdir(join(root, "counter/source"), { recursive: true });
  await writeJSON("counter/manifest.json", {
    name: expected.name,
    description: expected.description,
    version: 1,
  });
  for (const [name, content] of Object.entries(expected.files)) {
    const path = join(root, "counter/source", name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }
  await registration([]);
  assert.deepEqual(await loadBuiltins(root), []);
  await registration(["counter"]);
  assert.deepEqual(JSON.parse(JSON.stringify(await loadBuiltins(root))), [
    expected,
  ]);
  for (const entries of [["counter", "counter"], ["../counter"], ["missing"]]) {
    await registration(entries);
    await assert.rejects(loadBuiltins(root));
  }
  await registration(["counter"]);
  await writeFile(
    join(root, "counter/source/src/App.tsx"),
    "import x from 'unsupported-package'; export default () => x",
  );
  await assert.rejects(loadBuiltins(root), /不支持的依赖/);
  await writeFile(
    join(root, "counter/source/src/App.tsx"),
    expected.files["src/App.tsx"],
  );
  await symlink(
    join(root, "counter/source/src/App.tsx"),
    join(root, "counter/source/src/link.tsx"),
  );
  await assert.rejects(loadBuiltins(root), /符号链接/);
});

test("preview membership survives a restart during installation", async (t) => {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "workshop-preview-recovery-")),
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspaces = previewWorkspaces(root);
  const create = workspaces.create;
  workspaces.create = async (input) => {
    await create(input);
    throw new Error("模拟中断");
  };
  const interrupted = createBuiltinService(
    workspaces,
    createProjectService(workspaces),
    [template()],
  );
  assert.match((await interrupted.initialize()).errors[0], /模拟中断/);
  const resumedWorkspaces = previewWorkspaces(root);
  const before = (await resumedWorkspaces.list()).find((w) => !w.isDefault);
  assert.ok(before);
  const projects = createProjectService(resumedWorkspaces);
  const resumed = createBuiltinService(resumedWorkspaces, projects, [
    template(),
  ]);
  assert.deepEqual((await resumed.initialize()).errors, []);
  assert.equal((await projects.list())[0].id, before.id);
});

test("the distribution includes template source and installs without the development checkout", async (t) => {
  const source = await mkdtemp(join(runtimeRoot, "package-"));
  await cp(join(applicationRoot, "main"), join(source, "main"), {
    recursive: true,
  });
  for (const name of ["package.json", "app.config.ts", "tsconfig.json"])
    await cp(join(applicationRoot, name), join(source, name));
  await symlink(
    join(applicationRoot, "node_modules"),
    join(source, "node_modules"),
    "dir",
  );
  const definition = template("packaged");
  const catalog = join(source, "mini-apps");
  await mkdir(join(catalog, definition.id, "source"), { recursive: true });
  await writeFile(
    join(catalog, "registry.json"),
    JSON.stringify({ applications: [definition.id] }),
  );
  await writeFile(
    join(catalog, definition.id, "manifest.json"),
    JSON.stringify({
      name: definition.name,
      description: definition.description,
      version: definition.version,
    }),
  );
  for (const [name, content] of Object.entries(definition.files)) {
    const path = join(catalog, definition.id, "source", name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }
  await prepareBuiltins(source);
  const output = join(source, "dist/mewvis");
  await packApplication({
    source,
    target: "mewvis",
    outDir: output,
    quiet: true,
  });
  for (const name of ["main", "mini-apps", "node_modules"])
    await rm(join(source, name), { recursive: true, force: true });
  const { default: packaged } = await import(
    pathToFileURL(join(output, "index.js"))
  );
  const f = await fixture(t);
  const tools = new Map();
  packaged.apply({
    workspaces: f.workspaces,
    tools: { register: (tool) => tools.set(tool.name, tool) },
    skills: { register() {} },
  });
  const run = (name, args = {}) => tools.get(name).execute(args);
  assert.equal(
    (await run("workshop_list_builtins")).builtins[0].id,
    "packaged",
  );
  assert.deepEqual((await run("workshop_initialize_builtins")).errors, []);
  const [project] = (await run("workshop_list_projects")).projects;
  assert.ok(project.savedVersionId);
  assert.equal(
    (
      await run("workshop_read_file", {
        workspaceId: project.id,
        path: "src/App.tsx",
      })
    ).file.content,
    definition.files["src/App.tsx"],
  );
  assert.ok(
    (
      await run("workshop_read_build", {
        workspaceId: project.id,
        mode: "saved",
      })
    ).artifact.script,
  );
});

test("a template upgrade cannot abandon an incomplete installation or overwrite its source", async (t) => {
  const f = await fixture(t);
  const create = f.workspaces.create;
  f.workspaces.create = async (input) => {
    const workspace = await create.call(f.workspaces, input);
    throw new Error("模拟未完成安装");
  };
  await services(f, [template()]).builtins.initialize();
  f.workspaces.create = create;
  const workspace = [...f.enrolled.values()].find((w) => !w.isDefault);
  const upgraded = services(f, [template("counter", 2)]).builtins;
  assert.match((await upgraded.initialize()).errors[0], /模板已更新/);
  await assert.rejects(upgraded.create("counter"), /先删除安装未完成/);
  await upgraded.remove(workspace.id);
  const project = await upgraded.create("counter");
  assert.ok(project.savedVersionId);
  assert.equal(f.enrolled.size, 2);
});
