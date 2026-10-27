import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { realpath, readFile } from "node:fs/promises";
import { resolve, relative, extname, isAbsolute } from "node:path";
import {
  KnowledgeError,
  parseKnowledgeRequest,
  parseKnowledgeResponse,
  validateKnowledgeResult,
  type KnowledgeErrorCode,
  type KnowledgeResponse,
} from "@mewvis/knowledge-sdk";
import type {
  KnowledgeHttpServer,
  KnowledgeHttpServerOptions,
} from "./index.js";

function failure(code: KnowledgeErrorCode, message: string): never {
  throw new KnowledgeError({ code, message });
}
const statuses: Partial<Record<KnowledgeErrorCode, number>> = {
  INVALID_ARGUMENT: 400,
  UNAUTHENTICATED: 401,
  PERMISSION_DENIED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  NOT_SUPPORTED: 501,
  NOT_READY: 409,
  RATE_LIMITED: 429,
  UNAVAILABLE: 503,
  TIMEOUT: 504,
  ABORTED: 499,
};
const statusFor = (code: KnowledgeErrorCode): number => statuses[code] ?? 500;
const json = (response: ServerResponse, status: number, value: unknown) => {
  if (response.destroyed || response.writableEnded) return;
  if (response.headersSent) {
    response.destroy();
    return;
  }
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(value));
};
async function body(
  request: IncomingMessage,
  limit: number,
  signal: AbortSignal,
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    signal.throwIfAborted();
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > limit)
      failure(
        "INVALID_ARGUMENT",
        "Knowledge request exceeds the configured size limit",
      );
    chunks.push(buffer);
  }
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
    );
  } catch {
    return failure(
      "INVALID_ARGUMENT",
      "Knowledge request must be valid UTF-8 JSON",
    );
  }
}

