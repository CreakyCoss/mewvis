import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { timingSafeEqual } from "node:crypto";

import type { AgentRuntimeSupervisor } from "../../modules/agent/runtime/supervisor.js";
import type { CommandRegistry } from "../commands/registry.js";
import { object, ServiceError } from "../../shared/validation.js";
import type { ServerEvent } from "../../infrastructure/events/event-hub.js";

interface HttpServerOptions {
  token: string;
  port?: number;
  supervisor: AgentRuntimeSupervisor;
  commands: CommandRegistry;
  shutdown: () => Promise<void>;
  dispose: () => void;
}

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    bytes += chunk.length;
    if (bytes > 1024 * 1024) {
      request.resume();
      throw new ServiceError(413, "REQUEST_TOO_LARGE", "请求不能超过 1 MiB");
    }
    chunks.push(chunk);
  }
  try {
    return object(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw new ServiceError(400, "INVALID_JSON", "请求必须是 JSON 对象");
  }
}

function json(response: ServerResponse, status: number, value: unknown) {
  const text = JSON.stringify(value);
  if (Buffer.byteLength(text) > 16 * 1024 * 1024)
    throw new ServiceError(413, "RESPONSE_TOO_LARGE", "响应超过 16 MiB");
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(text);
}

export async function startHttpServer(options: HttpServerOptions) {
  const { supervisor, commands } = options;
  const streams = new Set<ServerResponse>();
  const requests = new Set<Promise<void>>();
  const expectedAuthorization = Buffer.from(`Bearer ${options.token}`);
  let url = "";
  let closing = false;

  function authorize(request: IncomingMessage) {
    // First release is a single-user loopback service. No ambient cookies or permissive CORS.
    const address = new URL(url);
    if (request.headers.host !== address.host)
      throw new ServiceError(403, "INVALID_HOST", "Host 不匹配");
    if (request.headers.origin && request.headers.origin !== address.origin) {
      throw new ServiceError(403, "INVALID_ORIGIN", "不允许此来源");
    }
    const authorization = Buffer.from(request.headers.authorization ?? "");
    if (
      authorization.length !== expectedAuthorization.length ||
      !timingSafeEqual(authorization, expectedAuthorization)
    ) {
      throw new ServiceError(401, "UNAUTHORIZED", "需要 Bearer token");
    }
  }

  function subscribe(request: IncomingMessage, response: ServerResponse) {
    if (streams.size >= 64)
      throw new ServiceError(429, "SUBSCRIBER_LIMIT", "事件连接数已达上限");
    const cursor = request.headers["last-event-id"];
    if (Array.isArray(cursor))
      throw new ServiceError(400, "INVALID_ARGUMENT", "Last-Event-ID 不合法");
    const replay = supervisor.events.replay(cursor);
    if (replay === null)
      throw new ServiceError(
        409,
        "EVENT_CURSOR_EXPIRED",
        "事件游标已过期，请建立新订阅并重新查询任务状态",
      );
    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      connection: "keep-alive",
      "x-accel-buffering": "no",
      "x-event-cursor": supervisor.events.cursor,
    });
    response.flushHeaders();
    // Give HTTP proxies a first body chunk so subscription readiness does not wait for a heartbeat.
    response.write(": connected\n\n");
    streams.add(response);
    const send = (event: ServerEvent) => {
      if (closing || response.destroyed || response.writableEnded) return;
      if (response.writableLength > 1024 * 1024) {
        response.destroy();
        return;
      }
      response.write(
        `id: ${event.id}\nevent: ${event.name}\ndata: ${JSON.stringify(event.payload)}\n\n`,
      );
    };
    // No await between replay and subscription: no event can fall into a registration gap.
    for (const event of replay) send(event);
    const unsubscribe = supervisor.events.subscribe(send);
    const heartbeat = setInterval(() => {
      if (closing || response.destroyed || response.writableEnded) return;
      if (response.writableLength > 1024 * 1024) response.destroy();
      else response.write(": heartbeat\n\n");
    }, 15_000);
    response.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
      streams.delete(response);
    });
  }

  const server = createServer((request, response) => {
    response.setHeader("x-content-type-options", "nosniff");
    const processing = (async () => {
      if (closing)
        throw new ServiceError(503, "SERVER_STOPPING", "Server 正在停止");
      const path = new URL(request.url ?? "/", url).pathname;
      if (request.method === "GET" && (path === "/health" || path === "/")) {
        json(response, 200, {
          service: "isle-agent-server",
          version: 1,
          status: "ok",
          api: "/api/commands/:name",
          events: "/api/events",
        });
        return;
      }
      authorize(request);
      if (request.method === "GET" && path === "/api/events") {
        subscribe(request, response);
        return;
      }
      if (request.method === "GET" && path === "/api/status") {
        json(response, 200, supervisor.status());
        return;
      }
      if (request.method === "GET" && path === "/api/commands") {
        json(response, 200, { commands: commands.names });
        return;
      }
      if (request.method === "GET" && path.startsWith("/api/tasks/")) {
        const task = supervisor.snapshot(
          decodeURIComponent(path.slice("/api/tasks/".length)),
        );
        if (!task)
          throw new ServiceError(
            404,
            "TASK_NOT_FOUND",
            "任务不存在或已超出保留范围",
          );
        json(response, 200, task);
        return;
      }
      if (request.method === "POST" && path.startsWith("/api/commands/")) {
        const args = await readBody(request);
        if (closing)
          throw new ServiceError(503, "SERVER_STOPPING", "Server 正在停止");
        const abort = new AbortController();
        const disconnected = () => {
          if (!response.writableEnded) abort.abort();
        };
        response.once("close", disconnected);
        if (response.destroyed) abort.abort();
        try {
          const result = await commands.invoke(
            path.slice("/api/commands/".length),
            args,
            { signal: abort.signal },
          );
          if (!response.destroyed) json(response, 200, result ?? null);
        } finally {
          response.off("close", disconnected);
        }
        return;
      }
      throw new ServiceError(404, "NOT_FOUND", "接口不存在");
    })().catch((error: unknown) => {
      if (response.headersSent || response.destroyed) {
        response.destroy();
        return;
      }
      const known = error instanceof ServiceError;
      json(response, known ? error.status : 500, {
        error: {
          code: known ? error.code : "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : String(error),
        },
      });
    });
    requests.add(processing);
    void processing.then(
      () => requests.delete(processing),
      () => requests.delete(processing),
    );
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  server.maxConnections = 128;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 1422, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("无法取得监听地址");
  url = `http://127.0.0.1:${address.port}`;
  let closePromise: Promise<void> | undefined;
  return {
    url,
    close(): Promise<void> {
      if (closePromise) return closePromise;
      closing = true;
      closePromise = (async () => {
        for (const stream of streams) stream.end();
        const closed = new Promise<void>((resolve) =>
          server.close(() => resolve()),
        );
        try {
          await options.shutdown();
        } finally {
          server.closeAllConnections();
          // In-flight filesystem commands can still need the configuration DB after an await.
          // Destroy incomplete HTTP uploads, then let dispatched commands finish before disposal.
          await Promise.allSettled([...requests]);
          try {
            options.dispose();
          } finally {
            await closed;
          }
        }
      })();
      return closePromise;
    },
  };
}
