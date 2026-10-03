import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  link,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { fixture } from "./fixture.mjs";
import application from "../dist/mewvis/index.js";

test("projects stay in creation order after editing an older application", async (t) => {
  const f = await fixture(t);
  const older = await f.create("先创建的应用");
  const newer = await f.create("后创建的应用");
  for (const [project, createdAt] of [
    [older, 1000],
    [newer, 2000],
  ]) {
    const path = join(
      f.enrolled.get(project.id).path,
      ".workshop/project.json",
    );
    const metadata = JSON.parse(await readFile(path, "utf8"));
    metadata.createdAt = createdAt;
    metadata.updatedAt = createdAt;
    await writeFile(path, JSON.stringify(metadata));
  }
  const before = (await f.run("workshop_list_projects")).projects;
  assert.deepEqual(
    before.map((project) => project.id),
    [older.id, newer.id],
  );
  assert.deepEqual(
    before.map((project) => project.createdAt),
    [1000, 2000],
  );
  await f.write(older, "src/order.json", '{"edited":true}');
  const after = (await f.run("workshop_list_projects")).projects;
  assert.ok(after[0].updatedAt > after[1].updatedAt);
  assert.deepEqual(
    after.map((project) => project.id),
    [older.id, newer.id],
  );
  assert.deepEqual(
    after.map((project) => project.createdAt),
    [1000, 2000],
  );
});

