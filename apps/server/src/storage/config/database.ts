import { DatabaseSync } from "node:sqlite";
import { chmodSync, closeSync, mkdirSync, openSync } from "node:fs";
import { join } from "node:path";
import { migrateConfig } from "./migrations.js";
import { seedWorkspaceDefaults } from "./defaults.js";
import { databaseError } from "../errors.js";

export class ConfigDatabase {
  private current?: DatabaseSync;
  setupError: string | null = null;
  get connection(): DatabaseSync {
    if (!this.current) throw new Error(this.setupError ?? "配置库已关闭");
    return this.current;
  }
  readonly path: string;
  private closed = false;

  constructor(dataDir: string, tolerateError = false) {
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    this.path = join(dataDir, "config.db");
    closeSync(openSync(this.path, "a", 0o600));
    if (process.platform !== "win32") chmodSync(this.path, 0o600);
    try {
      this.initialize();
    } catch (error) {
      if (!tolerateError) throw error;
    }
  }

  initialize() {
    if (this.current) return;
    try {
      this.current = new DatabaseSync(this.path);
      this.closed = false;
      // Keep lock waits bounded so local configuration access cannot stall Agent supervision.
      this.connection.exec(
        "PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 100;",
      );
      migrateConfig(this.connection);
      this.transaction(() => seedWorkspaceDefaults(this.connection));
      this.setupError = null;
    } catch (error) {
      this.current?.close();
      this.current = undefined;
      this.setupError =
        error instanceof Error ? error.message : "配置库初始化失败";
      throw error;
    }
  }

  transaction<T>(work: () => T): T {
    this.connection.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      this.connection.exec("COMMIT");
      return result;
    } catch (error) {
      this.connection.exec("ROLLBACK");
      throw error;
    }
  }

  close() {
    if (this.closed) return;
    this.current?.close();
    this.current = undefined;
    this.closed = true;
  }
}

/** Never send SQL or bound configuration values (including credentials) to HTTP clients. */
export function settingsOperation<T>(work: () => T): T {
  try {
    return work();
  } catch (error) {
    throw databaseError(error, "SETTINGS");
  }
}
