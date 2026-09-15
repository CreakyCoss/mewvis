import { DatabaseSync } from "node:sqlite";
import {
  existsSync,
  mkdtempSync,
  renameSync,
  rmSync,
  lstatSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { ConfigDatabase } from "../../storage/config/database.js";
import { root, safePath } from "../../infrastructure/filesystem/paths.js";
import { configTables } from "../../storage/config/schema.js";
import { ServiceError, type JsonObject } from "../../shared/validation.js";

const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"';
export class Databases {
  private last: any = null;
  constructor(private config: ConfigDatabase) {}
  status() {
    return {
      configDbPath: this.config.path,
      setupError: this.config.setupError,
      canRebuild: true,
      lastRebuild: this.last,
    };
  }
  private rebuild(path: string, config: boolean) {
    const report = {
      restoredTables: [] as string[],
      skippedTables: [] as string[],
      restoredRows: 0,
      warnings: [] as string[],
    };
    const tables: any[] = [];
    const knownTables = new Set<string>(
      config ? configTables.map((t) => t.name) : [],
    );
    for (const suffix of ["", "-wal", "-shm", "-journal"])
      if (existsSync(path + suffix)) {
        const stat = lstatSync(path + suffix);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink > 1)
          throw new ServiceError(
            400,
            "INVALID_DATABASE",
            "数据库必须是独立的普通文件",
          );
      }
    let old: DatabaseSync | undefined;
    try {
      if (existsSync(path)) {
        old = new DatabaseSync(path, { readOnly: true });
        for (const { name } of old
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
          )
          .all()) {
          const columns = old
            .prepare(`PRAGMA table_info(${quote(String(name))})`)
            .all()
            .map((c) => String(c.name));
          tables.push({
            name: String(name),
            columns,
            rows: knownTables.has(String(name))
              ? old.prepare(`SELECT * FROM ${quote(String(name))}`).all()
              : [],
          });
        }
      }
    } catch (error) {
      if (
        ![11, 26].includes(
          Number((error as { errcode?: number }).errcode) & 255,
        )
      )
        throw error;
      tables.length = 0;
      report.warnings.push("旧库无法完整读取，已保留原文件备份并重建空库。");
    } finally {
      old?.close();
    }
    const temp = mkdtempSync(join(dirname(path), ".database-rebuild-"));
    const candidate = join(temp, config ? "config.db" : "workspace.db");
    let next: DatabaseSync | undefined;
    try {
      if (config) {
        const fresh = new ConfigDatabase(temp);
        fresh.close();
      }
      next = new DatabaseSync(candidate);
      if (!config) next.exec("PRAGMA user_version=1;");
      next.exec("PRAGMA foreign_keys=OFF;BEGIN IMMEDIATE");
      for (const table of tables) {
        const columns = next
          .prepare(`PRAGMA table_info(${quote(table.name)})`)
          .all()
          .map((c) => String(c.name));
        if (
          !columns.length ||
          table.columns.some((c: string) => !columns.includes(c))
        ) {
          report.skippedTables.push(table.name);
          continue;
        }
        next.exec(`DELETE FROM ${quote(table.name)}`);
        const insert = next.prepare(
          `INSERT INTO ${quote(table.name)}(${table.columns.map(quote).join(",")}) VALUES(${table.columns.map(() => "?").join(",")})`,
        );
        for (const row of table.rows)
          insert.run(...table.columns.map((c: string) => row[c]));
        report.restoredTables.push(table.name);
        report.restoredRows += table.rows.length;
      }
      if (next.prepare("PRAGMA foreign_key_check").all().length)
        throw new Error("恢复后的外键校验失败");
      next.exec("COMMIT");
      if (
        Object.values(next.prepare("PRAGMA integrity_check").get()!)[0] !== "ok"
      )
        throw new Error("重建库完整性校验失败");
      next.close();
      next = undefined;
      // Swap only after validating the candidate. Retain backups even when recovery is successful.
      if (config) this.config.close();
      const backup = path + ".backup-" + randomUUID();
      const moved: string[] = [];
      let installed = false;
      try {
        for (const suffix of ["", "-wal", "-shm", "-journal"])
          if (existsSync(path + suffix)) {
            renameSync(path + suffix, backup + suffix);
            moved.push(suffix);
          }
        renameSync(candidate, path);
        installed = true;
        if (config) this.config.initialize();
        report.warnings.push(`旧数据库备份：${backup}`);
      } catch (error) {
        if (config) this.config.close();
        if (installed)
          for (const suffix of ["", "-wal", "-shm", "-journal"])
            rmSync(path + suffix, { force: true });
        for (const suffix of moved) renameSync(backup + suffix, path + suffix);
        if (config) {
          try {
            this.config.initialize();
          } catch {}
        }
        throw error;
      }
      return report;
    } finally {
      next?.close();
      rmSync(temp, { recursive: true, force: true });
    }
  }
  commands() {
    return {
      get_config_database_status: () => this.status(),
      initialize_config_database: () => {
        try {
          this.config.initialize();
        } catch {}
        return this.status();
      },
      rebuild_config_database: () => {
        this.last = this.rebuild(this.config.path, true);
        return this.status();
      },
      rebuild_workspace_database: async (i: JsonObject) => {
        const path = await safePath(
          await root(i.workspacePath),
          "workspace.db",
        );
        return { workspaceDbPath: path, rebuild: this.rebuild(path, false) };
      },
    };
  }
}
