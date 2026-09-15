import { existsSync } from "node:fs";
import { canonicalPath, containsPath } from "../resources.js";
import type { FilesystemScope } from "../../execution/types.js";

/** OS libraries and host-selected program assets, never user home or workspace defaults. */
export function restrictReads(
  filesystem: FilesystemScope,
  allowed: readonly string[],
  programPaths: readonly string[],
) {
  const system =
    process.platform === "darwin"
      ? [
          "/bin",
          "/sbin",
          "/usr/bin",
          "/usr/lib",
          "/System/Library",
          "/Library/Apple",
          "/dev",
          "/private/etc/hosts",
          "/private/etc/resolv.conf",
          "/private/etc/services",
          "/private/etc/ssl",
        ]
      : [
          "/bin",
          "/sbin",
          "/usr/bin",
          "/usr/lib",
          "/lib",
          "/lib64",
          "/dev",
          "/etc/hosts",
          "/etc/resolv.conf",
          "/etc/services",
          "/etc/ssl",
          "/etc/ld.so.cache",
        ];
  const readable = [...allowed, ...programPaths, process.execPath, ...system.filter(existsSync)].map(canonicalPath);
  filesystem.allowRead = [...new Set(readable)].filter(
    (target) => !filesystem.denyRead.some((denied) => containsPath(denied, target)),
  );
  // SRT supports a root deny with explicit carve-outs and preserves nested baseline denies.
  filesystem.denyRead.unshift("/");
}
