import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { leaseDataDirectory } from "../../dist/storage/lease.js";
const execute = promisify(execFile);
const cli = fileURLToPath(
  new URL("../../dist/maintenance.js", import.meta.url),
);
test("Node maintenance CLI preserves custom database paths, backups and the running backend lock", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "mewvis-maintenance-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, "custom.sqlite");
  const run = (...args) => execute(process.execPath, [cli, ...args, path]);
  let result = await run();
  assert.equal(JSON.parse(result.stdout).configDbPath, path);
  const original = new DatabaseSync(path);
  original.exec(
    "CREATE TABLE legacy_notes(text TEXT); INSERT INTO legacy_notes VALUES('preserve me')",
  );
  original.close();
  const release = leaseDataDirectory(root);
  try {
    await assert.rejects(run("--rebuild"), /正在|使用|lock|占用/);
  } finally {
    release();
  }
  result = await run("--rebuild");
  const report = JSON.parse(result.stdout).lastRebuild;
  assert.ok(report.skippedTables.includes("legacy_notes"));
  const backup = (await readdir(root)).find((name) =>
    name.startsWith("custom.sqlite.backup-"),
  );
  assert.ok(backup);
  const old = new DatabaseSync(join(root, backup), { readOnly: true });
  assert.equal(
    old.prepare("SELECT text FROM legacy_notes").get().text,
    "preserve me",
  );
  old.close();
  await assert.rejects(run("--rebuild", "--rebuild-on-error"), /只能指定/);
});
