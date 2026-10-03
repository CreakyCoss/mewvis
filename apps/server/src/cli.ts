import {
  APP_DATA_DIR_NAME,
  APP_DISPLAY_NAME,
  PRODUCT_CONFIG,
  envName,
} from "@mewvis/product-config";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { startServer } from "./server.js";
import { ServiceError } from "./shared/validation.js";

const desktop = process.argv.includes("--desktop");
const web = process.argv.includes("--web");
if (desktop && web) throw new Error("--desktop 和 --web 不能同时使用");
const unknown = process.argv
  .slice(2)
  .filter((arg) => !["--desktop", "--web", "--help"].includes(arg));
if (unknown.length) throw new Error(`未知参数：${unknown.join(", ")}`);
if (process.argv.includes("--help")) {
  console.log(`${APP_DISPLAY_NAME} Node Server (loopback only)
Usage: node cli.js [--desktop | --web]
  ${PRODUCT_CONFIG.envPrefix}_SERVER_PORT       Port, default 1422 (desktop uses a free port)
  ${PRODUCT_CONFIG.envPrefix}_WEB_PORT          Web mode port, default 4173
  ${PRODUCT_CONFIG.envPrefix}_SERVER_WEB_ROOT   Built React page directory for --web
  ${PRODUCT_CONFIG.envPrefix}_SERVER_TOKEN      Bearer token; generated when omitted
  ${PRODUCT_CONFIG.envPrefix}_SERVER_DATA_DIR   Shared data root, default ~/${APP_DATA_DIR_NAME}
  ${PRODUCT_CONFIG.envPrefix}_SERVER_RESOURCES  Packaged Runtime, protocol and product resources
Desktop mode writes a private readiness message to stdout and closes on stdin EOF.`);
} else {
  let parentGone = false;
  let server: Awaited<ReturnType<typeof startServer>> | undefined;
  let closing: Promise<void> | undefined;
  const shutdown = () => {
    parentGone = true;
    if (!server) return;
    closing ??= server.close();
    void closing.then(
      () => {
        if (desktop) process.exit(0);
      },
      (error) => {
        console.error(error);
        process.exitCode = 1;
        if (desktop) process.exit(1);
      },
    );
  };
  if (desktop) {
    process.stdin.resume();
    process.stdin.once("end", shutdown);
    process.stdin.once("error", shutdown);
  }
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  try {
    const port = Number(
      web
        ? (process.env[envName("WEB_PORT")] ?? 4173)
        : (process.env[envName("SERVER_PORT")] ?? (desktop ? 0 : 1422)),
    );
    if (!Number.isInteger(port) || port < 0 || port > 65535)
      throw new Error(
        `${web ? envName("WEB_PORT") : envName("SERVER_PORT")} 不合法`,
      );
    const token =
      process.env[envName("SERVER_TOKEN")] ?? randomBytes(32).toString("hex");
    // Only desktop's known bundled-page origins and its exact development origin may use CORS.
    const allowedOrigins = desktop
      ? [
          "tauri://localhost",
          "http://tauri.localhost",
          "https://tauri.localhost",
        ]
      : [];
    const devOrigin = process.env[envName("DESKTOP_DEV_ORIGIN")];
    if (desktop && devOrigin) {
      const parsed = new URL(devOrigin);
      if (
        parsed.protocol !== "http:" ||
        !["localhost", "127.0.0.1"].includes(parsed.hostname) ||
        parsed.origin !== devOrigin
      )
        throw new Error("Invalid desktop development origin");
      allowedOrigins.push(devOrigin);
    }
    const resources = process.env[envName("SERVER_RESOURCES")];
    const webRoot = web
      ? (process.env[envName("SERVER_WEB_ROOT")] ??
        (resources
          ? join(resources, "web")
          : fileURLToPath(new URL("../../client/dist/", import.meta.url))))
      : undefined;
    server = await startServer({ port, token, allowedOrigins, webRoot });
    if (parentGone) shutdown();
    else if (desktop)
      process.stdout.write(
        JSON.stringify({ type: "ready", url: server.url, token }) + "\n",
      );
    else if (web) console.log(`${APP_DISPLAY_NAME} Web: ${server.url}`);
    else {
      console.log(`${APP_DISPLAY_NAME} Node Server: ${server.url}`);
      if (!process.env[envName("SERVER_TOKEN")])
        console.log(`Session token: ${token}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    if (desktop) {
      // Only send a stable code across the private startup channel. Raw errors
      // may contain credentials or database details and belong in stderr.
      const code =
        error instanceof ServiceError && error.code === "SERVER_DATA_IN_USE"
          ? error.code
          : "STARTUP_FAILED";
      await new Promise<void>((resolve) => {
        process.stdout.write(
          JSON.stringify({ type: "error", code }) + "\n",
          () => resolve(),
        );
      });
    }
    process.exit(1);
  }
}
