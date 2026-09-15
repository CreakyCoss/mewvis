import { DatabaseSync } from "node:sqlite";
import { lstat, mkdir, open, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, parse, sep } from "node:path";
import { ServiceError } from "../shared/validation.js";

const workspaceSchemaVersion = 1;

/** Resolve each component before '..', matching Tauri's existing symlink semantics. */
export async function normalizeWorkspacePath(path: string): Promise<string> {
  if (!isAbsolute(path) || path.includes("\0")) {
    throw new ServiceError(
      400,
      "INVALID_ARGUMENT",
      "请选择绝对路径的工作区目录",
    );
  }
  const root = parse(path).root;
  let current = root;
  for (const component of path
    .slice(root.length)
    .split(sep === "\\" ? /[/\\]/ : /\//)) {
    if (!component || component === ".") continue;
    current = component === ".." ? dirname(current) : join(current, component);
    try {
      await lstat(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw new ServiceError(
        400,
        "WORKSPACE_UNAVAILABLE",
        "无法读取工作区目录",
      );
    }
    try {
      current = await realpath(current);
      if (!(await stat(current)).isDirectory())
        throw new Error("not a directory");
    } catch {
      throw new ServiceError(
        400,
        "WORKSPACE_UNAVAILABLE",
        "工作区路径必须是可访问的目录，且不能包含失效符号链接",
      );
    }
  }
  return current;
}

export async function initializeWorkspaceDirectory(
  path: string,
): Promise<string> {
  let canonical = await normalizeWorkspacePath(path);
  try {
    await mkdir(canonical, { recursive: true, mode: 0o700 });
    canonical = await normalizeWorkspacePath(canonical);
    const databasePath = join(canonical, "workspace.db");
    try {
      const file = await open(databasePath, "wx", 0o600);
      await file.close();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const file = await lstat(databasePath);
    if (!file.isFile() || file.isSymbolicLink()) {
      throw new ServiceError(
        400,
        "WORKSPACE_DATABASE_UNAVAILABLE",
        "workspace.db 必须是普通文件，不能是符号链接",
      );
    }
    // The desktop currently has no workspace tables, only schema version 1. Preserve existing data.
    const db = new DatabaseSync(databasePath);
    try {
      db.exec(
        "PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 100; BEGIN IMMEDIATE",
      );
      try {
        const version = Number(
          db.prepare("PRAGMA user_version").get()!.user_version,
        );
        if (version > workspaceSchemaVersion) {
          throw new ServiceError(
            409,
            "WORKSPACE_SCHEMA_TOO_NEW",
            "工作区数据库版本高于当前 Server 支持的版本",
          );
        }
        if (version === 0)
          db.exec(`PRAGMA user_version = ${workspaceSchemaVersion}`);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    } finally {
      db.close();
    }
    return canonical;
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    if (typeof (error as { errcode?: number }).errcode === "number")
      throw error;
    throw new ServiceError(
      400,
      "WORKSPACE_UNAVAILABLE",
      "无法初始化工作区目录或数据库",
    );
  }
}
