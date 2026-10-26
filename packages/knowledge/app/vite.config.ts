import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
  root: fileURLToPath(new URL("./web/", import.meta.url)),
  plugins: [tailwindcss()],
  esbuild: { jsx: "automatic" },
  build: {
    outDir: fileURLToPath(new URL("./dist/client/", import.meta.url)),
    emptyOutDir: true,
  },
});
