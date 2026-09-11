import { spawn } from "node:child_process";
import { createBashTool, createPowerShellTool } from "@earendil-works/pi-coding-agent";
import { getProcessPlatform } from "../../../../../../../security/platforms/index.js";

export function createPiShellTool(workspace: string) {
  const shell = getProcessPlatform().resolveCommandShell();
  if (!shell) return undefined;
  const create = shell.name === "powershell" ? createPowerShellTool : createBashTool;
  return create(workspace, {
    exposeSessionEnvironment: false,
    operations: {
      exec(command, cwd, options) {
        options.signal?.throwIfAborted();
        return new Promise((resolve, reject) => {
          // Keep descendants in the execution process group for cancellation.
          // ProgramExecutor owns timeouts and cancellation for both shell tools.
          const child = spawn(shell.executable, [...shell.args, shell.commandPrefix + command], {
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
