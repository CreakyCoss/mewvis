import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import type { SandboxRuntimeConfig } from "@anthropic-ai/sandbox-runtime";
import type { SrtSandboxPolicy as SandboxPolicy } from "../../execution/runtime/srt.js";
import { containsPath } from "../resources.js";

/** Translate the shared boundary into SRT's Windows ACL inputs. */
export function windowsFilesystem(policy: SandboxPolicy): SandboxRuntimeConfig["filesystem"] {
  const windows = policy.backend.options.platform;
  if (windows.kind !== "windows") throw new Error("缺少已解析的 Windows 沙箱配置。");
  const filesystem = structuredClone(policy.filesystem);
  // Missing deny targets become placeholders in SRT. A parent denial already
  // covers descendants; stamping both can try to create children under a file.
  const minimal = (paths: string[]) =>
    [...new Set(paths)].filter(
      (target, index, all) =>
        !all.some(
          (root, other) =>
            other !== index && containsPath(root, target) && (!containsPath(target, root) || other < index),
        ),
    );
  filesystem.denyRead = minimal(filesystem.denyRead);
  for (const part of [...policy.backend.options.protectedFileNames, ...policy.backend.options.protectedDirectories]) {
    const target = join(policy.workspacePath, part);
    let parent = dirname(target);
    while (!existsSync(parent) && dirname(parent) !== parent) parent = dirname(parent);
    // For example .git can be a worktree marker file, not a directory.
    if (statSync(parent).isDirectory()) filesystem.denyWrite.push(target);
    for (const root of new Set(filesystem.allowWrite)) {
      const direct = join(root, part);
      if (existsSync(direct)) filesystem.denyWrite.push(direct);
      for (let depth = 1; depth <= windows.mandatorySearchDepth; depth++)
        filesystem.denyWrite.push(join(root, ...Array<string>(depth).fill("*"), part));
    }
  }
  filesystem.denyWrite = minimal(filesystem.denyWrite);
  // An explicit ALLOW below a denied directory can override its inherited DENY
  // on Windows. Never create such an exception from a configured write/read root.
  filesystem.allowWrite = filesystem.allowWrite.filter(
    (target) => ![...filesystem.denyRead, ...filesystem.denyWrite].some((root) => containsPath(root, target)),
  );
  const allowRead = windows.readGrantPaths.filter(
    (target) => !filesystem.denyRead.some((root) => containsPath(root, target)),
  );
  return { ...filesystem, allowRead };
}
