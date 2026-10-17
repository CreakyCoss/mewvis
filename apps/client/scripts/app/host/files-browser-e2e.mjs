import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath, cp } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { startServer } from "../../../../server/dist/server.js";
import { applicationDirectory } from "../../../../server/dist/modules/applications/packages.js";
const clientRoot = fileURLToPath(new URL("../../../", import.meta.url));
const playground = process.argv.includes("--playground");
const root = await realpath(await mkdtemp(join(tmpdir(), "mewvis-file-browser-")));
const webRoot = join(root, "web"),
  bundled = join(root, "builtins");
await mkdir(webRoot);
await mkdir(join(bundled, "file-fixture"), { recursive: true });
await writeFile(
  join(bundled, "file-fixture", "package.json"),
  JSON.stringify({
    name: "@test/file-fixture",
    version: "1.0.0",
    type: "module",
    mewvis: { app: { version: 1, entry: "./index.js" }, permissions: ["workspace-files"], defaultEnabled: true },
  }),
);
await writeFile(join(bundled, "file-fixture", "index.js"), "export default () => {};");
const objects = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
];
const contents = "BT /F1 20 Tf 40 200 Td (Mewvis PDF preview) Tj ET";
objects.push(`<< /Length ${contents.length} >>\nstream\n${contents}\nendstream`);
let pdf = "%PDF-1.4\n",
  offsets = [0];
for (let index = 0; index < objects.length; index++) {
  offsets.push(Buffer.byteLength(pdf));
  pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
}
const startxref = Buffer.byteLength(pdf);
pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
  .slice(1)
  .map((offset) => String(offset).padStart(10, "0") + " 00000 n ")
  .join("\n")}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF`;
const pdfBase64 = Buffer.from(pdf).toString("base64");
const app = await build({
  absWorkingDir: clientRoot,
  stdin: {
    contents: `import {getApplicationFileClient} from '@mewvis/app-sdk/files';
