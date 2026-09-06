import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, searchForWorkspaceRoot } from "vite";
import react from "@vitejs/plugin-react";
import { validatePlugin } from "./tooling.mjs";
import { createDevHost, toolMiddleware } from "./dev-host.mjs";
import { exists, isHostFile } from "./project.mjs";

export async function createDevServer(
  source,
  { port = 5173, middlewareMode = false } = {},
) {
  const { root, project, manifest } = await validatePlugin(source);
  if (!project?.uiEntry)
    throw new Error("React 开发预览需要 isle.config.ts 和 UI 入口");
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  if (!(await exists(resolve(packageRoot, "dist/chat-ui.js"))))
    throw new Error(
      "插件开发运行时缺失；在 Isle 仓库执行 pnpm --filter desktop build:chat-ui，或安装包含 dist 的工具包",
    );
  const token = randomUUID();
  const runtime = createDevHost(project);
  const entry = "virtual:isle-plugin-entry";
  const endpoint = "/__isle_plugin_tools__";
  const descriptor = {
    name: manifest.name,
    version: manifest.version,
    ...project.config,
    endpoint,
    token,
  };
  const plugin = {
    name: "isle-plugin-dev",
    enforce: "pre",
    resolveId(id) {
      if (id === entry) return "\0" + id;
    },
    load(id) {
      if (id === "\0" + entry)
        return `import { mountPreview } from ${JSON.stringify(resolve(packageRoot, "src/preview.js"))};
import App from ${JSON.stringify(project.uiEntry)};
const dispose = await mountPreview(App, ${JSON.stringify(descriptor)});
if (import.meta.hot) import.meta.hot.dispose(dispose);`;
    },
    transform(_code, id) {
      const path = id.split("?")[0];
      if (isHostFile(root, project, path))
        throw new Error(
          "React 页面不能导入 host 实现，请通过 SDK 调用宿主工具",
        );
    },
    async handleHotUpdate(context) {
      if (context.file.endsWith("isle.config.ts")) {
        context.server.config.logger.warn(
          "插件配置已修改，请手动重新运行 pnpm dev",
        );
        return;
      }
      if (isHostFile(root, project, context.file)) {
        await runtime.reload();
        // Refresh the preview when tool schemas or skill definitions change.
        context.server.ws.send({ type: "full-reload" });
        return [];
      }
      if (
        context.file.startsWith(resolve(root, "main") + "/") &&
        /\.(?:[cm]?[jt]s|json)$/.test(context.file)
      )
        await runtime.reload();
    },
    configureServer(server) {
      server.middlewares.use(endpoint, toolMiddleware(runtime, token));
      server.httpServer?.once("close", () => {
        void runtime.dispose();
      });
      return () =>
        server.middlewares.use(async (req, res, next) => {
          if (req.url !== "/" && req.url !== "/index.html") return next();
          try {
            const html = await server.transformIndexHtml(
              "/",
              `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isle Plugin Preview</title></head><body><script type="module" src="/@id/${entry}"></script></body></html>`,
            );
            res.setHeader("Content-Type", "text/html");
            res.end(html);
          } catch (error) {
            next(error);
          }
        });
    },
  };
  const server = await createServer({
    configFile: false,
    root,
    publicDir: false,
    plugins: [plugin, react()],
    resolve: { dedupe: ["react", "react-dom", "@isle/plugin-sdk"] },
    optimizeDeps: {
      exclude: ["@isle/plugin-dev", "@isle/plugin-sdk/chat/react"],
      ...(middlewareMode ? { noDiscovery: true, include: [] } : {}),
    },
    server: {
      host: "127.0.0.1",
      port,
      strictPort: true,
      middlewareMode,
      ...(middlewareMode ? { hmr: false, watch: null } : {}),
      fs: { allow: [searchForWorkspaceRoot(root), packageRoot] },
    },
  });
  const close = server.close.bind(server);
  server.close = async () => {
    await runtime.dispose();
    await close();
  };
  return server;
}

export async function startDev(source, port = 5173) {
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("开发端口必须是 1–65535 的整数");
  const server = await createDevServer(source, { port });
  try {
    await server.listen();
    server.printUrls();
  } catch (error) {
    await server.close();
    throw error;
  }
  return server;
}
