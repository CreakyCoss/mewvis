import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadRegistrations } from "./registrations.mjs";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "isle-registrations-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sourceRoot = join(root, "sources");
  const configPath = join(root, "registry.json");
  await mkdir(sourceRoot);
  for (const name of ["alpha", "beta", "unlisted"])
    await mkdir(join(sourceRoot, name));
  const save = (value) => writeFile(configPath, JSON.stringify(value));
  return { root, sourceRoot, configPath, save };
}

test("only configured directories are registered, in configured order", async (t) => {
  const { sourceRoot, configPath, save } = await fixture(t);
  await save({ applications: ["beta", "alpha"] });
  assert.deepEqual(
    await loadRegistrations(configPath, "applications", sourceRoot),
    [
      { name: "beta", sourceRoot: join(sourceRoot, "beta") },
      { name: "alpha", sourceRoot: join(sourceRoot, "alpha") },
    ],
  );
  await save({ applications: [] });
  assert.deepEqual(
    await loadRegistrations(configPath, "applications", sourceRoot),
    [],
  );
});

test("invalid, duplicate, and missing registrations fail", async (t) => {
  const { sourceRoot, configPath, save } = await fixture(t);
  for (const [value, expected] of [
    [{ wrongKey: ["alpha"] }, /必须只包含 applications 数组/],
    [{ applications: ["alpha", "alpha"] }, /重复目录名：alpha/],
    [{ applications: ["../alpha"] }, /无效目录名/],
    [{ applications: ["missing"] }, /注册的目录不存在/],
  ]) {
    await save(value);
    await assert.rejects(
      loadRegistrations(configPath, "applications", sourceRoot),
      expected,
    );
  }
});

test("registered symlinks are rejected", async (t) => {
  const { sourceRoot, configPath, save } = await fixture(t);
  await symlink(join(sourceRoot, "alpha"), join(sourceRoot, "linked"));
  await save({ extensions: ["linked"] });
  await assert.rejects(
    loadRegistrations(configPath, "extensions", sourceRoot),
    /注册项必须是普通目录/,
  );
  await rm(join(sourceRoot, "linked"));
  await writeFile(configPath, "{");
  await assert.rejects(
    loadRegistrations(configPath, "extensions", sourceRoot),
    /无法读取注册配置/,
  );
});
