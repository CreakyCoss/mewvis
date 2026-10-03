import { PRODUCT_KEYS } from "@mewvis/product-config";
import {
  PRODUCT_KEYS,
  PRODUCT_NAMESPACE,
  envName,
  productId,
} from "@mewvis/product-config";
import { randomUUID } from "node:crypto";
import { mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer, searchForWorkspaceRoot } from "vite";
import { packApplication } from "@mewvis/app-dev/tooling";
import { prepareRuntime } from "./runtime.mjs";
import { seedExamples } from "./seed.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// Each preview has an explicit isolated filesystem. No real Mewvis registration or
// user projects are read. Closing/reopening the browser retains these source files.
process.env[envName("WORKSHOP_PREVIEW_ROOT")] = await realpath(
  await mkdtemp(join(tmpdir(), productId("-workshop-preview-"))),
);
await prepareRuntime();
const { manifest } = await packApplication({
  source: root,
  target: PRODUCT_KEYS.applicationManifest,
  outDir: join(root, "dist/preview"),
  quiet: true,
});
const { default: application } = await import(
  pathToFileURL(join(root, "dist/preview/index.js"))
);
const tools = new Map();
const skills = [];
application.apply({
  tools: {
    register(tool) {
      tools.set(tool.name, tool);
    },
  },
  skills: {
    register(skill) {
      skills.push(skill);
    },
  },
});
if (process.argv.includes("--seed")) await seedExamples(tools);
const token = randomUUID();
const endpoint = `/__${PRODUCT_NAMESPACE}_application_tools__`;
const catalog = {
  tools: [...tools.values()].map(({ name, description, risk, parameters }) => ({
    name,
    description,
    risk,
    parameters,
  })),
  skills,
};
const entry = `import { mountPreview } from '@mewvis/app-dev/preview';
import App from ${JSON.stringify(join(root, "main/App.tsx"))};
await mountPreview(App, ${JSON.stringify({ name: manifest.name, displayName: "应用工坊", version: manifest.version, permissions: manifest[PRODUCT_KEYS.applicationManifest].permissions, endpoint, token })});
// Map the explicit filesystem fixture to the SDK's documented memory-chat
// workspaces. Chat stays a simulation; production uses the real workspace IDs.
const original=globalThis[${JSON.stringify(PRODUCT_KEYS.applicationGlobal)}];
const workspaces=new Map();
async function memoryWorkspace(id){
  if(!workspaces.has(id)) workspaces.set(id,original.data.request({version:1,method:'workspaces.create',params:{name:'小应用预览'}}).then(result=>{if(!result.ok)throw new Error(result.error.message);return result.value.id}));
  return workspaces.get(id);
}
Object.defineProperty(globalThis,'mewvisApplication',{configurable:true,value:Object.freeze({...original,chat:{
  subscribe:listener=>original.chat.subscribe(listener),
  request:async request=>{if(request.input?.workspaceId){const workspaceId=await memoryWorkspace(request.input.workspaceId);request={...request,input:{...request.input,workspaceId}};}return original.chat.request(request);}
}})});`;
const server = await createServer({
  configFile: false,
  root,
  publicDir: false,
  esbuild: { jsx: "automatic" },
  resolve: { dedupe: ["react", "react-dom", "@mewvis/app-sdk"] },
  optimizeDeps: { exclude: ["@mewvis/app-dev", "@mewvis/app-sdk/chat/react"] },
  server: {
    host: "127.0.0.1",
    port: Number(process.env[envName("WORKSHOP_PORT")] ?? 5183),
    strictPort: true,
    // Stable visual QA can opt out of reloads from concurrent workspace builds.
    ...(process.env[envName("WORKSHOP_PREVIEW_STABLE")] === "1"
      ? { hmr: false, watch: null }
      : {}),
    fs: { allow: [searchForWorkspaceRoot(root)] },
  },
  plugins: [
    {
      name: "workshop-preview",
      resolveId(id) {
        if (id === "virtual:workshop-preview") return "\0" + id;
      },
      load(id) {
        if (id === "\0virtual:workshop-preview") return entry;
      },
      configureServer(server) {
        server.middlewares.use(endpoint, async (request, response) => {
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.setHeader("Cache-Control", "no-store");
          try {
            if (request.headers[`x-${PRODUCT_NAMESPACE}-dev-token`] !== token)
              throw new Error("预览连接无效，请刷新页面。");
            if (request.method === "GET") {
              response.end(JSON.stringify(catalog));
              return;
            }
            if (request.method !== "POST")
              throw new Error("工具请求必须使用 POST。");
            const chunks = [];
            let size = 0;
            for await (const chunk of request) {
              size += chunk.length;
              if (size > 256 * 1024) throw new Error("工具参数超过大小限制。");
              chunks.push(chunk);
            }
            const { name, args } = JSON.parse(Buffer.concat(chunks).toString());
            const tool = tools.get(name);
            if (!tool) throw new Error("工具不存在。");
            const value = await tool.execute(args);
            response.end(JSON.stringify({ value, content: [], meta: {} }));
          } catch (error) {
            response.statusCode = 400;
            response.end(
              JSON.stringify({
                error: error instanceof Error ? error.message : String(error),
              }),
            );
          }
        });
        return () =>
          server.middlewares.use(async (request, response, next) => {
            if (request.url !== "/" && request.url !== "/index.html")
              return next();
            const html = await server.transformIndexHtml(
              "/",
              '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>应用工坊预览</title></head><body><script type="module" src="/@id/virtual:workshop-preview"></script></body></html>',
            );
            response.setHeader("Content-Type", "text/html; charset=utf-8");
            response.end(html);
          });
      },
    },
  ],
});
await server.listen();
server.printUrls();
console.log(
  `Isolated preview files: ${process.env[envName("WORKSHOP_PREVIEW_ROOT")]}`,
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, async () => {
    await server.close();
    process.exit(0);
  });
