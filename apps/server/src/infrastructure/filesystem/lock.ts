import { createRequire } from "node:module";
import { openSync, closeSync, fstatSync, lstatSync, constants } from "node:fs";
const require = createRequire(import.meta.url);

/** Matches Rust std::fs::File::try_lock: flock on Unix, LockFileEx on Windows. */
export function tryFileLock(path: string): (() => void) | undefined {
  // fs-native-extensions uses fcntl on Linux, which does NOT interoperate with Rust's flock.
  // Use fs-ext there (and on other Unix); macOS/Windows use the prebuilt native extension.
  const native =
    process.platform === "darwin" || process.platform === "win32"
      ? (require("fs-native-extensions") as { tryLock(fd: number): boolean })
      : undefined;
  let flock: ((fd: number, mode: string) => void) | undefined;
  if (!native) {
    try {
      flock = require("fs-ext").flockSync;
    } catch {
      throw new Error(
        "缺少 fs-ext 文件锁模块；请安装系统编译工具并重新运行 pnpm install",
      );
    }
  }
  const fd = openSync(
    path,
    constants.O_RDWR | constants.O_CREAT | (constants.O_NOFOLLOW ?? 0),
    0o600,
  );
  try {
    const info = fstatSync(fd),
      entry = lstatSync(path);
    if (
      !info.isFile() ||
      info.nlink !== 1 ||
      entry.isSymbolicLink() ||
      entry.ino !== info.ino ||
      entry.dev !== info.dev
    )
      throw new Error("锁文件不能重定向");
    if (native) {
      if (!native.tryLock(fd)) {
        closeSync(fd);
        return undefined;
      }
    } else {
      try {
        flock!(fd, "exnb");
      } catch (error) {
        if (
          ["EAGAIN", "EWOULDBLOCK"].includes(
            (error as NodeJS.ErrnoException).code ?? "",
          )
        ) {
          closeSync(fd);
          return undefined;
        }
        throw error;
      }
    }
  } catch (error) {
    closeSync(fd);
    throw error;
  }
  let closed = false;
  return () => {
    if (!closed) {
      closed = true;
      closeSync(fd);
    }
  };
}
