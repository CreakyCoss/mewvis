import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import application from "../dist/isle/index.js";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "isle-workshop-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const base = {
    id: randomUUID(),
    name: "默认工作区",
    path: root,
    isDefault: true,
  };
  const enrolled = new Map([[base.id, base]]);
  const tools = new Map();
  const skills = new Map();
  const workspaces = {
    async list() {
      return [...enrolled.values()];
    },
    async get(id) {
      if (!enrolled.has(id)) throw new Error("项目未登记");
      return enrolled.get(id);
    },
    async create(input) {
      assert.equal(input.exclusive, true);
      await mkdir(input.path);
      const item = {
        id: randomUUID(),
        name: input.name,
        path: input.path,
        isDefault: false,
      };
      await mkdir(join(input.path, ".isle"));
      await writeFile(
        join(input.path, ".isle/workspace.json"),
        JSON.stringify({
          version: 1,
          id: item.id,
          applications: ["@isle/app-workshop"],
        }),
      );
      enrolled.set(item.id, item);
      return item;
    },
    async remove({ id, deleteContent }) {
      const item = await this.get(id);
      assert.equal(item.isDefault, false);
      enrolled.delete(id);
      if (deleteContent) await rm(item.path, { recursive: true, force: true });
    },
  };
  application.apply({
    tools: {
      register(tool) {
        tools.set(tool.name, tool);
      },
    },
    skills: {
      register(skill) {
        skills.set(skill.name, skill);
      },
    },
    workspaces,
  });
  const run = (name, args = {}) => tools.get(name).execute(args);
  const create = async (name) =>
    (await run("workshop_create_project", { name, description: "测试应用" }))
      .project;
  const write = async (project, path, content) =>
    (
      await run("workshop_write_file", {
        workspaceId: project.id,
        path,
        content,
        baseRevision: project.revision,
      })
    ).project;
  return { root, tools, skills, enrolled, workspaces, run, create, write };
}

test("create, edit, build, save, reopen and restore a real packaged application", async (t) => {
  const f = await fixture(t);
  assert.deepEqual((await f.run("workshop_list_projects")).projects, []);
  let project = await f.create("计数器");
  const args = { workspaceId: project.id };
  assert.deepEqual(project.files, ["App.tsx", "main.tsx", "styles.css"]);
  assert.equal(project.savedVersionId, null);
  assert.equal(
    (await f.run("workshop_read_build", { ...args, mode: "saved" })).artifact,
    null,
  );
  project = await f.write(
    project,
    "App.tsx",
    "import {useState} from 'react';export default function App(){const [n,setN]=useState(0);return <button onClick={()=>setN(n+1)}>{n}</button>}",
  );
  const first = await f.run("workshop_build", args);
  assert.equal(first.ok, true);
  assert.equal(first.project.savedVersionId, null);
  const built = (await f.run("workshop_read_build", { ...args, mode: "draft" }))
    .artifact;
  assert.match(built.script, /main\.tsx/);
  assert.ok(built.script.length > 100_000);
  assert.equal(
    "files" in built,
    false,
    "view transfer contains no source snapshot",
  );
  project = (await f.run("workshop_save_version", args)).project;
  const firstVersion = project.savedVersionId;
  project = await f.write(
    project,
    "App.tsx",
    "export default function App(){return <h1>第二版</h1>}",
  );
  assert.equal(
    (await f.run("workshop_read_build", { ...args, mode: "draft" })).artifact,
    null,
  );
  assert.equal(
    (await f.run("workshop_read_build", { ...args, mode: "saved" })).artifact
      .id,
    firstVersion,
    "draft editing never changes the running version",
  );
  await assert.rejects(f.run("workshop_save_version", args), /先构建/);
  assert.equal((await f.run("workshop_build", args)).ok, true);
  project = (await f.run("workshop_save_version", args)).project;
  assert.equal(project.versions.length, 2);
  project = (
    await f.run("workshop_restore_version", {
      ...args,
      versionId: firstVersion,
      baseRevision: project.revision,
    })
  ).project;
  assert.equal(project.savedVersionId, firstVersion);
  assert.match(
    (await f.run("workshop_read_file", { ...args, path: "App.tsx" })).file
      .content,
    /useState/,
  );
  assert.equal(
    (await f.run("workshop_read_build", { ...args, mode: "draft" })).artifact
      .id,
    firstVersion,
  );
  const second = new Map();
  application.apply({
    tools: {
      register(tool) {
        second.set(tool.name, tool);
      },
    },
    skills: { register() {} },
    workspaces: f.workspaces,
  });
  assert.equal(
    (await second.get("workshop_read_project").execute(args)).project
      .savedVersionId,
    firstVersion,
    "project state survives a new application host",
  );
  assert.equal(f.skills.has("workshop-authoring"), true);
});

test("CAS and filesystem locking prevent concurrent or stale source overwrites", async (t) => {
  const f = await fixture(t);
  const project = await f.create("并发");
  const changes = await Promise.allSettled([
    f.write(project, "App.tsx", "export default()=> <p>A</p>"),
    f.write(project, "App.tsx", "export default()=> <p>B</p>"),
  ]);
  assert.equal(
    changes.filter((value) => value.status === "fulfilled").length,
    1,
  );
  await assert.rejects(f.write(project, "App.tsx", "old"), /源码已被/);
  assert.equal(
    (await f.run("workshop_read_project", { workspaceId: project.id })).project
      .revision,
    1,
  );
});

