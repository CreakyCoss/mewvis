import type { ConfigDatabase } from "../../storage/config/database.js";
import type { Workspace, WorkspaceInput } from "./types.js";
import { recordId } from "../../shared/record-id.js";
import { ServiceError } from "../../shared/validation.js";

const columns = `id, name, description, path, is_pinned AS isPinned, "order", group_id AS groupId,
  created_at AS createdAt, updated_at AS updatedAt`;

export class WorkspaceRepository {
  constructor(private readonly database: ConfigDatabase) {}

  private map(row: Record<string, unknown>, defaultPath: string): Workspace {
    return {
      ...row,
      isPinned: row.isPinned === 1,
      isDefault: row.path === defaultPath,
    } as unknown as Workspace;
  }

  get(id: string, defaultPath: string): Workspace {
    const row = this.database.connection
      .prepare(`SELECT ${columns} FROM workspaces WHERE id = ?`)
      .get(id);
    if (!row)
      throw new ServiceError(404, "WORKSPACE_NOT_FOUND", "工作区不存在");
    return this.map(row, defaultPath);
  }

  private groupId(requested: string | null): string {
    const db = this.database.connection;
    const requestedGroup = requested
      ? db
          .prepare("SELECT id FROM workspace_groups WHERE id = ?")
          .get(requested)
      : undefined;
    const fallback =
      requestedGroup ??
      db
        .prepare(
          `SELECT id FROM workspace_groups WHERE is_default = 1
      ORDER BY "order" ASC, created_at ASC LIMIT 1`,
        )
        .get();
    if (!fallback) throw new Error("默认分组不存在");
    return String(fallback.id);
  }

  private nextOrder(groupId: string): number {
    const row = this.database.connection
      .prepare(
        `SELECT MAX("order") AS maximum FROM workspaces WHERE group_id IS ?`,
      )
      .get(groupId)!;
    return Number(row.maximum ?? -1) + 1;
  }

  private insert(
    input: WorkspaceInput,
    defaultPath: string,
    pinned: boolean,
  ): Workspace {
    const db = this.database.connection;
    const id = recordId(undefined);
    const now = Date.now();
    const groupId = this.groupId(input.groupId);
    db.prepare(
      `INSERT INTO workspaces (id, name, description, path, is_pinned, "order", group_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.name,
      input.description,
      input.path,
      Number(pinned),
      this.nextOrder(groupId),
      groupId,
      now,
      now,
    );
    return this.get(id, defaultPath);
  }

  list(defaultPath: string): Workspace[] {
    return this.database.transaction(() => {
      const db = this.database.connection;
      if (
        !db
          .prepare("SELECT id FROM workspaces WHERE path = ? LIMIT 1")
          .get(defaultPath)
      ) {
        this.insert(
          {
            name: "默认工作区",
            description: "用于未绑定具体工作区的会话",
            path: defaultPath,
            groupId: null,
          },
          defaultPath,
          true,
        );
      }
      return db
        .prepare(
          `SELECT ${columns} FROM workspaces ORDER BY is_pinned DESC, "order" ASC, created_at DESC, rowid DESC`,
        )
        .all()
        .map((row) => this.map(row, defaultPath));
    });
  }

  create(input: WorkspaceInput, defaultPath: string): Workspace {
    return this.database.transaction(() =>
      this.insert(input, defaultPath, false),
    );
  }

  assertEditable(id: string, defaultPath: string): Workspace {
    const current = this.get(id, defaultPath);
    if (current.isDefault)
      throw new ServiceError(
        409,
        "DEFAULT_WORKSPACE_MANAGED",
        "默认工作区由系统管理，不能编辑或删除",
      );
    return current;
  }

  update(id: string, input: WorkspaceInput, defaultPath: string): Workspace {
    return this.database.transaction(() => {
      // Recheck after asynchronous filesystem preparation, as another request may have deleted this row.
      const current = this.assertEditable(id, defaultPath);
      const groupId = this.groupId(input.groupId);
      const order =
        current.groupId === groupId ? current.order : this.nextOrder(groupId);
      this.database.connection
        .prepare(
          `UPDATE workspaces SET name = ?, description = ?, path = ?,
        "order" = ?, group_id = ?, updated_at = ? WHERE id = ?`,
        )
        .run(
          input.name,
          input.description,
          input.path,
          order,
          groupId,
          Date.now(),
          id,
        );
      return this.get(id, defaultPath);
    });
  }

  delete(id: string, defaultPath: string): null {
    return this.database.transaction(() => {
      this.assertEditable(id, defaultPath);
      this.database.connection
        .prepare("DELETE FROM workspaces WHERE id = ?")
        .run(id);
      return null;
    });
  }
}
