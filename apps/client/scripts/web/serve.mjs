import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { startServer } from "../../../server/dist/server.js";
import { webBackendConfig } from "./backend-proxy.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const token = randomBytes(32).toString("hex");
let backend;
let web;
let closing;
let closeWeb;
function close() {
  return (closing ??= (async () => {
    try {
      await backend?.close();
    } finally {
      await closeWeb?.();
    }
  })());
}
// Vite installs its own SIGTERM/stdio handlers and exits after server.close().
// Its close path must await the backend as well, otherwise workers can be orphaned.
function ownLifecycle(server) {
  web = server;
  closeWeb = server.close.bind(server);
  server.close = close;
}

try {
  backend = await startServer({ token, port: Number(process.env.MEWVIS_SERVER_PORT ?? 1422) });
  const config = {
    ...webBackendConfig(backend.url, token),
    root,
    configFile: fileURLToPath(new URL("../../vite.config.ts", import.meta.url)),
  };
  if (process.env.MEWVIS_WEB_PORT) {
    const port = Number(process.env.MEWVIS_WEB_PORT);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("MEWVIS_WEB_PORT 不合法");
    config.server.port = port;
  }
  ownLifecycle(await createServer(config));
  await web.listen();
  web.printUrls();
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => {
      process.exitCode = 0;
      void close().then(
        () => process.exit(0),
        (error) => {
          console.error(error);
          process.exit(1);
        },
      );
    });
} catch (error) {
  await close();
  console.error(error);
  process.exitCode = 1;
}
