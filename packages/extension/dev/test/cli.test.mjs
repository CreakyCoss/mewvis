import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mkdtemp,
  readFile,
  writeFile,
  rm,
  mkdir,
  symlink,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { buildExtensionPackage } from "../index.mjs";

const exec = promisify(execFile);
const cliPath = fileURLToPath(new URL("../cli.mjs", import.meta.url));
const cli = async (...args) =>
  JSON.parse((await exec(process.execPath, [cliPath, ...args])).stdout);

test("build optional browser module separately, without Node bootstrap or host imports", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "mewvis-ui-build-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const project = join(root, "plugin");
  await cli("create", project, "--id", "test.ui");
  const pkg = JSON.parse(await readFile(join(project, "package.json"), "utf8"));
  pkg["mewvis.extension"].modules.ui = {
    entry: "./ui.js",
    contributions: [
      {
        id: "stats",
        type: "sidebar",
        icon: "chart",
        view: { id: "overview" },
        slot: "session.sidebar",
        title: "Stats",
      },
    ],
  };
  await writeFile(join(project, "package.json"), JSON.stringify(pkg));
  await writeFile(
    join(project, "src/ui.ts"),
    `import { defineUIExtension } from '@mewvis/extension-sdk/ui';
     export default defineUIExtension({id:'test.ui',apiVersion:1,mount(root){root.textContent='UI'}});`,
  );
  let built = await buildExtensionPackage(project);
  const source = await readFile(built.modules.ui.entry, "utf8");
  assert.doesNotMatch(source, /node:module|createRequire/);
  assert.ok(built.modules.agent);
  delete pkg["mewvis.extension"].modules.agent;
  await writeFile(join(project, "package.json"), JSON.stringify(pkg));
  await rm(join(project, "src/index.ts"));
  built = await buildExtensionPackage(project);
  assert.equal(built.modules.agent, undefined);
  await assert.rejects(readFile(join(built.root, "index.js")), {
    code: "ENOENT",
  });
  await writeFile(
    join(project, "src/ui.ts"),
    `import {readFile} from 'node:fs'; console.log(readFile);`,
  );
  await assert.rejects(() => buildExtensionPackage(project), /node:fs/);
});

test("real CLI: scaffold → bundle → validate → archive → registration and enablement", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "mewvis-plugin-cli-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const project = join(root, "hello"),
    settings = join(root, "settings.json");
  await cli("create", project, "--id", "test.hello");
  await assert.rejects(
    () => cli("create", project, "--id", "test.hello"),
    /EEXIST/,
  );
  await writeFile(join(project, ".env"), "EXCLUDED_SECRET=not-a-real-secret");
  const pkg = JSON.parse(await readFile(join(project, "package.json"), "utf8"));
  pkg.scripts.prepack = "exit 99";
  await writeFile(join(project, "package.json"), JSON.stringify(pkg));
  const artifact = await cli("build", project);
  await cli("build", project); // supported rebuild of the conventional output
  assert.equal(
    (await cli("validate", artifact.root)).manifest.id,
    "test.hello",
  );
  assert.equal(artifact.packageJson.scripts, undefined);
  const archive = await cli("pack", project);
  const entries = (await exec("tar", ["-tzf", archive])).stdout;
  assert.match(entries, /package\/index.js/);
  assert.doesNotMatch(entries, /\.env|node_modules|src\//);
  const unpack = join(root, "unpack");
  await mkdir(unpack);
  await exec("tar", ["-xzf", archive, "-C", unpack]);
  await cli("add", join(unpack, "package"), "--settings", settings);
  await cli("disable", "test.hello", "--settings", settings);
  assert.equal((await cli("list", "--settings", settings))[0].enabled, false);
  await cli("enable", "test.hello", "--settings", settings);
  await cli("remove", "test.hello", "--settings", settings);
  assert.deepEqual(await cli("list", "--settings", settings), []);
  assert.ok(await readFile(join(unpack, "package/index.js")));
});

test("build does not evaluate code, rejects Pi coupling and preserves unrelated output", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "mewvis-plugin-boundary-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const project = join(root, "project");
  await cli("create", project, "--id", "test.build");
  await writeFile(
    join(project, "src/index.ts"),
    "throw new Error('must not execute while building'); export default {};\n",
  );
  await buildExtensionPackage(project);
  const other = join(root, "other");
  await mkdir(other);
  await writeFile(join(other, "keep"), "preserved");
  await assert.rejects(
    () => buildExtensionPackage(project, { outputDir: other }),
    /已存在/,
  );
  assert.equal(await readFile(join(other, "keep"), "utf8"), "preserved");
  await rm(join(project, "dist"), { recursive: true });
  await symlink(other, join(project, "dist"));
  await assert.rejects(() => buildExtensionPackage(project), /符号链接/);
  await writeFile(
    join(project, "src/index.ts"),
    "import { x } from '@earendil-works/pi-coding-agent'; console.log(x);",
  );
  await assert.rejects(
    () =>
      buildExtensionPackage(project, { outputDir: join(root, "forbidden") }),
    /不能依赖/,
  );
});

test("plain text contributions build without source files or a runtime entry", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "mewvis-text-ui-build-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const project = join(root, "plugin");
  await cli("create", project, "--id", "test.text");
  const pkg = JSON.parse(await readFile(join(project, "package.json"), "utf8"));
  pkg["mewvis.extension"].modules = {
    ui: {
      contributions: [
        { id: "ready", slot: "session.status", type: "text", text: "Ready" },
      ],
    },
  };
  await writeFile(join(project, "package.json"), JSON.stringify(pkg));
  await rm(join(project, "src"), { recursive: true });
  const built = await buildExtensionPackage(project);
  assert.equal(built.modules.ui.entry, undefined);
  assert.deepEqual(
    built.manifest.modules.ui.contributions,
    pkg["mewvis.extension"].modules.ui.contributions,
  );
  await assert.rejects(readFile(join(built.root, "ui.js")), { code: "ENOENT" });
});