test("create, edit, build, save, reopen and restore a real packaged application", async (t) => {
  const f = await fixture(t);
  assert.deepEqual((await f.run("workshop_list_projects")).projects, []);
  let project = await f.create("计数器");
  assert.equal(project.sourceRoot, "source");
  assert.equal(project.entry, "src/main.tsx");
  const workspace = f.enrolled.get(project.id).path;
  const metadata = JSON.parse(
    await readFile(join(workspace, ".workshop/project.json"), "utf8"),
  );
  assert.equal(metadata.format, 2);
  assert.equal(
    "files" in metadata,
    false,
    "metadata does not store the working source",
  );
  assert.equal(
    JSON.parse(await readFile(join(workspace, "source/package.json"), "utf8"))
      .private,
    true,
  );
  assert.match(
    await readFile(join(workspace, "source/src/App.tsx"), "utf8"),
    /计数器/,
  );
  const args = { workspaceId: project.id };
  assert.deepEqual(project.files, [
    ".gitignore",
    "package.json",
    "src/App.tsx",
    "src/main.tsx",
    "src/styles.css",
    "tsconfig.json",
  ]);
  assert.equal(project.savedVersionId, null);
  assert.equal(
    (await f.run("workshop_read_build", { ...args, mode: "saved" })).artifact,
    null,
  );
  project = await f.write(
    project,
    "src/App.tsx",
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
    "src/App.tsx",
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
  project = (await f.run("workshop_create_version", args)).project;
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
    (await f.run("workshop_read_file", { ...args, path: "src/App.tsx" })).file
      .content,
    /useState/,
  );
  assert.equal(
    (await f.run("workshop_read_build", { ...args, mode: "draft" })).artifact
      .id,
    project.id,
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

const hashFiles = (files) =>
  createHash("sha256")
    .update(
      JSON.stringify(
        Object.entries(files).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
      ),
    )
    .digest("hex");
const workspaceOf = (f, project) => f.enrolled.get(project.id).path;
const sourceOf = (f, project, path) =>
  join(workspaceOf(f, project), "source", path);
async function sourceFiles(f, project) {
  return Object.fromEntries(
    await Promise.all(
      project.files.map(async (path) => [
        path,
        await readFile(sourceOf(f, project, path), "utf8"),
      ]),
    ),
  );
}

test("builds use one draft, saves overwrite the current version, and new versions require explicit creation", async (t) => {
  const f = await fixture(t);
  let project = await f.create("草稿与版本");
  const args = { workspaceId: project.id };
  const builds = join(workspaceOf(f, project), ".workshop/builds");
  const first = await f.run("workshop_build", args);
  assert.equal(first.ok, true);
  assert.equal(first.artifactId, project.id);
  const firstDraft = (
    await f.run("workshop_read_build", { ...args, mode: "draft" })
  ).artifact;
  project = await f.write(
    project,
    "src/App.tsx",
    "export default function App(){return <h1>保存前的修改</h1>}",
  );
  const second = await f.run("workshop_build", args);
  assert.equal(second.ok, true);
  assert.equal(second.artifactId, first.artifactId);
  const secondDraft = (
    await f.run("workshop_read_build", { ...args, mode: "draft" })
  ).artifact;
  assert.notEqual(secondDraft.sourceHash, firstDraft.sourceHash);
  assert.deepEqual(await readdir(builds), [`${project.id}.json`]);
  assert.equal(second.project.versions.length, 0);
  project = (await f.run("workshop_save_version", args)).project;
  const savedId = project.savedVersionId;
  assert.notEqual(savedId, project.id);
  const savedPath = join(builds, `${savedId}.json`);
  let snapshot = await readFile(savedPath, "utf8");
  const createdAt = project.versions[0].createdAt;
  assert.equal(JSON.parse(snapshot).sourceHash, secondDraft.sourceHash);
  assert.equal(
    (await f.run("workshop_save_version", args)).project.versions.length,
    1,
  );
  await f.run("workshop_build", args);
  assert.equal(
    (await f.run("workshop_save_version", args)).project.versions.length,
    1,
  );
  snapshot = await readFile(savedPath, "utf8");
  project = await f.write(
    project,
    "src/App.tsx",
    "export default function App(){return <h1>保存后的修改</h1>}",
  );
  assert.equal((await f.run("workshop_build", args)).artifactId, project.id);
  assert.deepEqual(
    (await readdir(builds)).sort(),
    [project.id, savedId].map((id) => `${id}.json`).sort(),
  );
  assert.equal(await readFile(savedPath, "utf8"), snapshot);
  assert.equal(
    (await f.run("workshop_read_build", { ...args, mode: "saved" })).artifact
      .id,
    savedId,
  );
  project = (await f.run("workshop_save_version", args)).project;
  assert.equal(project.versions.length, 1);
  assert.equal(project.savedVersionId, savedId);
  assert.equal(project.versions[0].createdAt, createdAt);
  assert.equal(project.versions[0].sourceRevision, project.revision);
  assert.notEqual(await readFile(savedPath, "utf8"), snapshot);
  snapshot = await readFile(savedPath, "utf8");
  assert.match(JSON.parse(snapshot).files["src/App.tsx"], /保存后的修改/);
  assert.equal((await readdir(builds)).length, 2);
  project = (await f.run("workshop_create_version", args)).project;
  assert.equal(project.versions.length, 2);
  assert.notEqual(project.savedVersionId, savedId);
  assert.equal(await readFile(savedPath, "utf8"), snapshot);
  const newVersionId = project.savedVersionId;
  const newVersionPath = join(builds, `${newVersionId}.json`);
  const newSnapshot = await readFile(newVersionPath, "utf8");
  assert.equal(
    JSON.parse(newSnapshot).sourceHash,
    JSON.parse(snapshot).sourceHash,
  );
  assert.equal((await readdir(builds)).length, 3);
  project = (
    await f.run("workshop_restore_version", {
      ...args,
      versionId: savedId,
      baseRevision: project.revision,
    })
  ).project;
  assert.equal(
    (await f.run("workshop_read_build", { ...args, mode: "draft" })).artifact
      .id,
    project.id,
  );
  assert.equal(project.savedVersionId, savedId);
  project = await f.write(
    project,
    "src/App.tsx",
    "export default function App(){return <h1>恢复后的修改</h1>}",
  );
  assert.equal((await f.run("workshop_build", args)).artifactId, project.id);
  assert.equal(await readFile(savedPath, "utf8"), snapshot);
  assert.equal((await readdir(builds)).length, 3);
  project = (await f.run("workshop_save_version", args)).project;
  assert.equal(project.savedVersionId, savedId);
  assert.equal(project.versions.length, 2);
  assert.deepEqual(
    project.versions.map((version) => version.id),
    [newVersionId, savedId],
  );
  assert.match(
    JSON.parse(await readFile(savedPath, "utf8")).files["src/App.tsx"],
    /恢复后的修改/,
  );
  assert.equal(await readFile(newVersionPath, "utf8"), newSnapshot);
  assert.equal((await readdir(builds)).length, 3);
});

test("external edits invalidate draft builds and reject stale saves without changing the running version", async (t) => {
  const f = await fixture(t);
  let project = await f.create("外部编辑");
  const args = { workspaceId: project.id };
  assert.equal((await f.run("workshop_build", args)).ok, true);
  project = (await f.run("workshop_save_version", args)).project;
  const saved = project.savedVersionId;
  const content = "export default()=> <h1>外部编辑器</h1>";
  await writeFile(sourceOf(f, project, "src/App.tsx"), content);
  await assert.rejects(
    f.write(project, "src/App.tsx", "stale local buffer"),
    /源码已被/,
  );
  const next = (await f.run("workshop_read_project", args)).project;
  assert.equal(next.revision, project.revision + 1);
  assert.equal(next.hasDraftBuild, false);
  assert.equal(
    await readFile(sourceOf(f, project, "src/App.tsx"), "utf8"),
    content,
  );
  assert.equal(
    (await f.run("workshop_read_build", { ...args, mode: "draft" })).artifact,
    null,
  );
  assert.equal(
    (await f.run("workshop_read_build", { ...args, mode: "saved" })).artifact
      .id,
    saved,
  );
  assert.equal((await f.run("workshop_build", args)).ok, true);
});

test("unsupported project and build formats are rejected without rewriting files", async (t) => {
  const f = await fixture(t);
  let project = await f.create("格式校验");
  const args = { workspaceId: project.id };
  assert.equal((await f.run("workshop_build", args)).ok, true);
  project = (await f.run("workshop_save_version", args)).project;
  const internal = join(workspaceOf(f, project), ".workshop");
  const sources = await sourceFiles(f, project);
  const artifactPath = join(
    internal,
    "builds",
    project.savedVersionId + ".json",
  );
  const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
  artifact.sourceLayout = 99;
  const invalidArtifact = JSON.stringify(artifact);
  await writeFile(artifactPath, invalidArtifact);
  await assert.rejects(
    f.run("workshop_read_build", { ...args, mode: "saved" }),
    /构建产物无效/,
  );
  await assert.rejects(
    f.run("workshop_restore_version", {
      ...args,
      versionId: project.savedVersionId,
      baseRevision: project.revision,
    }),
    /构建产物无效/,
  );
  assert.equal(await readFile(artifactPath, "utf8"), invalidArtifact);
  assert.deepEqual(await sourceFiles(f, project), sources);

  const metadataPath = join(internal, "project.json");
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  metadata.format = 99;
  const invalidMetadata = JSON.stringify(metadata);
  await writeFile(metadataPath, invalidMetadata);
  await assert.rejects(
    f.run("workshop_read_project", args),
    /工坊项目格式无效/,
  );
  assert.equal(await readFile(metadataPath, "utf8"), invalidMetadata);
  assert.deepEqual(await sourceFiles(f, project), sources);
});

test("source roots, nested symlinks and hard links cannot access workspace metadata or outside files", async (t) => {
  const f = await fixture(t);
  const project = await f.create("物理边界");
  const outside = join(f.root, "outside");
  await mkdir(outside);
  await writeFile(join(outside, "secret.ts"), "private data");
  const source = sourceOf(f, project, "");
  const preserved = source + "-preserved";
  await rename(source, preserved);
  await symlink(outside, source);
  await assert.rejects(
    f.run("workshop_read_project", { workspaceId: project.id }),
    /符号链接/,
  );
  await assert.rejects(f.write(project, "secret.ts", "overwrite"), /符号链接/);
  await rm(source);
  await rename(preserved, source);
  await symlink(outside, join(source, "escape"));
  await assert.rejects(
    f.write(project, "escape/secret.ts", "overwrite"),
    /符号链接/,
  );
  await rm(join(source, "escape"));
  await link(join(outside, "secret.ts"), join(source, "linked.ts"));
  await assert.rejects(
    f.run("workshop_read_project", { workspaceId: project.id }),
    /硬链接/,
  );
  assert.equal(
    await readFile(join(outside, "secret.ts"), "utf8"),
    "private data",
  );
});

test("interrupted source transactions recover all files and metadata while retaining Git and chats", async (t) => {
  const f = await fixture(t);
  const project = await f.create("事务恢复");
  const workspace = workspaceOf(f, project);
  const internal = join(workspace, ".workshop");
  const before = await sourceFiles(f, project);
  const after = {
    ...before,
    "src/App.tsx": "export default()=> <p>恢复完成</p>",
    "src/components/Message.tsx": "export default()=> <span>message</span>",
  };
  delete after["src/styles.css"];
  const metadata = JSON.parse(
    await readFile(join(internal, "project.json"), "utf8"),
  );
  const next = {
    ...metadata,
    sourceHash: hashFiles(after),
    revision: metadata.revision + 1,
  };
  await mkdir(sourceOf(f, project, ".git"));
  await writeFile(sourceOf(f, project, ".git/config"), "Git state");
  const chat = join(workspace, ".mewvis/chats/retained/messages.json");
  await mkdir(join(workspace, ".mewvis/chats/retained"), {
    recursive: true,
  });
  await writeFile(chat, "[]");
  await writeFile(
    join(internal, "source-transaction.json"),
    JSON.stringify({
      format: 1,
      baseRevision: metadata.revision,
      before,
      after,
      metadata: next,
    }),
  );
  await writeFile(sourceOf(f, project, "src/App.tsx"), after["src/App.tsx"]);
  await rm(sourceOf(f, project, "src/styles.css"));
  const reopened = (
    await f.run("workshop_read_project", { workspaceId: project.id })
  ).project;
  assert.equal(reopened.revision, next.revision);
  assert.deepEqual(await sourceFiles(f, reopened), after);
  assert.deepEqual(
    JSON.parse(await readFile(join(internal, "project.json"), "utf8")),
    next,
  );
  await assert.rejects(readFile(join(internal, "source-transaction.json")), {
    code: "ENOENT",
  });
  assert.equal(
    await readFile(sourceOf(f, project, ".git/config"), "utf8"),
    "Git state",
  );
  assert.equal(await readFile(chat, "utf8"), "[]");
});

test("transaction recovery preserves conflicting external edits instead of overwriting them", async (t) => {
  const f = await fixture(t);
  const project = await f.create("恢复冲突");
  const internal = join(workspaceOf(f, project), ".workshop");
  const before = await sourceFiles(f, project);
  const after = {
    ...before,
    "src/App.tsx": "export default()=> <p>工坊修改</p>",
  };
  const metadata = JSON.parse(
    await readFile(join(internal, "project.json"), "utf8"),
  );
  const next = {
    ...metadata,
    sourceHash: hashFiles(after),
    revision: metadata.revision + 1,
  };
  await writeFile(
    join(internal, "source-transaction.json"),
    JSON.stringify({
      format: 1,
      baseRevision: metadata.revision,
      before,
      after,
      metadata: next,
    }),
  );
  await writeFile(
    sourceOf(f, project, "src/App.tsx"),
    "external change during interruption",
  );
  await assert.rejects(
    f.run("workshop_read_project", { workspaceId: project.id }),
    /外部修改.*保留/,
  );
  assert.equal(
    await readFile(sourceOf(f, project, "src/App.tsx"), "utf8"),
    "external change during interruption",
  );
  assert.deepEqual(
    JSON.parse(await readFile(join(internal, "project.json"), "utf8")),
    metadata,
  );
});

test("project JSON participates in snapshots and compilation without executing package scripts or compiler plugins", async (t) => {
  const f = await fixture(t);
  let project = await f.create("项目配置");
  const args = { workspaceId: project.id };
  project = await f.write(project, "src/data.json", '{"title":"JSON module"}');
  project = await f.write(
    project,
    "src/App.tsx",
    "import data from './data.json';export default()=> <h1>{data.title}</h1>",
  );
  project = await f.write(
    project,
    "package.json",
    JSON.stringify({
      private: true,
      scripts: { build: "node -e 'globalThis.__workshopPackageExecuted=true'" },
    }),
  );
  assert.equal((await f.run("workshop_build", args)).ok, true);
  assert.equal(globalThis.__workshopPackageExecuted, undefined);
  await f.run("workshop_save_version", args);
  project = await f.write(
    project,
    "tsconfig.json",
    '{"extends":"../.workshop/project.json"}',
  );
  const invalid = await f.run("workshop_build", args);
  assert.equal(invalid.ok, false);
  assert.equal(invalid.diagnostics[0].file, "tsconfig.json");
  assert.ok(
    (await f.run("workshop_read_build", { ...args, mode: "saved" })).artifact,
  );
  for (const path of ["package.json", "tsconfig.json", "src/main.tsx"])
    await assert.rejects(
      f.run("workshop_delete_file", {
        ...args,
        path,
        baseRevision: project.revision,
      }),
      /不能删除/,
    );
});

test("CAS and filesystem locking prevent concurrent or stale source overwrites", async (t) => {
  const f = await fixture(t);
  const project = await f.create("并发");
  const changes = await Promise.allSettled([
    f.write(project, "src/App.tsx", "export default()=> <p>A</p>"),
    f.write(project, "src/App.tsx", "export default()=> <p>B</p>"),
  ]);
  assert.equal(
    changes.filter((value) => value.status === "fulfilled").length,
    1,
  );
  await assert.rejects(f.write(project, "src/App.tsx", "old"), /源码已被/);
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
    "src/App.tsx",
    "globalThis.__workshopCompilerExecuted=true;export default()=> <h1>safe</h1>",
  );
  assert.equal((await f.run("workshop_build", args)).ok, true);
  assert.equal(globalThis.__workshopCompilerExecuted, undefined);
  await f.run("workshop_save_version", args);
  for (const source of [
    "import fs from 'node:fs';export default()=>null",
    "import value from '../../outside';export default()=>null",
    "export default function App( {",
  ]) {
    project = await f.write(project, "src/App.tsx", source);
    const result = await f.run("workshop_build", args);
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0].file, "src/App.tsx");
    assert.ok(result.diagnostics[0].line > 0);
    assert.ok(
      (await f.run("workshop_read_build", { ...args, mode: "saved" })).artifact,
      "failed builds keep the saved app",
    );
  }
  project = await f.write(
    project,
    "src/App.tsx",
    "import Card from './components/Card';export default()=> <Card />",
  );
  project = await f.write(
    project,
    "src/components/Card.tsx",
    "export default()=> <p>Local</p>",
  );
  assert.equal((await f.run("workshop_build", args)).ok, true);
  project = await f.write(
    project,
    "src/styles.css",
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
    ".mewvis/marker.ts",
    "folder/../test.ts",
    "../.workshop/project.json",
    "node_modules/escape.ts",
    "dist/escape.ts",
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
      path: "src/main.tsx",
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
      join(process.cwd(), ".mewvis/workspace.json"),
      JSON.stringify({ id: project.id, applications: ["@mewvis/other"] }),
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
    f.write(project, "src/App.tsx", "export default()=>null"),
    /正在保存/,
  );
  await writeFile(
    join(lock, "owner.json"),
    JSON.stringify({ pid: 2147483647 }),
  );
  project = await f.write(project, "src/App.tsx", "export default()=>null");
  assert.equal(project.revision, 1);
  await assert.rejects(readFile(join(lock, "owner.json")), { code: "ENOENT" });
});
