import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { once } from "node:events";
import { createServer, createConnection, type Socket } from "node:net";
import { createInterface } from "node:readline";
import type { ExecutionTransport, TransportCallbacks, WorkerConnection } from "../../execution/types.js";

export async function createTransport(callbacks: TransportCallbacks): Promise<ExecutionTransport> {
  const path = `\\\\.\\pipe\\mewvis-agent-${randomUUID()}`;
  const token = randomBytes(32).toString("hex");
  const pending: string[] = [];
  let channel: Socket | undefined;
  let closed = false;
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    const input = createInterface({ input: socket });
    let authenticated = false;
    const timer = setTimeout(() => socket.destroy(), 5_000);
    socket.on("error", () => socket.destroy());
    input.on("line", (line) => {
      if (!authenticated) {
        let value: unknown;
        try {
          value = JSON.parse(line).token;
        } catch {
          socket.destroy();
          return;
        }
        if (
          channel ||
          typeof value !== "string" ||
          Buffer.byteLength(value) !== token.length ||
          !timingSafeEqual(Buffer.from(value), Buffer.from(token))
        ) {
          socket.destroy();
          return;
        }
        authenticated = true;
        clearTimeout(timer);
        channel = socket;
        for (const message of pending.splice(0)) socket.write(`${message}\n`);
      } else callbacks.receive(`${line}\n`);
    });
    socket.once("close", () => {
      sockets.delete(socket);
      clearTimeout(timer);
      if (authenticated && !closed) callbacks.fail(new Error("执行通道已关闭。"));
    });
  });
  server.listen({ path, readableAll: true, writableAll: true });
  await once(server, "listening");
  return {
    args: ["--mewvis-channel", path, "--mewvis-token", token],
    stdio: ["ignore", "pipe", "pipe"],
    attach() {},
    send(line) {
      if (channel) channel.write(`${line}\n`);
      else pending.push(line);
    },
    close() {
      closed = true;
      pending.length = 0;
      for (const socket of sockets) socket.destroy();
      server.close();
    },
  };
}

export function connectWorker(): WorkerConnection {
  const channelIndex = process.argv.indexOf("--mewvis-channel");
  const tokenIndex = process.argv.indexOf("--mewvis-token");
  if (channelIndex < 0 || tokenIndex < 0 || !process.argv[channelIndex + 1] || !process.argv[tokenIndex + 1])
    throw new Error("缺少 Windows 执行通道参数。");
  const channel = createConnection(process.argv[channelIndex + 1]);
  channel.once("connect", () => channel.write(`${JSON.stringify({ token: process.argv[tokenIndex + 1] })}\n`));
  return { input: channel, output: channel };
}
