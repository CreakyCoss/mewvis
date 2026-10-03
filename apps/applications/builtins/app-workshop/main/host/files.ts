import { constants } from "node:fs";
import { lstat, mkdir, open, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export const isId = (id: unknown): id is string =>
  typeof id === "string" &&
  /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id);
export const errorCode = (error: unknown) =>
  error && typeof error === "object" && "code" in error
    ? error.code
    : undefined;
export async function directory(path: string) {
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink())
    throw new Error("工坊目录不能是符号链接。");
}
export async function readJson<T>(path: string, limit: number): Promise<T> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > limit)
      throw new Error("项目文件无效或超过大小限制。");
    return JSON.parse(await file.readFile("utf8")) as T;
  } finally {
    await file.close();
  }
}
export async function atomicJson(path: string, value: unknown) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  const file = await open(temporary, "wx", 0o600);
  try {
    await file.writeFile(JSON.stringify(value));
    await file.sync();
  } finally {
    await file.close();
  }
  try {
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}
const gates = new Map<string, Promise<void>>();

export async function withDirectoryLock<T>(
  root: string,
  action: () => Promise<T>,
): Promise<T> {
  const previous = gates.get(root);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  gates.set(root, gate);
  await previous;
  try {
    return await filesystemLocked(root, action);
  } finally {
    release();
    if (gates.get(root) === gate) gates.delete(root);
  }
}
async function filesystemLocked<T>(
  root: string,
  action: () => Promise<T>,
): Promise<T> {
  const lock = join(root, ".write-lock");
  const busy = () => new Error("项目正在保存或构建，请稍后重试。");
  try {
    await mkdir(lock);
  } catch (error) {
    if (errorCode(error) !== "EEXIST") throw error;
    await directory(lock);
    const lockInfo = await lstat(lock);
    // Only one contender may reclaim a crashed process's lock. Never clear a
    // live owner's lock, including when its operation takes longer than usual.
    const reclaim = join(lock, ".reclaim");
    try {
      await mkdir(reclaim);
    } catch {
      throw busy();
    }
    let moved = false;
    try {
      let abandoned = false;
      try {
        const owner = await readJson<{ pid: number }>(
          join(lock, "owner.json"),
          1024,
        );
        if (!Number.isSafeInteger(owner.pid) || owner.pid < 1) throw busy();
        try {
          process.kill(owner.pid, 0);
        } catch (value) {
          if (errorCode(value) === "ESRCH") abandoned = true;
          else throw busy();
        }
      } catch (value) {
        if (errorCode(value) !== "ENOENT") throw value;
        abandoned = Date.now() - lockInfo.mtimeMs > 60_000;
      }
      if (!abandoned) throw busy();
      const stale = join(root, `.abandoned-lock-${randomUUID()}`);
      await rename(lock, stale);
      moved = true;
      await rm(stale, { recursive: true, force: true });
    } finally {
      if (!moved) await rm(reclaim, { recursive: true, force: true });
    }
    try {
      await mkdir(lock);
    } catch {
      throw busy();
    }
  }
  try {
    await atomicJson(join(lock, "owner.json"), { pid: process.pid });
    return await action();
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}
