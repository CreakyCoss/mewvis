import * as fs from "node:fs/promises";
import { join, dirname } from "node:path";
import type { ConfigDatabase } from "../../storage/config/database.js";
import { normalizeWorkspacePath } from "../../storage/workspace.js";
import {
  nonempty,
  ServiceError,
  type JsonObject,
  invalid,
} from "../../shared/validation.js";
import { recordId } from "../../shared/record-id.js";
import {
  root,
  exists,
  safePath,
} from "../../infrastructure/filesystem/paths.js";

import { Serial } from "../../shared/serial.js";
export class Stories {
  private serial = new Serial();
  constructor(private database: ConfigDatabase) {}
  private columns =
    "id, name, workspace_path AS workspacePath, created_at AS createdAt, updated_at AS updatedAt";
  list() {
    return this.database.connection
      .prepare(
        `SELECT ${this.columns} FROM stories ORDER BY updated_at DESC, created_at DESC`,
      )
      .all();
  }
  get(id: string) {
    const record = this.database.connection
      .prepare(`SELECT ${this.columns} FROM stories WHERE id=?`)
      .get(id);
    if (!record)
      throw new ServiceError(404, "STORY_NOT_FOUND", "故事记录不存在");
    return record;
  }
  async create(i: JsonObject, importing = false) {
    return this.serial.run(async () => {
      const name = nonempty(i.name, "name");
      let path: string;
      if (importing) {
        path = await root(i.workspacePath);
        if (
          !(
            await fs.stat(await safePath(path, "story/.isle-claw/project.json"))
          ).isFile()
        )
          invalid("所选目录缺少 story/.isle-claw/project.json");
      } else {
        const parent = await normalizeWorkspacePath(
          nonempty(i.workspacePath, "workspacePath"),
        );
        await fs.mkdir(parent, { recursive: true });
        const leaf = name
          .replace(/[\x00-\x1f\x7f/\\:*?"<>|]+/g, "-")
          .replace(/^[. -]+|[. -]+$/g, "")
          .trim();
        if (!leaf) invalid("故事目录名不能为空");
        path = join(await fs.realpath(parent), leaf);
        await fs.mkdir(path);
      }
      const id = recordId(undefined),
        now = Date.now();
      this.database.connection
        .prepare(
          "INSERT INTO stories (id,name,workspace_path,created_at,updated_at) VALUES (?, ?, ?, ?, ?)",
        )
        .run(id, name, path, now, now);
      return this.get(id);
    });
  }
  update(i: JsonObject) {
    const id = nonempty(i.id, "id");
    this.get(id);
    this.database.connection
      .prepare("UPDATE stories SET name=?, updated_at=? WHERE id=?")
      .run(nonempty(i.name, "name"), Date.now(), id);
    return this.get(id);
  }
  async remove(i: JsonObject) {
    return this.serial.run(async () => {
      const id = nonempty(i.id, "id");
      const record = this.get(id);
      if (i.deleteContent != null && typeof i.deleteContent !== "boolean")
        invalid("deleteContent 必须是布尔值");
      if (i.deleteContent && (await exists(String(record.workspacePath)))) {
        const path = await fs.realpath(String(record.workspacePath));
        if (dirname(path) === path) invalid("不能删除文件系统根目录");
        await fs.rm(path, { recursive: true });
      }
      this.database.connection
        .prepare("DELETE FROM stories WHERE id=?")
        .run(id);
      return null;
    });
  }
  commands() {
    return {
      list_story_records: () => this.list(),
      create_story_record: (i: JsonObject) => this.create(i),
      import_story_record: (i: JsonObject) => this.create(i, true),
      update_story_record: (i: JsonObject) => this.update(i),
      delete_story_record: (i: JsonObject) => this.remove(i),
    };
  }
}
