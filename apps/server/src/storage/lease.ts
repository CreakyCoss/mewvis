import { mkdirSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { ServiceError } from "../shared/validation.js";
import { tryFileLock } from "../infrastructure/filesystem/lock.js";

/** Reuses Rust's lifetime lock; switching hosts cannot overlap access to application data. */
export function leaseDataDirectory(directory: string): () => void {
  const apps = join(directory, "apps");
  mkdirSync(apps, { recursive: true, mode: 0o700 });
  if (lstatSync(apps).isSymbolicLink())
    throw new Error("应用目录不能是符号链接");
  const release = tryFileLock(join(apps, ".layout.lock"));
  if (!release)
    throw new ServiceError(
      409,
      "SERVER_DATA_IN_USE",
      "此数据目录正在被 Node 或 Rust 后端使用，请先退出当前后端",
    );
  return release;
}
