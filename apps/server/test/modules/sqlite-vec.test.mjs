import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { sqliteVecPath } from "../../dist/modules/knowledge/storage/extension.js";
import { windowsMachine } from "../../../client/scripts/packaging/build-sqlite-vec.mjs";

test("Windows ARM64 resolves the bundled DLL from resources or the development runtime", () => {
  const resources = join("runtime with spaces", "resources");
  assert.equal(
    sqliteVecPath("win32", "arm64", resources),
    join(resources, "server/native/vec0.dll"),
  );
  assert.equal(
    sqliteVecPath("win32", "arm64"),
    join(
      process.env.MEWVIS_SERVER_RESOURCES ??
        fileURLToPath(new URL("../../../agent-runtime/dist/", import.meta.url)),
      "server/native/vec0.dll",
    ),
  );
});

test("the selected sqlite-vec extension loads in Node and supports search and long metadata deletion", () => {
  const db = new DatabaseSync(":memory:", { allowExtension: true });
  try {
    db.loadExtension(sqliteVecPath());
    db.enableLoadExtension(false);
    assert.equal(
      db.prepare("SELECT vec_version() AS version").get().version,
      "v0.1.9",
    );
    db.exec(
      "CREATE VIRTUAL TABLE vectors USING vec0(source_id TEXT, embedding float[2] distance_metric=cosine)",
    );
    const insert = db.prepare(
      "INSERT INTO vectors(rowid,source_id,embedding) VALUES(?,?,?)",
    );
    insert.run(1n, "source-with-long-metadata", "[1,0]");
    insert.run(2n, "another-long-source-id", "[0,1]");
    const search = db.prepare(
      "SELECT rowid FROM vectors WHERE embedding MATCH ? AND k=1",
    );
    assert.equal(search.get("[1,0]").rowid, 1);
    db.prepare("DELETE FROM vectors WHERE rowid=?").run(1n);
    assert.equal(search.get("[1,0]").rowid, 2);
  } finally {
    db.close();
  }
});

test("native artifact validation distinguishes ARM64, x64 and invalid PE files", () => {
  const pe = Buffer.alloc(256);
  pe.write("MZ");
  pe.writeUInt32LE(128, 0x3c);
  pe.write("PE\0\0", 128);
  pe.writeUInt16LE(0xaa64, 132);
  assert.equal(windowsMachine(pe), 0xaa64);
  pe.writeUInt16LE(0x8664, 132);
  assert.notEqual(windowsMachine(pe), 0xaa64);
  pe.writeUInt32LE(0xffffffff, 0x3c);
  assert.equal(windowsMachine(pe), null);
  assert.equal(windowsMachine(Buffer.from("invalid")), null);
});
