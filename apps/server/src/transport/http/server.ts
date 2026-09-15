import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { webAssets } from "./web-assets.js";

import type { AgentRuntimeSupervisor } from "../../modules/agent/runtime/supervisor.js";
import type { CommandRegistry } from "../commands/registry.js";
import { object, ServiceError } from "../../shared/validation.js";
import type { ServerEvent } from "../../infrastructure/events/event-hub.js";

interface HttpServerOptions {
  token: string;
  port?: number;
  allowedOrigins?: string[];
  webRoot?: string;
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
  const serveAssets = options.webRoot !== undefined
    ? await webAssets(options.webRoot)
    : undefined;
  const webToken = randomBytes(32).toString("hex");
  let cookieName = "";
  let url = "";
  let closing = false;

  const allowedOrigins = new Set(options.allowedOrigins ?? []);

  function checkOrigin(request: IncomingMessage, response: ServerResponse) {
    // Both modes are single-user loopback services with an exact origin boundary.
    const address = new URL(url);
    if (request.headers.host !== address.host)
      throw new ServiceError(403, "INVALID_HOST", "Host 不匹配");
    if (
      request.headers.origin &&
      request.headers.origin !== address.origin &&
      (!!serveAssets || !allowedOrigins.has(request.headers.origin))
    ) {
      throw new ServiceError(403, "INVALID_ORIGIN", "不允许此来源");
    }
    const origin = request.headers.origin;
    if (
      serveAssets &&
      ["cross-site", "same-site"].includes(
        String(request.headers["sec-fetch-site"]),
      )
    )
      throw new ServiceError(403, "INVALID_ORIGIN", "不允许此来源访问本地服务");
    if (origin && allowedOrigins.has(origin)) {
      response.setHeader("access-control-allow-origin", origin);
      response.setHeader("vary", "Origin");
      response.setHeader("access-control-expose-headers", "x-event-cursor");
    }
  }

  function authorize(request: IncomingMessage) {
    if (serveAssets && !request.headers.authorization) {
      const cookie = request.headers.cookie
        ?.split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${cookieName}=`));
      const value = Buffer.from(cookie?.slice(cookieName.length + 1) ?? "");
      const expected = Buffer.from(webToken);
      if (value.length === expected.length && timingSafeEqual(value, expected))
        return;
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
      if (
        request.method === "GET" &&
        !serveAssets &&
        (path === "/health" || path === "/")
      ) {
        json(response, 200, {
          service: "isle-agent-server",
          version: 1,
          status: "ok",
          api: "/api/commands/:name",
          events: "/api/events",
        });
        return;
      }
      checkOrigin(request, response);
      if (serveAssets && path !== "/api" && !path.startsWith("/api/")) {
        await serveAssets(
          request,
          response,
          `${cookieName}=${webToken}; HttpOnly; SameSite=Strict; Path=/api/`,
        );
        return;
      }
      if (request.method === "OPTIONS") {
        if (
          !request.headers.origin ||
          !allowedOrigins.has(request.headers.origin)
        )
          throw new ServiceError(403, "INVALID_ORIGIN", "不允许此来源");
        const method = request.headers["access-control-request-method"];
        const headers = String(
          request.headers["access-control-request-headers"] ?? "",
        )
          .toLowerCase()
          .split(",")
          .map((h) => h.trim())
          .filter(Boolean);
        if (
          !["GET", "POST"].includes(String(method)) ||
          headers.some(
            (h) =>
              !["authorization", "content-type", "last-event-id"].includes(h),
          )
        )
          throw new ServiceError(403, "INVALID_PREFLIGHT", "不允许此跨域请求");
        response.writeHead(204, {
          "access-control-allow-methods": "GET, POST",
          "access-control-allow-headers":
            "authorization, content-type, last-event-id",
          "access-control-max-age": "600",
        });
        response.end();
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
  cookieName = `isle_web_${address.port}`;
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
