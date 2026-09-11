import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join, win32 } from "node:path";
import type { ExecutionProgram } from "../../execution/types.js";

export const detached = false;
export const shutdownTimeoutMs = 30_000;
export const shell = "powershell";

export function resolveCommandShell(source = process.env) {
  const env = executionEnvironment(["PATH", "ProgramFiles", "ProgramFiles(x86)", "SystemRoot"], source);
  const path = (env.PATH ?? "")
    .split(win32.delimiter)
    .map((entry) => entry.replace(/^"|"$/g, ""))
    .filter(Boolean);
  const bash = [
    ...[env.ProgramFiles, env["ProgramFiles(x86)"]]
      .filter(Boolean)
      .map((root) => win32.join(root!, "Git", "bin", "bash.exe")),
    ...path.map((root) => win32.join(root, "bash.exe")),
  ].find((file) => !/[\\/]Windows[\\/](?:System32|Sysnative)[\\/]/i.test(file) && existsSync(file));
  if (bash) return { name: "bash" as const, executable: bash, args: ["-c"], commandPrefix: "" };
  const powershell = [
    ...path.map((root) => win32.join(root, "pwsh.exe")),
    ...(env.ProgramFiles ? [win32.join(env.ProgramFiles, "PowerShell", "7", "pwsh.exe")] : []),
    ...path.map((root) => win32.join(root, "powershell.exe")),
    win32.join(env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
  ].find((file) => existsSync(file));
  if (!powershell) return undefined;
  return {
    name: "powershell" as const,
    executable: powershell,
    args: ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command"],
    commandPrefix: "try { [Console]::OutputEncoding=[System.Text.Encoding]::UTF8 } catch {}\n",
  };
}

export function executionEnvironment(names: readonly string[], source = process.env) {
  const entries = Object.entries(source);
  return Object.fromEntries(
    names.flatMap((name) => {
      const entry = entries.find(([key]) => key.toLowerCase() === name.toLowerCase());
      return entry?.[1] === undefined ? [] : [[name, entry[1]]];
    }),
  );
}

export function quoteArgument(value: string) {
  if (value.includes("\0")) throw new Error("命令参数不能包含空字符。");
  return `'${value.replaceAll("'", "''")}'`;
}

export function programCommand(program: ExecutionProgram, channelArgs: readonly string[], temporaryDirectory: string) {
  const command = [program.executable, ...program.args, ...channelArgs].map(quoteArgument).join(" ");
  return `$env:NODE_USE_ENV_PROXY='1'; $env:NO_PROXY=''; $env:no_proxy=''; $env:TEMP=${quoteArgument(temporaryDirectory)}; $env:TMP=${quoteArgument(temporaryDirectory)}; & ${command}; exit $LASTEXITCODE`;
}

export async function killProcessTree(child: ChildProcess) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  const closed = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Windows 沙箱执行进程未能退出，权限占用将保留。")), 10_000);
    child.once("close", () => {
      clearTimeout(timer);
      resolve();
    });
  });
  const killed = new Promise<void>((resolve, reject) => {
    const killer = spawn(
      join(process.env.SystemRoot ?? "C:\\Windows", "System32", "taskkill.exe"),
      ["/F", "/T", "/PID", String(child.pid)],
      { stdio: "ignore", windowsHide: true, shell: false },
    );
    killer.once("error", reject);
    killer.once("close", () => resolve());
  });
  await Promise.all([killed, closed]);
}

export function stopLauncher(child: ChildProcess) {
  child.stdin!.end();
}
export async function forceStopLauncher(child: ChildProcess) {
  try {
    await killProcessTree(child);
  } catch {
    child.kill();
  }
}
export const stopWorker = killProcessTree;