export async function startHttpServer(
  options: KnowledgeHttpServerOptions,
): Promise<KnowledgeHttpServer> {
  const host = options.host ?? "127.0.0.1",
    port = options.port ?? 4317;
  const rpcPath = options.rpcPath ?? "/api/knowledge";
  const limit = options.maxRequestBytes ?? 16 * 1024 * 1024;
  const timeout = options.requestTimeoutMs ?? 60_000;
  if (
    typeof options.resolveTransport !== "function" ||
    !host.trim() ||
    !Number.isSafeInteger(port) ||
    port < 0 ||
    port > 65535 ||
    !Number.isSafeInteger(limit) ||
    limit <= 0 ||
    limit > 64 * 1024 * 1024 ||
    !Number.isSafeInteger(timeout) ||
    timeout <= 0 ||
    timeout > 2_147_483_647 ||
    !/^\/[a-z0-9/_-]+$/i.test(rpcPath) ||
    rpcPath === "/healthz"
  )
    failure("INVALID_ARGUMENT", "Invalid knowledge HTTP server options");
  for (const values of [options.allowedHosts, options.allowedOrigins])
    if (values && values.some((value) => !value.trim() || value.includes("*")))
      failure(
        "INVALID_ARGUMENT",
        "Host and Origin allowances must be explicit",
      );
  const directory = options.staticDirectory
    ? await realpath(options.staticDirectory)
    : undefined;
  const active = new Set<AbortController>();
  const hosts = new Set(
    options.allowedHosts?.map((value) => value.toLowerCase()) ?? [],
  );
  const origins = new Set(options.allowedOrigins ?? []);
  let closing: Promise<void> | undefined;

  const serveStatic = async (
    request: IncomingMessage,
    response: ServerResponse,
    path: string,
  ) => {
    if (!directory || !["GET", "HEAD"].includes(request.method ?? ""))
      return false;
    if (
      path !== "/" &&
      path !== "/index.html" &&
      !/^\/assets\/(?:[a-z0-9._-]+\/)*[a-z0-9._-]+$/i.test(path)
    )
      return false;
    let file: string;
    try {
      file = await realpath(
        resolve(directory, path === "/" ? "index.html" : path.slice(1)),
      );
    } catch {
      return false;
    }
    const rel = relative(directory, file);
    if (
      isAbsolute(rel) ||
      rel === ".." ||
      rel.startsWith("../") ||
      rel.startsWith("..\\")
    )
      return false;
    const mime: Record<string, string> = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".mjs": "text/javascript; charset=utf-8",
      ".bcmap": "application/octet-stream",
      ".pfb": "application/octet-stream",
      ".ttf": "font/ttf",
      ".css": "text/css; charset=utf-8",
      ".woff2": "font/woff2",
      ".woff": "font/woff",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".ico": "image/x-icon",
    };
    const type = mime[extname(file)];
    if (!type) return false;
    const content = await readFile(file);
    response.writeHead(200, {
      "content-type": type,
      "content-length": content.byteLength,
      "cache-control": path.startsWith("/assets/")
        ? "public, max-age=3600"
        : "no-store",
      "content-security-policy":
        "default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    });
    response.end(request.method === "HEAD" ? undefined : content);
    return true;
  };

  const server = createServer((request, response) => {
    const controller = new AbortController();
    active.add(controller);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeout);
    const abort = () => controller.abort();
    request.once("aborted", abort);
    response.once("close", () => {
      if (!response.writableEnded) abort();
    });
    response.setHeader("x-content-type-options", "nosniff");
    response.setHeader("referrer-policy", "no-referrer");
    const requestId = randomUUID();
    const operation = async () => {
      const authority = request.headers.host?.toLowerCase();
      if (!authority || !hosts.has(authority))
        failure("PERMISSION_DENIED", "HTTP Host is not allowed");
      const origin = request.headers.origin;
      if (origin && !origins.has(origin))
        failure("PERMISSION_DENIED", "HTTP Origin is not allowed");
      let path: string;
      try {
        path = new URL(request.url ?? "/", `http://${authority}`).pathname;
      } catch {
        return failure("INVALID_ARGUMENT", "Invalid HTTP request path");
      }
      if (path === "/healthz" && request.method === "GET") {
        json(response, 200, { status: "ok" });
        return;
      }
      if (path === `${rpcPath}/files` || path === `${rpcPath}/parse`) {
        const transport = await options.resolveTransport(request, {
          signal: controller.signal,
        });
        if (!transport)
          failure("UNAUTHENTICATED", "Knowledge request is not authenticated");
        if (path.endsWith("/parse")) {
          if (request.method !== "POST" || !options.parseAttachment)
            failure("NOT_SUPPORTED", "Attachment parsing is unavailable");
          if (
            !/^application\/json(?:\s*;.*)?$/i.test(
              request.headers["content-type"] ?? "",
            )
          )
            failure("INVALID_ARGUMENT", "Parsing requires application/json");
          const input = await body(request, 16_384, controller.signal);
          json(
            response,
            200,
            await options.parseAttachment(
              input as Parameters<
                NonNullable<typeof options.parseAttachment>
              >[0],
              transport,
              controller.signal,
            ),
          );
          return;
        }
        const gateway = await options.resolveAttachments?.(request, {
          signal: controller.signal,
        });
        if (!gateway)
          failure("NOT_SUPPORTED", "Attachment byte transfer is unavailable");
        const token = request.headers["x-knowledge-transfer"];
        if (typeof token !== "string")
          failure(
            "PERMISSION_DENIED",
            "Attachment transfer authority is required",
          );
        if (request.method === "PUT") {
          await gateway.upload(
            token,
            request.iterator({ destroyOnReturn: false }),
            { signal: controller.signal },
          );
          json(response, 200, { uploaded: true });
        } else if (request.method === "GET") {
          const file = await gateway.download(token, {
            signal: controller.signal,
          });
          response.writeHead(200, {
            "content-type": file.mediaType,
            "content-length": file.sizeBytes,
            "cache-control": "no-store",
            "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
          });
          await pipeline(Readable.from(file.body), response, {
            signal: controller.signal,
          });
        } else
          failure("INVALID_ARGUMENT", "Use PUT or GET for attachment bytes");
        return;
      }
      if (path !== rpcPath) {
        if (await serveStatic(request, response, path)) return;
        failure("NOT_FOUND", "Knowledge endpoint was not found");
      }
      if (request.method !== "POST") {
        response.setHeader("allow", "POST");
        json(response, 405, {
          version: 1,
          ok: false,
          error: {
            code: "INVALID_ARGUMENT",
            message: "Use POST for knowledge RPC",
          },
          requestId,
        });
        return;
      }
      if (
        !/^application\/json(?:\s*;.*)?$/i.test(
          request.headers["content-type"] ?? "",
        )
      )
        failure("INVALID_ARGUMENT", "Knowledge RPC requires application/json");
      const transport = await options.resolveTransport(request, {
        signal: controller.signal,
      });
      if (!transport)
        failure("UNAUTHENTICATED", "Knowledge request is not authenticated");
      const input = parseKnowledgeRequest(
        await body(request, limit, controller.signal),
      );
      controller.signal.throwIfAborted();
      const result = parseKnowledgeResponse(
        input.method,
        await transport.request(input, { signal: controller.signal }),
      );
      if (result.ok)
        validateKnowledgeResult(input.method, input.params, result.value);
      if (controller.signal.aborted) return;
      json(response, result.ok ? 200 : statusFor(result.error.code), {
        ...result,
        requestId,
      });
    };
    let onAbort: () => void = () => {};
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () =>
        reject(
          new KnowledgeError({
            code: timedOut ? "TIMEOUT" : "ABORTED",
            message: timedOut
              ? "Knowledge HTTP request timed out; mutation outcome may be unknown"
              : "Knowledge HTTP request stopped; mutation outcome may be unknown",
          }),
        );
      controller.signal.addEventListener("abort", onAbort, { once: true });
    });
    void Promise.race([operation(), aborted])
      .catch((error: unknown) => {
        const info =
          error instanceof KnowledgeError
            ? {
                code: error.code,
                message: error.message,
                ...(error.retryAfterMs !== undefined
                  ? { retryAfterMs: error.retryAfterMs }
                  : {}),
              }
            : undefined;
        const value: KnowledgeResponse = {
          version: 1,
          ok: false,
          error: info ?? {
            code: "INTERNAL_ERROR",
            message: "Knowledge HTTP request failed",
          },
          requestId,
        };
        json(response, statusFor(value.error.code), value);
      })
      .finally(() => {
        clearTimeout(timer);
        active.delete(controller);
        request.removeListener("aborted", abort);
        controller.signal.removeEventListener("abort", onAbort);
      });
  });
  server.requestTimeout = timeout;
  server.headersTimeout = Math.min(timeout, 60_000);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    failure("INTERNAL_ERROR", "Knowledge HTTP server did not bind a TCP port");
  }
  const localHost = ["0.0.0.0", "::"].includes(host) ? "127.0.0.1" : host;
  const authorityFor = (name: string) =>
    `${name.includes(":") && !name.startsWith("[") ? `[${name}]` : name}:${address.port}`;
  const names = new Set([host, address.address, localHost]);
  if (["127.0.0.1", "localhost", "::1", "0.0.0.0", "::"].includes(host)) {
    names.add("127.0.0.1");
    names.add("localhost");
    names.add("::1");
  }
  for (const name of names) {
    const authority = authorityFor(name);
    hosts.add(authority.toLowerCase());
    origins.add(`http://${authority}`);
  }
  const url = `http://${authorityFor(localHost)}`;
  return Object.freeze({
    url,
    rpcEndpoint: `${url}${rpcPath}`,
    address: { host: address.address, port: address.port },
    close() {
      closing ??= new Promise<void>((resolve, reject) => {
        for (const controller of active) controller.abort();
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeIdleConnections();
        server.closeAllConnections();
      });
      return closing;
    },
  });
}
