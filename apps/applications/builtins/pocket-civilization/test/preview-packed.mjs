import { build } from "esbuild";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Isolated browser QA: real production sandbox + public SDK bridge, memory data only.
const root = fileURLToPath(new URL("../../../../../", import.meta.url));
const app = fileURLToPath(new URL("../", import.meta.url));
const compiled = await build({
  entryPoints: [join(root, "apps/client/src/workbench/pages/applications/sandbox-document.ts")],
  bundle: true, write: false, format: "esm", target: "es2022",
  plugins: [{ name: "theme-css", setup(builder) {
    builder.onResolve({ filter: /tokens\.css\?raw$/ }, () => ({ path: join(root, "packages/design-system/tokens.css"), namespace: "theme" }));
    builder.onLoad({ filter: /.*/, namespace: "theme" }, async ({ path }) => ({ contents: `export default ${JSON.stringify(await readFile(path, "utf8"))}` }));
  } }],
});
const temporary = await mkdtemp(join(tmpdir(), "pocket-sandbox-"));
const modulePath = join(temporary, "sandbox.mjs");
await writeFile(modulePath, compiled.outputFiles[0].text);
const { sandboxDocument } = await import(pathToFileURL(modulePath).href);
await rm(temporary, { recursive: true });
const ui = {
  script: await readFile(join(app, "dist/mewvis/app-ui.js"), "utf8"),
  style: await readFile(join(app, "dist/mewvis/app-ui.css"), "utf8"),
};
const chat = {
  script: await readFile(join(root, "apps/client/src/chat/react/dist/application-runtime.js"), "utf8"),
  style: await readFile(join(root, "apps/client/src/chat/react/dist/application-runtime.css"), "utf8"),
};
const sandbox = sandboxDocument(ui, chat);
const values = new Map();
const host = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>口袋文明 · 打包沙盒预览</title>
<style>html,body{margin:0;height:100%;overflow:hidden}iframe{border:0;width:100%;height:100%;display:block}</style>
<iframe id="app" title="口袋文明" sandbox="allow-scripts"></iframe><script type="module">
import { createPreviewChat } from "/chat-host.js";
const owner = document.getElementById("app"), channel = "mewvis-app-ui-v1";
const preview = createPreviewChat({ name: "@mewvis/pocket-civilization", permissions: ["chat", "application-data", "application-workspaces"], tools: [] });
const post = message => owner.contentWindow.postMessage({channel, ...message}, "*");
preview.transport.subscribe(event => post({type:"chat:snapshot",event}));
addEventListener("message",async event=>{
  if(event.source!==owner.contentWindow || event.data?.channel!==channel)return;
  const message=event.data, reply=result=>post({type:"host:result",id:message.id,result});
  try{
    if(message.type==="application:ready")post({type:"host:init",host:{applicationId:"@mewvis/pocket-civilization",name:"口袋文明",theme:"light",tools:[]}});
    else if(message.type==="data:request")reply(message.request.method.startsWith("storage.") ? await(await fetch("/data",{method:"POST",body:JSON.stringify(message.request)})).json() : await preview.data.request(message.request));
    else if(message.type==="chat:request")reply(await preview.transport.request(message.request));
    else if(message.type==="header:set")reply({supported:false});
    else if(message.type==="application:error")console.error(message.message);
  }catch(error){post({type:"host:result",id:message.id,error:error.message});}
});
owner.srcdoc=${JSON.stringify(sandbox).replaceAll("<", "\\u003c")};
</script></html>`;
const server = createServer(async (request, response) => {
  try {
    if (request.url === "/") { response.writeHead(200, { "content-type": "text/html; charset=utf-8" }); response.end(host); return; }
    if (request.url === "/chat-host.js") { response.writeHead(200, { "content-type": "text/javascript" }); response.end(await readFile(join(root, "packages/app/dev/dist/chat-host.js"))); return; }
    if (request.url === "/favicon.ico") { response.writeHead(204); response.end(); return; }
    if (request.url !== "/data" || request.method !== "POST") { response.writeHead(404); response.end(); return; }
    let body = "";
    for await (const chunk of request) body += chunk;
    const { method, params } = JSON.parse(body);
    let value = null;
    switch (method) {
      case "storage.getItem": value = values.get(params.key) ?? null; break;
      case "storage.setItem": values.set(params.key, structuredClone(params.value)); break;
      case "storage.removeItem": values.delete(params.key); break;
      case "storage.keys": value = [...values.keys()]; break;
      default: throw new Error("Unsupported test data method");
    }
    response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify({ ok: true, value }));
  } catch (error) {
    response.writeHead(500, { "content-type": "application/json" }); response.end(JSON.stringify({ ok: false, error: { code: "TEST_HOST", message: error.message } }));
  }
});
server.listen(5187, "127.0.0.1", () => process.stdout.write("Packed pocket sandbox: http://127.0.0.1:5187/\n"));
