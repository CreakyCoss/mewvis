import { lstat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep, join } from "node:path";
import { APP_DATA_DIR_NAME } from "@mewvis/product-config";
import { checkAgentAccess } from "../../../../../../security/access/index.js";
import {
  canonicalPath,
  containsPath,
  networkAllowed,
} from "../../../../../../security/platforms/resources.js";
import type { ExecutionPolicy } from "../../../../../../security/execution/types.js";

export async function authorizeMediaPath(
  execution: ExecutionPolicy,
  protectedPaths: readonly string[],
  input: string,
  action: "read" | "write",
) {
  if (
    !isAbsolute(input) ||
    input.includes("\0") ||
    input.split(/[\\/]/).includes("..")
  )
    throw new Error("filePath 必须是无父目录跳转的完整路径");
  const root = execution.workspacePath;
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink())
    throw new Error("工作区目录已改变");
  const target = canonicalPath(input);
  if (!containsPath(root, target))
    throw new Error("媒体文件必须位于当前工作区内");
  for (let cursor = resolve(input); cursor !== root; cursor = dirname(cursor)) {
    try {
      if ((await lstat(cursor)).isSymbolicLink())
        throw new Error("媒体路径不能包含符号链接");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (dirname(cursor) === cursor) throw new Error("媒体路径超出工作区");
  }
  const sandbox = execution.sandbox?.filesystem;
  const denied = action === "write" ? sandbox?.denyWrite : sandbox?.denyRead;
  const allowed = action === "write" ? sandbox?.allowWrite : sandbox?.allowRead;
  // Policy and protected roots are resolved before isolation. Inspect only the
  // requested file here: other roots can be unreadable inside this sandbox.
  if (
    denied?.some((path) => {
      // The POSIX read allowlist uses a root denial with explicit carve-outs.
      if (action === "read" && allowed && path === "/") return false;
      return containsPath(path, target);
    }) ||
    (allowed && !allowed.some((path) => containsPath(path, target)))
  )
    throw new Error("当前执行策略禁止访问该媒体文件目录");
  if (action === "write") {
    const parts = relative(root, target).split(sep);
    const managed = [
      ...protectedPaths,
      ...["", "-wal", "-shm", "-journal"].map((suffix) =>
        join(root, "workspace.db" + suffix),
      ),
    ];
    if (
      target === root ||
      parts.includes(".git") ||
      parts.includes(APP_DATA_DIR_NAME) ||
      managed.some(
        (path) => containsPath(path, target) || containsPath(target, path),
      )
    )
      throw new Error("不能修改宿主管理的配置、数据库或工作区标识");
  }
  if (execution.access) {
    const denied = checkAgentAccess(execution.access, {
      coverage: "complete",
      operations: [{ kind: "filesystem", action, target, recursive: false }],
    });
    if (denied) throw new Error(denied);
  }
  return target;
}

export function authorizeMediaUrl(execution: ExecutionPolicy, url: URL) {
  if (execution.sandbox && !networkAllowed(execution.sandbox, url.hostname))
    throw new Error(`当前执行策略禁止访问媒体服务：${url.hostname}`);
  if (execution.access) {
    const denied = checkAgentAccess(execution.access, {
      coverage: "complete",
      operations: [{ kind: "network", url: url.toString(), method: "GET" }],
    });
    if (denied) throw new Error(denied);
  }
}
