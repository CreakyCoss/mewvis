import type { DatabaseSync } from "node:sqlite";
import { recordId } from "../../shared/record-id.js";

/** Called inside configuration initialization's transaction, including on existing databases. */
export function seedWorkspaceDefaults(db: DatabaseSync) {
  const explicit = db
    .prepare(
      `SELECT id FROM workspace_groups WHERE is_default = 1
    ORDER BY "order" ASC, created_at ASC LIMIT 1`,
    )
    .get();
  const fallback =
    explicit ??
    db
      .prepare(
        `SELECT id FROM workspace_groups WHERE name = '默认分组'
    ORDER BY "order" ASC, created_at ASC LIMIT 1`,
      )
      .get();
  const id = fallback?.id ?? recordId(undefined);
  const now = Date.now();
  if (!fallback) {
    db.prepare(
      `INSERT INTO workspace_groups (id, name, "order", is_default, created_at, updated_at)
      VALUES (?, '默认分组', 0, 1, ?, ?)`,
    ).run(id, now, now);
  }
  db.prepare(
    "UPDATE workspace_groups SET is_default = 1, updated_at = ? WHERE id = ?",
  ).run(now, id);
  db.prepare(
    "UPDATE workspace_groups SET is_default = 0 WHERE id <> ? AND is_default = 1",
  ).run(id);
}
