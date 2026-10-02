import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { createClientConfig } from "../client/vite.config";

const config = createClientConfig(
  fileURLToPath(new URL("./src/platform/tauri.ts", import.meta.url)),
  fileURLToPath(new URL("./dist", import.meta.url)),
);
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  ...config,
  define: {
    ...config.define,
    // Tauri provides the target platform, including when cross-compiling from macOS to Windows.
    "import.meta.env.ISLE_TITLE_BAR_STYLE": JSON.stringify(
      (process.env.TAURI_ENV_PLATFORM ?? process.platform) === "darwin"
        ? "overlay"
        : "native",
    ),
  },
  clearScreen: false,
  server: {
    ...config.server,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
  },
});