import {getApplicationMediaClient} from '@mewvis/app-sdk/media';
import {FilePreview as SDKFilePreview, FilePreviewDialog as SDKFilePreviewDialog} from '@mewvis/app-sdk/files/react';
import {createElement} from 'react';
import {createRoot} from 'react-dom/client';
(async () => {
const files = getApplicationFileClient(); const output=document.createElement('pre');
window.filePreviewResources=[];addEventListener('message',event=>{const resource=event.data?.result?.value;if(event.source===parent&&resource?.resourceUrl)window.filePreviewResources.push(resource.resourceUrl);});
document.body.innerHTML='<h1>宿主文件接口回归</h1><p>隔离数据 · 真实 SDK 与文件服务</p>'; document.body.append(output);
const show=(value)=>{output.textContent=JSON.stringify(value,null,2)};
const roots=await files.roots();const path=roots.dataPath+'/files';
const sdkContainer=document.createElement('div');sdkContainer.id='sdk-preview';sdkContainer.style.cssText='height:360px;margin-top:16px;border:1px solid #ccc';document.body.append(sdkContainer);
const sdkRoot=createRoot(sdkContainer);
let nativePreview;
const sdkPreview=filePath=>sdkRoot.render(createElement(SDKFilePreview,{filePath,style:{height:360}}));
const sdkDialog=filePath=>sdkRoot.render(createElement(SDKFilePreviewDialog,{filePath,open:true,onOpenChange:open=>{if(!open)sdkRoot.render(null);}}));
const actions={
 '合成媒体示例':async()=>{
   const media=getApplicationMediaClient();const capability=await media.capabilities();if(!capability.available)throw new Error(capability.reason);
   const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAACXBIWXMAAAABAAAAAQBPJcTWAAAAFUlEQVR4nGNgYPhLIhrVMKph2GoAAISu/QH+5zsIAAAAAElFTkSuQmCC'),c=>c.charCodeAt(0));
   const frame=path+'/media-frame.png';await files.writeBinary(frame,png,{overwrite:true});
   let job=await media.compose({requestId:crypto.randomUUID(),width:320,height:180,fps:24,outputFilePath:path+'/render-'+crypto.randomUUID()+'.mp4',clips:[{visual:{kind:'image',filePath:frame},duration:1}]});
   show(job);while(['queued','running','cancelling'].includes(job.status)){await new Promise(resolve=>setTimeout(resolve,250));job=await media.get(job.id);show(job);}
   if(job.status!=='completed')throw new Error(job.error?.message||job.status);
   show({job,info:await media.probe(job.outputFilePath)});sdkPreview(job.outputFilePath);
 },
 '保存并读取': async()=>{await files.writeText(path+'/demo.txt','宿主统一文件保存与预览',{overwrite:true});show(await files.readText(path+'/demo.txt'));},
 '预览文本':()=>files.preview.openDialog({filePath:path+'/demo.txt'}),
 '预览图片':async()=>{await files.writeText(path+'/image.svg','<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#eef0ff"/><circle cx="320" cy="140" r="65" fill="#625ce8"/><text x="320" y="265" text-anchor="middle" font-family="sans-serif" font-size="28" fill="#23232d">Mewvis File Preview</text></svg>',{overwrite:true});return files.preview.openDialog({filePath:path+'/image.svg'});},
 '预览音频':async()=>{const bytes=new Uint8Array(3244), view=new DataView(bytes.buffer); const tag=(offset,text)=>{for(let i=0;i<text.length;i++)bytes[offset+i]=text.charCodeAt(i)};tag(0,'RIFF');view.setUint32(4,bytes.length-8,true);tag(8,'WAVE');tag(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,8000,true);view.setUint32(28,16000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);tag(36,'data');view.setUint32(40,3200,true);for(let i=0;i<1600;i++)view.setInt16(44+i*2,Math.sin(i*2*Math.PI*440/8000)*5000,true);await files.writeBinary(path+'/tone.wav',bytes,{overwrite:true});return files.preview.openDialog({filePath:path+'/tone.wav'});},
 '预览PDF':async()=>{await files.writeBinary(path+'/document.pdf',Uint8Array.from(atob(${JSON.stringify(pdfBase64)}),c=>c.charCodeAt(0)),{overwrite:true});return files.preview.openDialog({filePath:path+'/document.pdf'});},
 '预览PPT':async()=>{await files.writeText(path+'/document.pptx','format not rendered',{overwrite:true});return files.preview.openDialog({filePath:path+'/document.pptx'});},
 'SDK内嵌图片':()=>sdkPreview(path+'/image.svg'),
 'SDK内嵌PDF':()=>sdkPreview(path+'/document.pdf'),
 'SDK内嵌音频':()=>sdkPreview(path+'/tone.wav'),
 'SDK内嵌越界':()=>sdkPreview('/outside/file.txt'),
 'SDK关闭预览':()=>{sdkRoot.render(null);return nativePreview?.close();},
 'SDK弹窗预览':()=>sdkDialog(path+'/image.svg'),
 'SDK原生区域预览':async()=>{sdkRoot.render(null);await new Promise(requestAnimationFrame);nativePreview=await files.preview.open(sdkContainer,{filePath:path+'/image.svg'});await nativePreview.ready;},
 'SDK原生损坏PDF':async()=>{sdkRoot.render(null);await new Promise(requestAnimationFrame);await files.writeText(path+'/broken.pdf','invalid PDF data',{overwrite:true});nativePreview=await files.preview.open(sdkContainer,{filePath:path+'/broken.pdf'});await nativePreview.ready;},
 'SDK原生损坏图片':async()=>{sdkRoot.render(null);await new Promise(requestAnimationFrame);await files.writeText(path+'/broken.png','invalid image data',{overwrite:true});nativePreview=await files.preview.open(sdkContainer,{filePath:path+'/broken.png'});await nativePreview.ready;},
 'SDK内嵌文本':()=>sdkPreview(path+'/demo.txt'),
 'SDK遮挡预览':()=>{const cover=document.createElement('div');cover.id='sdk-cover';cover.style.cssText='position:fixed;inset:0;background:white;z-index:9999';cover.innerHTML='<button>关闭遮挡</button>';cover.onclick=()=>cover.remove();document.body.append(cover);},
 '拒绝越界':async()=>{try{await files.writeText('/outside/file.txt','bad');}catch(error){show({code:error.code});}},
};for(const [name,action] of Object.entries(actions)){const button=document.createElement('button');button.textContent=name;button.onclick=()=>Promise.resolve().then(action).catch(error=>show({error:error.message,code:error.code}));document.body.insertBefore(button,output);}
})().catch(error=>{document.body.textContent=error.message;});`,
    resolveDir: clientRoot,
    loader: "js",
  },
  bundle: true,
  write: false,
  format: "iife",
  target: "es2022",
});
const compiled = await build({
  absWorkingDir: clientRoot,
  entryPoints: ["scripts/app/host/files-browser-fixture.tsx"],
  bundle: true,
  write: false,
  format: "esm",
  outdir: webRoot,
  plugins: [
    {
      name: "raw",
      setup(build) {
        build.onResolve({ filter: /^node:/ }, (args) => ({ path: args.path, external: true }));
        build.onResolve({ filter: /\?url$/ }, async (args) => {
          const result = await build.resolve(args.path.slice(0, -4), {
            resolveDir: args.resolveDir,
            kind: "import-statement",
          });
          return { path: result.path, namespace: "asset", errors: result.errors };
        });
        build.onLoad({ filter: /.*/, namespace: "asset" }, async ({ path }) => {
          const name = path.split(/[\\/]/).at(-1);
          await writeFile(join(webRoot, name), await readFile(path));
          return { contents: `export default ${JSON.stringify("/" + name)}`, loader: "js" };
        });
        build.onResolve({ filter: /\?raw$/ }, async (args) => {
          const result = await build.resolve(args.path.slice(0, -4), {
            resolveDir: args.resolveDir,
            kind: "import-statement",
          });
          return { path: result.path, namespace: "raw", errors: result.errors };
        });
        build.onLoad({ filter: /.*/, namespace: "raw" }, async ({ path }) => ({
          contents: `export default ${JSON.stringify(await readFile(path, "utf8"))}`,
          loader: "js",
        }));
      },
    },
  ],
});
await writeFile(join(webRoot, "fixture.js"), compiled.outputFiles.find((file) => file.path.endsWith(".js")).text);
const stylesheet = join(clientRoot, "src", "App.css");
const style = await postcss([tailwind({ base: clientRoot })]).process(await readFile(stylesheet, "utf8"), {
  from: stylesheet,
});
const css = await build({
  stdin: { contents: style.css, loader: "css", resolveDir: dirname(stylesheet) },
  bundle: true,
  write: false,
  loader: { ".woff2": "dataurl", ".woff": "dataurl" },
});
let application = {
  id: "@test/file-fixture",
  name: "File fixture",
  version: "1.0.0",
  permissions: ["workspace-files"],
  permissionStatus: "declared",
  tools: [],
  agentAccess: {},
  ui: { kind: "sandbox" },
};
let script = app.outputFiles[0].text;
let applicationStyle;
if (playground) {
  const packageRoot = join(clientRoot, "../applications/builtins/chat-playground/dist/mewvis");
  await cp(packageRoot, join(bundled, "chat-playground"), { recursive: true });
  const manifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
  application = {
    ...application,
    id: manifest.name,
    name: manifest.mewvis.displayName,
    permissions: manifest.mewvis.permissions,
  };
  script = await readFile(join(packageRoot, "app-ui.js"), "utf8");
  applicationStyle = await readFile(join(packageRoot, "app-ui.css"), "utf8");
}
const fixtureFiles = join(applicationDirectory(join(root, "data", "apps"), application.id), "files");
const inlinePaths = {
  内嵌文本: join(fixtureFiles, "demo.txt"),
  内嵌图片: join(fixtureFiles, "image.svg"),
  内嵌PDF: join(fixtureFiles, "document.pdf"),
  内嵌越界: join(root, "outside.txt"),
};
await writeFile(
  join(webRoot, "index.html"),
  `<meta charset="utf-8"><style>${css.outputFiles[0].text}</style><div id="root"></div><script>window.fileFixture=${JSON.stringify({ application, script, style: applicationStyle, inlinePaths, playground }).replace(/<\/script/gi, "<\\/script")}</script><script type="module" src="/fixture.js"></script>`,
);
const server = await startServer({
  token: "isolated-file-browser-token-000000",
  port: process.argv.includes("--preview") ? 5190 : 0,
  webRoot,
  runtime: {
    cliPath: fileURLToPath(new URL("../../../../server/test/support/fixtures/runtime.mjs", import.meta.url)),
    dataDir: join(root, "data"),
    bundledApplicationsPath: bundled,
  },
});
if (process.argv.includes("--preview")) {
  console.log(`File preview: ${server.url} (isolated data)`);
  await new Promise(() => {});
}
const playwright = await import(process.env.MEWVIS_PLAYWRIGHT_MODULE ?? "playwright");
async function testPlaygroundFiles(page, frame, engine) {
  const navigate = (name) =>
    frame.getByRole("navigation", { name: "应用能力导航" }).getByRole("button", { name, exact: true });
  await navigate("文件与预览").click();
  await frame.getByRole("heading", { name: "在应用里查看文件", exact: true }).waitFor();
  const inline = frame.getByRole("region", { name: "页面内文件预览" });
  const input = frame.getByLabel("文件完整路径");
  await frame.getByRole("button", { name: "图片示例", exact: true }).click();
  const image = inline.getByRole("img", { name: "image.svg" });
  await image.waitFor();
  await image.evaluate((node) =>
    node.complete && node.naturalWidth > 0
      ? true
      : new Promise((resolve, reject) => {
          node.onload = resolve;
          node.onerror = reject;
        }),
  );
  const imageUrl = await image.getAttribute("src");
  assert.match(await input.inputValue(), /files\/preview-examples\/.+\/image\.svg$/);
  await page.screenshot({ path: `/tmp/mewvis-playground-files-${engine}.png` });
  await frame.getByRole("button", { name: "弹窗预览", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const dialogImage = dialog.getByRole("img", { name: "image.svg" });
  await dialogImage.waitFor();
  const dialogUrl = await dialogImage.getAttribute("src");
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  await page.waitForFunction(async (url) => (await fetch(url)).status === 403, dialogUrl);
  await image.waitFor();
  await frame.getByRole("button", { name: "文本示例", exact: true }).click();
  await inline.getByText(/这段文本通过应用文件 SDK 保存/).waitFor();
  await page.waitForFunction(async (url) => (await fetch(url)).status === 403, imageUrl);
  await frame.getByRole("button", { name: "音频示例", exact: true }).click();
  const audio = inline.locator("audio");
  await audio.waitFor();
  await audio.evaluate((node) =>
    node.readyState >= 1
      ? true
      : new Promise((resolve, reject) => {
          node.onloadedmetadata = resolve;
          node.onerror = reject;
        }),
  );
  assert.equal(await audio.evaluate((node) => node.duration), 1);
  await frame.getByRole("button", { name: "PDF 示例", exact: true }).click();
  await inline.getByRole("img", { name: "PDF 第 1 页" }).waitFor();
  await inline.getByLabel("本页文字内容").filter({ hasText: "Mewvis File Preview" }).waitFor({ state: "attached" });
  await frame.getByRole("button", { name: "弹窗预览", exact: true }).click();
  await dialog.getByRole("img", { name: "PDF 第 1 页" }).waitFor();
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  const upload = frame.getByLabel("选择要导入的本地文件");
  const bytes = Buffer.from("导入本地文件验证\n" + "分块保存的数据。".repeat(25000));
  assert.ok(bytes.length > 256 * 1024);
  await upload.setInputFiles({ name: "large-example.txt", mimeType: "text/plain", buffer: bytes });
  await frame.getByText("已将本地文件副本保存到应用数据目录。", { exact: true }).waitFor();
  await inline.getByText(/导入本地文件验证/).waitFor();
  const importedPath = await input.inputValue();
  assert.match(importedPath, /files\/preview-imports\/.+\/large-example\.txt$/);
  assert.deepEqual(await readFile(importedPath), bytes);
  await upload.setInputFiles({
    name: "document.pptx",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("unsupported office fixture"),
  });
  await inline.getByText("此格式暂不支持内容预览，可以下载原文件查看。").waitFor();
  await input.fill(join(root, "outside.txt"));
  await frame.getByRole("button", { name: "页面内预览", exact: true }).click();
  await frame.getByRole("alert").filter({ hasText: "文件不在当前调用者的数据目录或工作区内" }).waitFor();
  assert.equal(await inline.locator("[data-file-preview]").count(), 0);
  await input.fill(importedPath);
  await input.press("Enter");
  await inline.getByText(/导入本地文件验证/).waitFor();
  await frame.getByRole("button", { name: "图片示例", exact: true }).click();
  await image.waitFor();
  const closedUrl = await image.getAttribute("src");
  await inline.getByRole("button", { name: "关闭预览", exact: true }).click();
  await image.waitFor({ state: "detached" });
  await page.waitForFunction(async (url) => (await fetch(url)).status === 403, closedUrl);
  await frame.getByRole("button", { name: "图片示例", exact: true }).click();
  await image.waitFor();
  const unmountedUrl = await image.getAttribute("src");
  await navigate("能力总览").click();
  await page.waitForFunction(async (url) => (await fetch(url)).status === 403, unmountedUrl);
  await page.setViewportSize({ width: 390, height: 844 });
  await frame.getByRole("button", { name: "展开能力导航", exact: true }).click();
  await navigate("文件与预览").click();
  await frame.getByRole("button", { name: "图片示例", exact: true }).click();
  await image.waitFor();
  assert.equal(await input.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: `/tmp/mewvis-playground-files-mobile-${engine}.png` });
}
try {
  for (const engine of ["chromium", "webkit"]) {
    const browser = await playwright[engine].launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(server.url);
      const frame = page.frameLocator("iframe");
      if (process.argv.includes("--media")) {
        await frame.getByRole("button", { name: "合成媒体示例", exact: true }).click();
        const video = frame.locator("#sdk-preview video");
        await video.waitFor();
        await video.evaluate(node => node.readyState >= 1 ? true : new Promise(resolve => node.addEventListener('loadedmetadata', resolve, {once:true})));
        assert.equal(await video.evaluate(node => node.videoWidth), 320);
        assert.equal(await video.evaluate(node => node.videoHeight), 180);
        assert.deepEqual(errors, []);
        console.log(`${engine}: sandbox media SDK -> authenticated host -> real FFmpeg -> shared file preview passed`);
        continue;
      }
      if (playground) {
        await testPlaygroundFiles(page, frame, engine).catch(async (error) => {
          await page.screenshot({ path: `/tmp/mewvis-playground-files-failed-${engine}.png` });
          console.error((await frame.locator("body").innerText()).slice(0, 3000));
          throw error;
        });
        assert.deepEqual(errors, []);
        console.log(
          `${engine}: packed playground file page, real sample writes, inline/dialog previews, chunked local import, path denial, close/navigation cleanup and mobile layout passed`,
        );
        continue;
      }
      await frame.getByRole("button", { name: "保存并读取" }).click();
      await frame.getByText('"宿主统一文件保存与预览"', { exact: true }).waitFor();
      await frame.getByRole("button", { name: "拒绝越界" }).click();
      await frame.getByText(/PERMISSION_DENIED/).waitFor();
      await frame.getByRole("button", { name: "预览文本" }).click();
      await page.getByRole("dialog").waitFor();
      await page.getByText("宿主统一文件保存与预览", { exact: true }).waitFor();
      await page.getByRole("contentinfo").getByRole("button", { name: "关闭", exact: true }).click();
      await frame.getByRole("button", { name: "预览图片" }).click();
      const image = page.getByRole("img", { name: "image.svg" });
      await image.waitFor();
      await image.evaluate((node) =>
        node.complete && node.naturalWidth > 0
          ? true
          : new Promise((resolve, reject) => {
              node.onload = resolve;
              node.onerror = reject;
            }),
      );
      await page.screenshot({ path: `/tmp/mewvis-file-preview-${engine}.png` });
      await page.keyboard.press("Escape");
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      await frame.getByRole("button", { name: "预览音频" }).click();
      await page.locator("audio").waitFor();
      await page.waitForFunction(() => document.querySelector("audio")?.readyState >= 1);
      assert.ok(await page.locator("audio").evaluate((node) => node.duration > 0));
      await page.locator("audio").click({ position: { x: 20, y: 20 } });
      await page.getByRole("contentinfo").getByRole("button", { name: "关闭", exact: true }).click();
      await frame.getByRole("button", { name: "预览PDF" }).click();
      await page.getByRole("img", { name: "PDF 第 1 页" }).waitFor();
      await page.getByLabel("本页文字内容").filter({ hasText: "Mewvis PDF preview" }).waitFor({ state: "attached" });
      await page.screenshot({ path: `/tmp/mewvis-file-preview-pdf-${engine}.png` });
      await page.keyboard.press("Escape");
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      await frame.getByRole("button", { name: "预览PPT" }).click();
      await page.getByText("此格式暂不支持内容预览，可以下载原文件查看。").waitFor();
      await page.keyboard.press("Escape");
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      await frame.getByRole("button", { name: "SDK内嵌图片", exact: true }).click();
      const sdkSlot = frame.locator("#sdk-preview");
      const sdkImage = sdkSlot.getByRole("img", { name: "image.svg" });
      await sdkImage.waitFor();
      assert.equal(await page.getByRole("dialog").count(), 0);
      assert.ok(await sdkImage.evaluate((node) => node.ownerDocument === document));
      assert.equal(await page.locator('[aria-label="应用内嵌文件预览"]').count(), 0);
      const sdkOldUrl = new URL(await sdkImage.getAttribute("src"), server.url).href;
      await frame.locator("#sdk-preview").evaluate((node) => (node.style.marginTop = "900px"));
      await frame.locator("#sdk-preview").evaluate((node) => {
        if (node.getBoundingClientRect().top < innerHeight) throw new Error("expected offscreen region");
      });
      await frame.locator("#sdk-preview").evaluate((node) => node.scrollIntoView());
      await sdkImage.waitFor();
      const scrolled = await frame.locator("#sdk-preview").boundingBox();
      const scrolledSurface = await sdkSlot.boundingBox();
      assert.ok(Math.abs(scrolled.y - scrolledSurface.y) < 2);
      await frame.locator("#sdk-preview").evaluate((node) => (node.style.marginTop = "16px"));
      await frame.getByRole("button", { name: "SDK遮挡预览", exact: true }).scrollIntoViewIfNeeded();

      await frame.getByRole("button", { name: "SDK遮挡预览", exact: true }).click();
      assert.ok(
        await frame
          .locator("#sdk-cover")
          .evaluate((node) => document.elementFromPoint(innerWidth / 2, innerHeight / 2) === node),
      );
      await frame.getByRole("button", { name: "关闭遮挡", exact: true }).click();
      await sdkImage.waitFor();
      await frame.getByRole("button", { name: "SDK内嵌PDF", exact: true }).click();
      await sdkSlot.getByRole("img", { name: "PDF 第 1 页" }).waitFor();
      await sdkSlot.getByLabel("本页文字内容").filter({ hasText: "Mewvis PDF preview" }).waitFor({ state: "attached" });
      await page.waitForFunction(async (url) => (await fetch(url)).status === 403, sdkOldUrl);
      await page.screenshot({ path: `/tmp/mewvis-file-preview-sdk-${engine}.png` });
      await frame.getByRole("button", { name: "SDK内嵌越界", exact: true }).click();
      await sdkSlot.getByRole("alert").filter({ hasText: "文件不在当前调用者的数据目录或工作区内" }).waitFor();
      await frame.getByRole("button", { name: "SDK内嵌音频", exact: true }).click();
      await sdkSlot.locator("audio").waitFor();
      await sdkSlot.locator("audio").evaluate((node) =>
        node.readyState >= 1
          ? true
          : new Promise((resolve, reject) => {
              node.onloadedmetadata = resolve;
              node.onerror = reject;
            }),
      );
      const sdkAudioUrl = new URL(await sdkSlot.locator("audio").getAttribute("src"), server.url).href;
      await frame.getByRole("button", { name: "SDK关闭预览", exact: true }).click();
      await sdkSlot.locator("audio").waitFor({ state: "detached" });
      await page.waitForFunction(async (url) => (await fetch(url)).status === 403, sdkAudioUrl);
      await frame.getByRole("button", { name: "SDK弹窗预览", exact: true }).click();
      await page.getByRole("dialog").getByRole("img", { name: "image.svg" }).waitFor();
      await page.keyboard.press("Escape");
      await frame.getByRole("button", { name: "SDK关闭预览", exact: true }).click();
      await frame.getByRole("button", { name: "SDK内嵌文本", exact: true }).click();
      await sdkSlot.getByText("宿主统一文件保存与预览", { exact: true }).waitFor();
      await frame.getByRole("button", { name: "SDK关闭预览", exact: true }).click();
      await frame.getByRole("button", { name: "SDK原生区域预览", exact: true }).click();
      await sdkImage.waitFor();
      const nativeUrl = new URL(await sdkImage.getAttribute("src"), server.url).href;
      await frame.getByRole("button", { name: "SDK关闭预览", exact: true }).click();
      await page.waitForFunction(async (url) => (await fetch(url)).status === 403, nativeUrl);
      assert.equal(await sdkSlot.locator(":scope > *").count(), 0);
      await frame.getByRole("button", { name: "SDK原生损坏PDF", exact: true }).click();
      await sdkSlot.getByRole("alert").filter({ hasText: "Invalid PDF" }).waitFor();
      const failedUrl = await sdkSlot.evaluate((node) => node.ownerDocument.defaultView.filePreviewResources.at(-1));
      await page.waitForFunction(async (url) => (await fetch(url)).status === 403, failedUrl);
      await frame.getByRole("button", { name: "SDK关闭预览", exact: true }).click();
      await sdkSlot.getByRole("alert").waitFor({ state: "detached" });
      assert.equal(await sdkSlot.locator(":scope > *").count(), 0);
      await frame.getByRole("button", { name: "SDK原生损坏图片", exact: true }).click();
      await sdkSlot.getByRole("alert").filter({ hasText: "图片无法显示" }).waitFor();
      const brokenImageUrl = await sdkSlot.evaluate((node) =>
        node.ownerDocument.defaultView.filePreviewResources.at(-1),
      );
      await page.waitForFunction(async (url) => (await fetch(url)).status === 403, brokenImageUrl);
      await frame.getByRole("button", { name: "SDK关闭预览", exact: true }).click();
      await sdkSlot.getByRole("alert").waitFor({ state: "detached" });
      const inline = page.getByRole("region", { name: "内嵌文件预览" });
      await inline.getByRole("button", { name: "内嵌文本", exact: true }).click();
      await inline.getByText("宿主统一文件保存与预览", { exact: true }).waitFor();
      assert.equal(await page.getByRole("dialog").count(), 0);
      await inline.getByRole("button", { name: "内嵌图片", exact: true }).click();
      const inlineImage = inline.getByRole("img", { name: "image.svg" });
      await inlineImage.waitFor();
      await page.waitForFunction(() => document.querySelector("section img")?.naturalWidth > 0);
      const oldImageUrl = new URL(await inlineImage.getAttribute("src"), server.url).href;
      await inline.getByRole("button", { name: "内嵌PDF", exact: true }).click();
      await inline.getByRole("img", { name: "PDF 第 1 页" }).waitFor();
      await inline.getByLabel("本页文字内容").filter({ hasText: "Mewvis PDF preview" }).waitFor({ state: "attached" });
      await inline.screenshot({ path: `/tmp/mewvis-file-preview-inline-${engine}.png` });
      await page.waitForFunction(async (url) => (await fetch(url)).status === 403, oldImageUrl);
      assert.equal(await page.getByRole("dialog").count(), 0);
      await inline.getByRole("button", { name: "内嵌越界", exact: true }).click();
      await inline.getByRole("alert").filter({ hasText: "文件不在当前调用者的数据目录或工作区内" }).waitFor();
      assert.equal(await inline.getByRole("img").count(), 0);
      await inline.getByRole("button", { name: "内嵌图片", exact: true }).click();
      await inlineImage.waitFor();
      const finalImageUrl = new URL(await inlineImage.getAttribute("src"), server.url).href;
      await inline.getByRole("button", { name: "关闭内嵌预览", exact: true }).click();
      await page.waitForFunction(async (url) => (await fetch(url)).status === 403, finalImageUrl);
      assert.deepEqual(errors, []);
      console.log(
        `${engine}: real sandbox file writes, path denials, text/image/audio/PDF previews, SDK components and host inline rendering/switching, permission denial, lease cleanup, unsupported formats and close passed`,
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
  await rm(root, { recursive: true, force: true });
}
