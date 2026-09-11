import type { FilesystemScope } from "../../execution/types.js";

export function restrictReads(
  _filesystem: FilesystemScope,
  _allowed: readonly string[],
  _programPaths: readonly string[],
): never {
  // A shared Windows account retains system/default ACL access. Do not claim it
  // implements a read allowlist until that boundary has been implemented and verified.
  throw new Error("Windows 暂不支持 agentAccess 的文件读取范围限制，未启动执行程序。");
}
