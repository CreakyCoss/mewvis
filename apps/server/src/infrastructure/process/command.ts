import { spawn } from "node:child_process";
import { ServiceError } from "../../shared/validation.js";
import { ProcessLifecycle } from "./lifecycle.js";

/** Bound both output and termination, including descendants retaining inherited pipes. */
export async function command(
  file: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    input?: string;
    allow?: number[];
    timeout?: number;
    signal?: AbortSignal;
  } = {},
) {
  if (options.signal?.aborted)
    throw new ServiceError(499, "COMMAND_ABORTED", "操作已取消");
  const child = spawn(file, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  const lifecycle = new ProcessLifecycle(child, {
    stopTimeoutMs: 5000,
    shutdownGraceMs: 500,
    outputDrainTimeoutMs: 250,
  });
  const stdout: Buffer[] = [],
    stderr: Buffer[] = [];
  let bytes = 0,
    failure: ServiceError | undefined;
  const stop = (code: string, message: string) => {
    failure ??= new ServiceError(400, code, message);
    void lifecycle.stop();
  };
  const read = (parts: Buffer[], chunk: Buffer) => {
    bytes += chunk.length;
    if (bytes > 16 * 1024 * 1024)
      stop("COMMAND_OUTPUT_LIMIT", "子进程输出超过 16 MiB");
    else parts.push(chunk);
  };
  child.stdout.on("data", (chunk: Buffer) => read(stdout, chunk));
  child.stderr.on("data", (chunk: Buffer) => read(stderr, chunk));
  child.on("error", () => stop("COMMAND_UNAVAILABLE", `无法启动 ${file}`));
  child.stdin.on("error", () => {});
  child.stdin.end(options.input ?? "");
  const timer = setTimeout(
    () => stop("COMMAND_TIMEOUT", `${file} 操作超时`),
    options.timeout ?? 30000,
  );
  const abort = () => stop("COMMAND_ABORTED", "操作已取消");
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();
  const exit = await lifecycle.finished;
  options.signal?.removeEventListener("abort", abort);
  clearTimeout(timer);
  if (!exit.confirmed)
    throw new ServiceError(503, "COMMAND_EXIT_UNCONFIRMED", "未确认子进程退出");
  if (failure) throw failure;
  const code = exit.code ?? -1;
  const result = {
    stdout: Buffer.concat(stdout).toString("utf8"),
    stderr: Buffer.concat(stderr).toString("utf8"),
    code,
  };
  if (code !== 0 && !options.allow?.includes(code))
    throw new ServiceError(
      400,
      "COMMAND_FAILED",
      `${file} 操作失败：${result.stderr.slice(0, 2000)}`,
    );
  return result;
}
