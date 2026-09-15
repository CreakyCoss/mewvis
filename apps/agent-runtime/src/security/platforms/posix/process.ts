import type { ChildProcess } from "node:child_process";
import type { ExecutionProgram } from "../../execution/types.js";

export const detached = true;
export const shutdownTimeoutMs = 750;
export const shell = undefined;

export function resolveCommandShell() {
  return { name: "bash" as const, executable: "/bin/bash", args: ["-c"], commandPrefix: "" };
}

export function executionEnvironment(names: readonly string[], source = process.env) {
  return Object.fromEntries(names.flatMap((name) => (source[name] === undefined ? [] : [[name, source[name]!]])));
}

export function quoteArgument(value: string) {
  if (value.includes("\0")) throw new Error("命令参数不能包含空字符。");
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function programCommand(program: ExecutionProgram, channelArgs: readonly string[], temporaryDirectory: string) {
  const command = [program.executable, ...program.args, ...channelArgs].map(quoteArgument).join(" ");
  // SRT installs its local proxy variables in the outer launcher. Resolve its
  // loopback endpoint numerically so a read allowlist need not expose DNS files.
  const proxy = ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"]
    .map((name) => `${name}="\${${name}/localhost:/127.0.0.1:}"`)
    .join(" ");
  return `exec env ${proxy} TMPDIR=${quoteArgument(temporaryDirectory)} NO_PROXY= no_proxy= NODE_USE_ENV_PROXY=1 ${command}`;
}

function killGroup(child: ChildProcess, signal: NodeJS.Signals) {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
}

export function stopLauncher(child: ChildProcess) {
  killGroup(child, "SIGTERM");
}
export async function forceStopLauncher(child: ChildProcess) {
  killGroup(child, "SIGKILL");
}
export async function stopWorker(child: ChildProcess) {
  child.kill("SIGTERM");
}
