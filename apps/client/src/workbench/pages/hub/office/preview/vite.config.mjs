import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const clientRoot = fileURLToPath(new URL("../../../../../../", import.meta.url));
const projectRoot = fileURLToPath(new URL("../../../../../../../../", import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL("./", import.meta.url)),
  plugins: [react()],
  resolve: {
    alias: {
      "@": `${clientRoot}/src`,
      "@office-tokens": `${projectRoot}/packages/design-system/tokens.css`,
    },
  },
  server: {
    host: "127.0.0.1",
    port: 4188,
    strictPort: true,
    fs: { allow: [projectRoot] },
  },
  build: { outDir: "/tmp/isle-office-preview-build", emptyOutDir: true },
});
