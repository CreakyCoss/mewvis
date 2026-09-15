import { createWriteStream } from "node:fs";
import type { ChildProcess } from "node:child_process";
import type { Readable } from "node:stream";
import type { ExecutionTransport, TransportCallbacks, WorkerConnection } from "../../execution/types.js";

export async function createTransport(callbacks: TransportCallbacks): Promise<ExecutionTransport> {
  let worker: ChildProcess | undefined;
  const pending: string[] = [];
  return {
    args: [],
    stdio: ["pipe", "pipe", "pipe", "pipe"],
    attach(child) {
      worker = child;
      (child.stdio[3] as Readable).on("data", callbacks.receive);
      child.stdin!.on("error", callbacks.fail);
      for (const line of pending.splice(0)) child.stdin!.write(`${line}\n`);
    },
    send(line) {
      if (worker) worker.stdin!.write(`${line}\n`);
      else pending.push(line);
    },
    close() {
      pending.length = 0;
    },
  };
}

export function connectWorker(): WorkerConnection {
  return { input: process.stdin, output: createWriteStream("", { fd: 3, autoClose: false }) };
}
