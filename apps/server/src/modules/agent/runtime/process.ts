import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Readable } from "node:stream";
import {
  assertRuntimeAvailable,
  runtimeEnvironment,
  type RuntimeConfig,
} from "../../../config/runtime.js";
import type { RpcRequest } from "./protocol.js";

export function spawnRuntime(
  config: RuntimeConfig,
): ChildProcessWithoutNullStreams {
  assertRuntimeAvailable(config);
  mkdirSync(join(config.runtimeDataDir ?? config.dataDir, "pi-agent"), {
    recursive: true,
  });
  return spawn(config.nodeBinary, [config.cliPath], {
    cwd: dirname(config.cliPath),
    env: runtimeEnvironment(config),
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
}

/** Limit unterminated output too; readline alone permits an unbounded buffer. */
export function readLines(
  stream: Readable,
  maxBytes: number,
  onLine: (line: string) => void,
  onError: (error: Error) => void,
) {
  let buffer = "";
  let stopped = false;
  stream.setEncoding("utf8");
  const fail = (error: Error) => {
    if (!stopped) {
      stopped = true;
      onError(error);
    }
  };
  stream.on("data", (chunk: string) => {
    if (stopped) return;
    buffer += chunk;
    let end: number;
    while ((end = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      if (Buffer.byteLength(line) > maxBytes) {
        fail(new Error("Runtime 输出行超过大小限制"));
        return;
      }
      if (line.trim()) {
        try {
          onLine(line);
        } catch (error) {
          fail(error instanceof Error ? error : new Error(String(error)));
        }
      }
      if (stopped) return;
    }
    if (Buffer.byteLength(buffer) > maxBytes)
      fail(new Error("Runtime 输出行超过大小限制"));
  });
  stream.on("end", () => {
    if (!stopped && buffer.trim()) {
      try {
        onLine(buffer);
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
      }
    }
  });
  stream.on("error", fail);
}

export function writeCommand(
  child: ChildProcessWithoutNullStreams,
  command: RpcRequest,
  onError: (error: Error) => void,
) {
  if (child.stdin.destroyed || child.stdin.writableEnded) {
    onError(new Error("Runtime 输入通道已关闭"));
    return;
  }
  child.stdin.write(`${JSON.stringify(command)}\n`, (error) => {
    if (error) onError(error);
  });
}
