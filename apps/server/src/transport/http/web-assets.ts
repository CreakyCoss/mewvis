import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { ServiceError } from "../../shared/validation.js";

const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
};

export async function webAssets(directory: string) {
  const root = await realpath(directory).catch(() => {
    throw new Error("Web 构建目录不存在，请先运行 pnpm build:web");
  });
  const withinRoot = (path: string) => {
    const name = relative(root, path);
    return name !== ".." && !name.startsWith(`..${sep}`) && !isAbsolute(name);
  };
  const locate = async (path: string) => {
    try {
      const actual = await realpath(path);
      if (!withinRoot(actual)) return;
      const info = await stat(actual);
      if (info.isFile()) return { actual, info };
    } catch (error) {
      if (
        !["ENOENT", "ENOTDIR"].includes(
          (error as NodeJS.ErrnoException).code ?? "",
        )
      )
        throw error;
    }
  };
  const index = await locate(join(root, "index.html"));
  if (!index)
    throw new Error("Web 构建缺少 index.html，请先运行 pnpm build:web");

  return async (
    request: IncomingMessage,
    response: ServerResponse,
    cookie: string,
  ) => {
    if (!["GET", "HEAD"].includes(request.method ?? ""))
      throw new ServiceError(
        405,
        "METHOD_NOT_ALLOWED",
        "静态页面只接受 GET/HEAD",
      );
    let path: string;
    try {
      path = decodeURIComponent((request.url ?? "/").split("?")[0]);
    } catch {
      throw new ServiceError(400, "INVALID_PATH", "路径编码不合法");
    }
    if (
      !path.startsWith("/") ||
      /[\\\0]/.test(path) ||
      path.split("/").some((part) => part === ".." || part.startsWith("."))
    )
      throw new ServiceError(404, "NOT_FOUND", "文件不存在");
    const target = resolve(root, `.${path}`);
    if (!withinRoot(target))
      throw new ServiceError(404, "NOT_FOUND", "文件不存在");
    let file = await locate(target);
    if (
      !file &&
      (path === "/" ||
        (!extname(path) && request.headers.accept?.includes("text/html")))
    )
      file = index;
    if (!file) throw new ServiceError(404, "NOT_FOUND", "文件不存在");
    const html = extname(file.actual) === ".html";
    const etag = `W/"${file.info.size.toString(16)}-${file.info.mtimeMs.toString(16)}"`;
    response.setHeader(
      "content-type",
      types[extname(file.actual)] ?? "application/octet-stream",
    );
    response.setHeader("cache-control", html ? "no-store" : "no-cache");
    response.setHeader("etag", etag);
    response.setHeader("referrer-policy", "same-origin");
    response.setHeader("cross-origin-resource-policy", "same-origin");
    response.setHeader("x-frame-options", "DENY");
    if (html) response.setHeader("set-cookie", cookie);
    if (!html && request.headers["if-none-match"] === etag) {
      response.writeHead(304);
      response.end();
      return;
    }
    response.setHeader("content-length", file.info.size);
    if (request.method === "HEAD") response.end();
    else await pipeline(createReadStream(file.actual), response);
  };
}
