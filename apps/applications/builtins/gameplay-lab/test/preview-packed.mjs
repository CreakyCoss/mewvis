import { build } from "esbuild";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Isolated QA host using the production sandbox bridge. No real application data.
const root = fileURLToPath(new URL("../../../../../", import.meta.url));
const app = fileURLToPath(new URL("../", import.meta.url));
const compiled = await build({
  entryPoints: [
    join(
      root,
      "apps/client/src/workbench/pages/applications/sandbox-document.ts",
    ),
  ],
  bundle: true,
  write: false,
  format: "esm",
  target: "es2022",
  plugins: [
    {
      name: "theme-css",
      setup(builder) {
        builder.onResolve({ filter: /tokens\.css\?raw$/ }, () => ({
          path: join(root, "packages/design-system/tokens.css"),
          namespace: "theme",
        }));
        builder.onLoad(
          { filter: /.*/, namespace: "theme" },
          async ({ path }) => ({
            contents: `export default ${JSON.stringify(await readFile(path, "utf8"))}`,
          }),
        );
      },
    },
  ],
});
const temporary = await mkdtemp(join(tmpdir(), "gameplay-sandbox-"));
let sandboxDocument;
try {
  const entry = join(temporary, "sandbox.mjs");
  await writeFile(entry, compiled.outputFiles[0].text);
  ({ sandboxDocument } = await import(pathToFileURL(entry).href));
} finally {
  await rm(temporary, { recursive: true, force: true });
}
const document = sandboxDocument({
  script: await readFile(join(app, "dist/mewvis/app-ui.js"), "utf8"),
  style: await readFile(join(app, "dist/mewvis/app-ui.css"), "utf8"),
});
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>游戏沙盘 · 沉浸式沙盒验收</title>
<style>html,body{height:100%;margin:0;overflow:hidden;background:#f7f8fc}iframe{position:absolute;inset:0;border:0;width:100%;height:100%}header{position:absolute;inset:0 0 auto;height:40px;z-index:2;display:flex;align-items:center;justify-content:space-between;box-sizing:border-box;padding:0 10px;background:#f0f2f8dd;color:#656978;font:12px sans-serif}button{font:inherit;padding:5px 9px;background:#fff;border:1px solid #dde0e9;border-radius:6px;color:#23232d}</style>
<header><span>宿主顶部区域 · 隔离验收样本</span><button id="layout">切换普通布局</button></header><iframe id="app" title="游戏沙盘" sandbox="allow-scripts"></iframe>
<script type="module">
const frame=document.getElementById('app'), toggle=document.getElementById('layout'), channel='mewvis-app-ui-v1';
const theme=new URLSearchParams(location.search).get('theme')==='dark'?'dark':'light';
let immersive=true;
const viewport=()=>({fullscreen:true,immersive,safeArea:{top:immersive?40:0,left:immersive?80:0,right:immersive?88:0,bottom:0}});
const post=message=>frame.contentWindow.postMessage({channel,...message},'*');
toggle.onclick=()=>{immersive=!immersive;frame.style.top=immersive?'0':'40px';frame.style.height=immersive?'100%':'calc(100% - 40px)';toggle.textContent=immersive?'切换普通布局':'切换沉浸式布局';post({type:'host:viewport',viewport:viewport()})};
addEventListener('message',async event=>{
  if(event.source!==frame.contentWindow||event.data?.channel!==channel)return;
  const message=event.data;
  try{
    if(message.type==='application:ready')post({type:'host:init',host:{applicationId:'@mewvis/gameplay-lab',name:'游戏沙盘',theme,tools:[],viewport:viewport()}});
    else if(message.type==='data:request'){
      const response=await fetch('/data',{method:'POST',body:JSON.stringify(message.request)});
      post({type:'host:result',id:message.id,result:await response.json()});
    }else if(message.type==='application:error')console.error(message.message);
  }catch(error){post({type:'host:result',id:message.id,error:error.message})}
});
frame.srcdoc=${JSON.stringify(document).replaceAll("<", "\\u003c")};
</script></html>`;
const values = new Map();
const server = createServer(async (request, response) => {
  try {
    if (
      request.method === "GET" &&
      new URL(request.url, "http://127.0.0.1").pathname === "/"
    ) {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(html);
      return;
    }
    if (request.url === "/favicon.ico") {
      response.writeHead(204);
      response.end();
      return;
    }
    if (request.url !== "/data" || request.method !== "POST") {
      response.writeHead(404);
      response.end();
      return;
    }
    let body = "";
    for await (const chunk of request) {
      body += chunk;
      if (body.length > 2_000_000) throw new Error("QA data too large");
    }
    const { method, params } = JSON.parse(body);
    let value = null;
    if (method === "storage.getItem") value = values.get(params.key) ?? null;
    else if (method === "storage.setItem")
      values.set(params.key, structuredClone(params.value));
    else throw new Error("Unsupported QA storage method");
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, value }));
  } catch (error) {
    response.writeHead(500, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        ok: false,
        error: { code: "QA_HOST", message: error.message },
      }),
    );
  }
});
server.listen(5193, "127.0.0.1", () =>
  process.stdout.write("Packed gameplay sandbox: http://127.0.0.1:5193/\n"),
);
