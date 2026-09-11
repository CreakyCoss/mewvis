import type { ChildProcess } from "node:child_process";
import type { ExecutionProgram } from "../../execution/types.js";

export const detached = true;
export const shutdownTimeoutMs = 750;
export const shell = undefined;

export function executionEnvironment(names: readonly string[], source = process.env) {
  return Object.fromEntries(names.flatMap((name) => (source[name] === undefined ? [] : [[name, source[name]!]])));
}

export function quoteArgument(value: string) {
  if (value.includes("\0")) throw new Error("命令参数不能包含空字符。");
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function programCommand(program: ExecutionProgram, channelArgs: readonly string[], _temporaryDirectory: string) {
  const command = [program.executable, ...program.args, ...channelArgs].map(quoteArgument).join(" ");
  return `exec env NO_PROXY= no_proxy= NODE_USE_ENV_PROXY=1 ${command}`;
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
