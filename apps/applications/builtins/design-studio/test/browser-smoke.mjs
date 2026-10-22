import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { createFixture } from "./fixture.mjs";

const app = fileURLToPath(new URL("../", import.meta.url));
const repositoryRoot = fileURLToPath(
  new URL("../../../../../", import.meta.url),
);
const fixture = await createFixture();
const compiled = await build({
  entryPoints: [
    join(
      repositoryRoot,
      "apps/client/src/workbench/pages/applications/sandbox-document.ts",
    ),
  ],
  bundle: true,
  write: false,
  format: "esm",
  target: "es2022",
  plugins: [
    {
      name: "theme-tokens",
      setup(builder) {
        builder.onResolve({ filter: /tokens\.css\?raw$/ }, () => ({
          path: join(repositoryRoot, "packages/design-system/tokens.css"),
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
const modulePath = join(fixture.root, "sandbox.mjs");
await writeFile(modulePath, compiled.outputFiles[0].text);
const { sandboxDocument } = await import(pathToFileURL(modulePath).href);
const document = sandboxDocument({
  script: await readFile(join(app, "dist/mewvis/app-ui.js"), "utf8"),
  style: await readFile(join(app, "dist/mewvis/app-ui.css"), "utf8"),
});
const html = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%;overflow:hidden}iframe{width:100%;height:100%;border:0;display:block}</style><iframe name="app" title="设计画布" sandbox="allow-scripts"></iframe><script>
const owner=document.querySelector('iframe'),channel='mewvis-app-ui-v1';
window.test={errors:[],calls:[]};
addEventListener('message',async event=>{
 if(event.source!==owner.contentWindow||event.data?.channel!==channel)return;
 const m=event.data,post=message=>owner.contentWindow.postMessage({channel,...message},'*');
 try{
  if(m.type==='application:ready')post({type:'host:init',host:{application:{id:'@mewvis/design-studio',name:'设计画布',version:'0.1.0'},theme:'light',tools:[]}});
  else if(m.type==='data:request'||m.type==='files:request'){
   test.calls.push(m.request.method);
   const response=await fetch(m.type==='data:request'?'/data':'/files',{method:'POST',body:JSON.stringify(m.request)});
   post({type:'host:result',id:m.id,result:await response.json()});
  }else if(m.type==='application:error')test.errors.push(m.message);
 }catch(error){post({type:'host:result',id:m.id,error:error.message});}
});
owner.srcdoc=${JSON.stringify(document).replaceAll("<", "\\u003c")};
</script>`;
const server = createServer(async (request, response) => {
  try {
    if (request.url === "/data" || request.url === "/files") {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      const result = await (request.url === "/data"
        ? fixture.dataRequest(body)
        : fixture.fileRequest(body));
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(result));
    } else {
      response.writeHead(200, { "Content-Type": "text/html;charset=utf-8" });
      response.end(html);
    }
  } catch (error) {
    response.writeHead(500);
    response.end(error.message);
  }
});
const preview = process.argv.includes("--preview");
server.listen(
  preview ? Number(process.env.MEWVIS_DESIGN_PREVIEW_PORT || 5189) : 0,
  "127.0.0.1",
);
await once(server, "listening");
const origin = `http://127.0.0.1:${server.address().port}`;
if (preview) {
  console.log(
    `Design sandbox preview: ${origin} (isolated temporary workspaces)`,
  );
  process.once("SIGINT", () => {
    server.close();
    void fixture.close().finally(() => process.exit(0));
  });
  await new Promise(() => {});
}

let browser, page;
try {
  const { chromium } = await import(
    process.env.MEWVIS_PLAYWRIGHT_MODULE || "playwright"
  );
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH }
      : {}),
  });
  page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  const errors = [];
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => errors.push(error.message));
  const wait = async (condition) => {
    const deadline = Date.now() + 15000;
    while (!(await condition())) {
      if (Date.now() > deadline) throw new Error("浏览器验收等待超时");
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
  };
  const output =
    process.env.MEWVIS_DESIGN_QA_DIR || "/tmp/mewvis-design-studio-qa";
  await mkdir(output, { recursive: true });
  await page.goto(origin);
  const frame = page.frameLocator('iframe[name="app"]');
  await wait(() =>
    frame.getByRole("button", { name: "刷新列表", exact: true }).isEnabled(),
  );
  assert.equal(await frame.locator("canvas").count(), 0);
  const emptyWorkspace = frame.getByRole("region", {
    name: "还没有设计工作区",
  });
  await emptyWorkspace.waitFor();
  await page.screenshot({ path: join(output, "workspaces.png") });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: join(output, "workspaces-compact.png") });
  assert.ok(
    await frame
      .locator("html")
      .evaluate((root) => root.scrollWidth <= root.clientWidth),
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await emptyWorkspace
    .getByRole("button", { name: "新增工作区", exact: true })
    .click();
  await frame
    .getByRole("textbox", { name: "设计名称", exact: true })
    .fill("浏览器设计");
  await frame.getByRole("button", { name: "选择目录", exact: true }).click();
  await frame
    .getByRole("button", { name: "创建并开始设计", exact: true })
    .click();
  await frame.locator("canvas").waitFor();
  const workspace = [...fixture.records.values()][0];
  const designPath = join(workspace.path, "design.json");
  const readDesign = async () => JSON.parse(await readFile(designPath, "utf8"));
  await frame
    .getByRole("textbox", { name: "设计名称", exact: true })
    .fill("工作区海报");
  await wait(async () => (await readDesign()).title === "工作区海报");

  // An uncompressed original larger than the old entire-document limit.
  const imageData = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 400;
    const ctx = canvas.getContext("2d"),
      image = ctx.createImageData(400, 400);
    let seed = 7;
    for (let i = 0; i < image.data.length; i += 4) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      image.data[i] = seed & 255;
      image.data[i + 1] = (seed >>> 8) & 255;
      image.data[i + 2] = (seed >>> 16) & 255;
      image.data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    return {
      url: canvas.toDataURL("image/png"),
      pixel: [...ctx.getImageData(12, 14, 1, 1).data],
    };
  });
  const imageBytes = Buffer.from(imageData.url.split(",")[1], "base64");
  const imageDrawn = async () =>
    frame.locator("canvas").evaluate((canvas, expected) => {
      const pixel = canvas.getContext("2d").getImageData(300, 230, 1, 1).data;
      return expected.every(
        (value, index) => Math.abs(pixel[index] - value) <= 2,
      );
    }, imageData.pixel);
  assert.ok(imageBytes.length > 200 * 1024);
  await frame.locator('input[type="file"]').setInputFiles({
    name: "original.png",
    mimeType: "image/png",
    buffer: imageBytes,
  });
  await wait(async () =>
    (await readDesign()).layers.some((layer) => layer.kind === "image"),
  );
  const saved = await readDesign(),
    image = saved.layers.find((layer) => layer.kind === "image");
  assert.match(image.src, /^assets\//);
  assert.deepEqual(await readFile(join(workspace.path, image.src)), imageBytes);
  assert.ok(!JSON.stringify(saved).includes("data:image"));
  await wait(
    async () =>
      (await frame.locator(".ds-status").textContent()) === "已保存到工作区",
  );
  await wait(imageDrawn);
  await page.screenshot({ path: join(output, "editor.png") });
  await frame.getByRole("button", { name: "复制图层", exact: true }).click();
  await wait(
    async () => (await readDesign()).layers.length === saved.layers.length + 1,
  );
  await frame.getByRole("button", { name: "撤销", exact: true }).click();
  await wait(
    async () => (await readDesign()).layers.length === saved.layers.length,
  );
  await frame
    .getByRole("group", { name: "编辑历史" })
    .screenshot({ path: join(output, "history-controls.png") });
  await frame.getByRole("button", { name: "重做", exact: true }).click();
  await wait(
    async () => (await readDesign()).layers.length === saved.layers.length + 1,
  );
  await frame.getByRole("button", { name: "撤销", exact: true }).click();
  await wait(
    async () => (await readDesign()).layers.length === saved.layers.length,
  );

  await frame
    .getByRole("button", { name: "导出高清 PNG", exact: true })
    .click();
  await frame.getByRole("dialog", { name: "文件已保存" }).waitFor();
  const pngPath = await frame.locator(".ds-path").textContent();
  const png = await readFile(pngPath);
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  assert.equal(png.readUInt32BE(16), 3840);
  assert.equal(png.readUInt32BE(20), 2160);
  await frame.getByRole("button", { name: "关闭对话框" }).click();
  await frame.getByRole("button", { name: "导出 HTML", exact: true }).click();
  await frame.getByRole("dialog", { name: "文件已保存" }).waitFor();
  const htmlPath = await frame.locator(".ds-path").textContent();
  const standalone = await readFile(htmlPath, "utf8");
  assert.ok(standalone.includes("data:image/png;base64,"));
  assert.ok(!standalone.includes("blob:"));
  const exported = await browser.newPage();
  exported.on("pageerror", (error) => errors.push(error.message));
  await exported.setContent(standalone);
  await exported.waitForFunction((expected) => {
    const pixel = document
      .querySelector("canvas")
      ?.getContext("2d")
      .getImageData(300, 230, 1, 1).data;
    return (
      pixel &&
      expected.every((value, index) => Math.abs(pixel[index] - value) <= 2)
    );
  }, imageData.pixel);
  await exported.screenshot({ path: join(output, "exported-html.png") });
  await exported.close();
  await frame.getByRole("button", { name: "关闭对话框" }).click();
  await frame.getByRole("button", { name: "返回工作区列表" }).click();
  await frame
    .getByRole("heading", { name: "工作区海报", exact: true })
    .waitFor();
  await page.reload();
  await frame.getByRole("button", { name: "打开设计", exact: true }).click();
  await frame
    .getByRole("button", { name: "选择图层：original.png", exact: true })
    .waitFor();
  await frame.locator("canvas").waitFor();
  await wait(
    async () =>
      await frame
        .locator("canvas")
        .evaluate((canvas) => canvas.width === 1920 && canvas.height === 1080),
  );
  await wait(imageDrawn);

  fixture.state.failWrite = true;
  await frame
    .getByRole("textbox", { name: "设计名称", exact: true })
    .fill("保存重试");
  await frame.getByRole("button", { name: "重试保存", exact: true }).waitFor();
  assert.equal((await readDesign()).title, "工作区海报");
  await frame.getByRole("button", { name: "重试保存", exact: true }).click();
  await wait(async () => (await readDesign()).title === "保存重试");
  await frame.getByRole("button", { name: "选择起始模板" }).click();
  await frame
    .getByRole("button", { name: "Mewvis 项目介绍 用现有推广内容开始" })
    .click();
  await wait(async () => (await readDesign()).title === "Mewvis 项目介绍");
  const templateImage = (await readDesign()).layers.find(
    (layer) => layer.kind === "image",
  );
  assert.ok(await readFile(join(workspace.path, templateImage.src)));
  await frame.getByRole("button", { name: "返回工作区列表" }).click();
  await frame.getByRole("button", { name: "移除", exact: true }).click();
  await frame.getByRole("button", { name: "移除工作区", exact: true }).click();
  await frame
    .getByRole("dialog", { name: "移除工作区" })
    .waitFor({ state: "hidden" });
  await wait(() =>
    frame.getByRole("button", { name: "刷新列表", exact: true }).isEnabled(),
  );
  assert.ok(await readFile(designPath));
  fixture.state.directory = workspace.path;
  await emptyWorkspace
    .getByRole("button", { name: "打开工作区", exact: true })
    .click();
  await frame.locator("canvas").waitFor();
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.screenshot({ path: join(output, "editor-compact.png") });
  assert.deepEqual(errors, []);
  assert.deepEqual(await page.evaluate(() => window.test.errors), []);
  console.log(
    `Design browser smoke passed: workspace creation, original assets, reload, exports, retry, template and reopen. Screenshots: ${output}`,
  );
} catch (error) {
  if (page) {
    await page
      .screenshot({ path: "/tmp/mewvis-design-studio-failure.png" })
      .catch(() => {});
    console.error(
      await page
        .frameLocator('iframe[name="app"]')
        .locator("body")
        .innerText()
        .catch(() => "Unable to read app"),
    );
    console.error(await page.evaluate(() => window.test));
  }
  throw error;
} finally {
  await browser?.close();
  server.close();
  await fixture.close();
}
