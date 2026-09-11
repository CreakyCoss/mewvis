import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import { spawn } from "node:child_process";
import { createBashTool } from "@earendil-works/pi-coding-agent";

export function createPiBashTool(workspace: string) {
  return createBashTool(workspace, {
    operations: {
      exec(command, cwd, options) {
        return new Promise((resolve, reject) => {
          // Keep descendants in the execution process group for cancellation.
          const child = spawn(bashExecutable(), ["-c", command], {
            cwd,
            env: process.env,
            detached: false,
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"],
          });
          child.stdout.on("data", options.onData);
          child.stderr.on("data", options.onData);
          child.once("error", reject);
          child.once("close", (exitCode) => resolve({ exitCode }));
        });
      },
    },
  });
}

/** Preserve the Bash tool's language on Windows; never select the WSL launcher as a native shell. */
export function bashExecutable() {
  if (process.platform !== "win32") return "/bin/bash";
  const candidates = [
    ...[process.env.ProgramFiles, process.env["ProgramFiles(x86)"]]
      .filter(Boolean)
      .map((root) => join(root!, "Git", "bin", "bash.exe")),
    ...(process.env.PATH ?? "")
      .split(delimiter)
      .filter(Boolean)
      .map((root) => join(root, "bash.exe")),
  ];
  const shell = candidates.find(
    (file) => !/[\\/]Windows[\\/](?:System32|Sysnative)[\\/]/i.test(file) && existsSync(file),
  );
  if (!shell)
    throw new Error(
      "bash 工具需要原生 Bash，请安装 Git for Windows，或将 MSYS2/Cygwin 的 bash.exe 加入 PATH。其他文件和插件工具不依赖 Bash。",
    );
  return shell;
}
