import { defineConfig, type UserConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { fileURLToPath } from "node:url";

export const clientRoot = fileURLToPath(new URL("./", import.meta.url));

export function createClientConfig(platformModule: string, outDir: string): UserConfig {
  return {
    root: clientRoot,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(clientRoot, "src"),
        "@platform-impl": platformModule,
        "@agent-runtime": path.resolve(clientRoot, "../agent-runtime/src"),
        "@engines": path.resolve(clientRoot, "../agent-runtime/src/engines"),
      },
    },

    build: { outDir, emptyOutDir: true },
    server: {
      port: 1420,
      strictPort: true,
    },
  };
}

export default defineConfig(
  createClientConfig(path.resolve(clientRoot, "src/platform/web.ts"), path.resolve(clientRoot, "dist")),
);
