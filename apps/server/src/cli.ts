import { randomBytes } from "node:crypto";
import { startServer } from "./server.js";

if (process.argv.includes("--help")) {
  console.log(`Isle Agent Server (loopback only)
Usage: pnpm --filter @isle/server start
  ISLE_SERVER_PORT          Port, default 1422 (0 selects a free port)
  ISLE_SERVER_TOKEN         Bearer token; generated for this run when omitted
  ISLE_SERVER_DATA_DIR      Shared config/data root, default ~/.isle-claw
  ISLE_SERVER_RUNTIME_DATA_DIR  Override Tauri runtime data directory
  ISLE_SERVER_RUNTIME_CLI   Existing Runtime CLI build path
  AGENT_RUNTIME_PROFILE_ID Runtime profile, e.g. mock for offline testing
The desktop frontend, Tauri backend, and Runtime engine are not modified.`);
} else {
  const port = Number(process.env.ISLE_SERVER_PORT ?? 1422);
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error("ISLE_SERVER_PORT 不合法");
  const token =
    process.env.ISLE_SERVER_TOKEN ?? randomBytes(32).toString("hex");
  const server = await startServer({ port, token });
  console.log(`Isle Agent Server: ${server.url}`);
  if (!process.env.ISLE_SERVER_TOKEN) console.log(`Session token: ${token}`);
  console.log(
    "Agent and settings APIs ready. Existing desktop UI is not connected to this server.",
  );
  const shutdown = () => {
    void server.close().catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