test("compilation rejects external imports and reports syntax locations without executing code", async (t) => {
  const f = await fixture(t);
  let project = await f.create("编译检查");
  const args = { workspaceId: project.id };
  project = await f.write(
    project,
    "App.tsx",
    "globalThis.__workshopCompilerExecuted=true;export default()=> <h1>safe</h1>",
  );
  assert.equal((await f.run("workshop_build", args)).ok, true);
  assert.equal(globalThis.__workshopCompilerExecuted, undefined);
  await f.run("workshop_save_version", args);
  for (const source of [
    "import fs from 'node:fs';export default()=>null",
    "import value from '../outside';export default()=>null",
    "export default function App( {",
  ]) {
    project = await f.write(project, "App.tsx", source);
    const result = await f.run("workshop_build", args);
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0].file, "App.tsx");
    assert.ok(result.diagnostics[0].line > 0);
    assert.ok(
      (await f.run("workshop_read_build", { ...args, mode: "saved" })).artifact,
      "failed builds keep the saved app",
    );
  }
  project = await f.write(
    project,
    "App.tsx",
    "import Card from './components/Card';export default()=> <Card />",
  );
  project = await f.write(
    project,
    "components/Card.tsx",
    "export default()=> <p>Local</p>",
  );
  assert.equal((await f.run("workshop_build", args)).ok, true);
  project = await f.write(
    project,
    "styles.css",
    "@import 'https://example.com/style.css';",
  );
  assert.equal((await f.run("workshop_build", args)).ok, false);
});

test("source paths, project identity, payload sizes and symlinked files are checked", async (t) => {
  const f = await fixture(t);
  const project = await f.create("边界");
  const args = { workspaceId: project.id };
  await assert.rejects(
    f.run("workshop_read_project", { workspaceId: randomUUID() }),
    /未登记/,
  );
  await assert.rejects(
    f.run("workshop_read_project", { ...args, workspacePath: "/tmp" }),
    /参数/,
  );
  for (const path of [
    "../outside.ts",
    "/tmp/code.ts",
    ".isle/marker.ts",
    "folder/../test.ts",
    "package.json",
    "a\\b.ts",
  ])
    await assert.rejects(f.write(project, path, ""), /文件名/);
  await assert.rejects(
    f.write(project, "large.ts", "中".repeat(50_000)),
    /128 KiB/,
  );
  await assert.rejects(
    f.run("workshop_delete_file", {
      ...args,
      path: "main.tsx",
      baseRevision: project.revision,
    }),
    /不能删除/,
  );
  const internal = join(f.enrolled.get(project.id).path, ".workshop");
  await rm(join(internal, "project.json"));
  await symlink(join(f.root, "outside.json"), join(internal, "project.json"));
  await writeFile(join(f.root, "outside.json"), "{}");
  await assert.rejects(f.run("workshop_read_project", args));
  assert.equal(await readFile(join(f.root, "outside.json"), "utf8"), "{}");
});

test("Pi worker fallback is bound to current authenticated workspace membership", async (t) => {
  const f = await fixture(t);
  const project = await f.create("Agent");
  const agent = new Map();
  application.apply({
    tools: {
      register(tool) {
        agent.set(tool.name, tool);
      },
    },
    skills: { register() {} },
    workspaces: {
      async get() {
        throw Object.assign(new Error("没有桌面连接"), {
          code: "CAPABILITY_UNAVAILABLE",
        });
      },
    },
  });
  const previous = process.cwd();
  process.chdir(f.enrolled.get(project.id).path);
  try {
    assert.equal(
      (
        await agent
          .get("workshop_read_project")
          .execute({ workspaceId: project.id })
      ).project.name,
      "Agent",
    );
    await assert.rejects(
      agent.get("workshop_read_project").execute({ workspaceId: randomUUID() }),
      /未登记/,
    );
    await writeFile(
      join(process.cwd(), ".isle/workspace.json"),
      JSON.stringify({ id: project.id, applications: ["@isle/other"] }),
    );
    await assert.rejects(
      agent.get("workshop_read_project").execute({ workspaceId: project.id }),
      /未登记/,
    );
  } finally {
    process.chdir(previous);
  }
});

test("project removal deletes only its registered directory and preserves siblings", async (t) => {
  const f = await fixture(t);
  const first = await f.create("删除");
  const second = await f.create("保留");
  const path = f.enrolled.get(first.id).path;
  await f.run("workshop_remove_project", { workspaceId: first.id });
  assert.equal(f.enrolled.has(first.id), false);
  await assert.rejects(readFile(join(path, ".workshop/project.json")), {
    code: "ENOENT",
  });
  assert.equal(
    (await f.run("workshop_read_project", { workspaceId: second.id })).project
      .name,
    "保留",
  );
});

test("a crashed owner lock is reclaimed but a live owner is never displaced", async (t) => {
  const f = await fixture(t);
  let project = await f.create("恢复锁");
  const lock = join(f.enrolled.get(project.id).path, ".workshop/.write-lock");
  await mkdir(lock);
  await writeFile(
    join(lock, "owner.json"),
    JSON.stringify({ pid: process.pid }),
  );
  await assert.rejects(
    f.write(project, "App.tsx", "export default()=>null"),
    /正在保存/,
  );
  await writeFile(
    join(lock, "owner.json"),
    JSON.stringify({ pid: 2147483647 }),
  );
  project = await f.write(project, "App.tsx", "export default()=>null");
  assert.equal(project.revision, 1);
  await assert.rejects(readFile(join(lock, "owner.json")), { code: "ENOENT" });
});
