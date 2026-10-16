import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile, mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { fixture as f } from "./fixture.mjs";
import { createFileHost } from "./file-host.mjs";

// Exercise the production opaque-origin sandbox and the public SDK bridge.
// Only the test host's isolated storage and preview Chat are used.
const root = fileURLToPath(new URL("../../../../../", import.meta.url));
const app = fileURLToPath(new URL("../", import.meta.url));
const previewOnly = process.argv.includes("--preview");
const output = process.env.MEWVIS_FILM_QA_DIR ?? "/tmp/mewvis-film-workshop-qa";
await mkdir(output, { recursive: true });
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
const temporary = await mkdtemp(join(tmpdir(), "film-browser-"));
const modulePath = join(temporary, "sandbox.mjs");
await writeFile(modulePath, compiled.outputFiles[0].text);
const { sandboxDocument } = await import(pathToFileURL(modulePath).href);
await rm(temporary, { recursive: true });
const ui = {
  script: await readFile(join(app, "dist/mewvis/app-ui.js"), "utf8"),
  style: await readFile(join(app, "dist/mewvis/app-ui.css"), "utf8"),
};
const chat = {
  script: await readFile(
    join(root, "apps/client/src/chat/react/dist/application-runtime.js"),
    "utf8",
  ),
  style: await readFile(
    join(root, "apps/client/src/chat/react/dist/application-runtime.css"),
    "utf8",
  ),
};
const document = sandboxDocument(ui, chat, {
  fileResourceSource: "http://127.0.0.1:*",
});
const packed = (
  await import(pathToFileURL(join(app, "dist/mewvis/index.js")).href)
).default;
const tools = [],
  skills = [];
packed.apply({
  tools: { register: (tool) => tools.push(tool) },
  skills: { register: (skill) => skills.push(skill) },
});
assert.deepEqual(
  tools.map((t) => t.name),
  ["film_check_delivery"],
);
assert.equal(skills.length, 1);
const catalog = tools.map(({ name, description, risk }) => ({
  name,
  description,
  risk,
}));
const host = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%;overflow:hidden}iframe{border:0;width:100%;height:100vh;display:block}</style>
<iframe id="app" name="app" title="影视工坊" sandbox="allow-scripts"></iframe><script type="module">
import { createPreviewChat } from "/chat-host.js";
const owner = window.document.getElementById("app"), channel = "mewvis-app-ui-v1";
window.test = { errors: [], calls: [], contexts: [], clipboard: "", failStorage: false, failChat: false, ready: false };
const preview = createPreviewChat({ name: "@mewvis/film-workshop", permissions: ["chat", "application-data", "application-workspaces"], tools: ${JSON.stringify(catalog)}, executeTool: async (name, args) => {
  const response = await fetch("/tool", { method: "POST", body: JSON.stringify({ name, args }) });
  const result = await response.json(); if (result.error) throw new Error(result.error); return result;
} });
const post = message => owner.contentWindow.postMessage({ channel, ...message }, "*");
preview.transport.subscribe(event => post({ type: "chat:snapshot", event }));
window.setTheme = theme => post({ type: "host:theme", theme });
addEventListener("message", async event => {
  if (event.source !== owner.contentWindow || event.data?.channel !== channel) return;
  const message = event.data, reply = result => post({ type: "host:result", id: message.id, result });
  try {
    if (message.type === "application:ready") { test.ready = true; post({ type: "host:init", host: { applicationId: "@mewvis/film-workshop", name: "影视工坊", theme: "light", tools: ${JSON.stringify(catalog)} } }); }
    else if (message.type === "data:request") {
      test.calls.push(message.request.method);
      if (test.failStorage && message.request.method === "storage.setItem" && message.request.params.key.startsWith("film:project:")) { test.failStorage = false; reply({ ok: false, error: { code: "STORAGE_ERROR", message: "测试保存失败" } }); }
      else if (message.request.method.startsWith("storage.")) reply(await (await fetch("/data", { method: "POST", body: JSON.stringify(message.request) })).json());
      else if (message.request.method === "workspaces.selectDirectory") reply({ ok: true, value: null });
      else { const request = structuredClone(message.request); if (request.method === "workspaces.create") delete request.params.path;
        const result = await preview.data.request(request);
        if (request.method === "workspaces.create" && result.ok) await fetch("/workspace", { method: "POST", body: JSON.stringify(result.value) });
        reply(result); }
    } else if (message.type === "chat:request") {
      if (test.failChat) { test.failChat = false; throw new Error("测试助手连接失败"); }
      const result = await preview.transport.request(message.request);
      if (message.request.method === "setContext" && result.result?.ok) test.contexts.push(message.request.input);
      reply(result);
    } else if (message.type === "files:request") {
      const result = await (await fetch("/files", { method: "POST", body: JSON.stringify(message.request) })).json();
      reply(result);
      if (message.request.method === "preview.openDialog" && result.ok) {
        const resource = result.value, dialog = document.createElement("dialog"), image = document.createElement("img"), close = document.createElement("button");
        image.src = resource.resourceUrl; image.style.cssText = "max-width:85vw;max-height:80vh;display:block"; close.textContent = "关闭预览";
        close.onclick = () => dialog.close(); dialog.onclose = () => { post({ type: "files:preview-close", event: { id: resource.id } }); dialog.remove(); }; dialog.append(image, close); document.body.append(dialog); dialog.showModal();
      }
    } else if (message.type === "header:set") reply({ supported: false });
    else if (message.type === "host:clipboard-write") { test.clipboard = message.text; reply({ written: true }); }
    else if (message.type === "tool:execute") reply(await (await fetch("/tool", { method: "POST", body: JSON.stringify({ name: message.toolName, args: message.args }) })).json());
    else if (message.type === "application:error") test.errors.push(message.message);
  } catch (error) { post({ type: "host:result", id: message.id, error: error.message }); }
});
owner.srcdoc = ${JSON.stringify(document).replaceAll("<", "\\u003c")};
</script>`;
const values = new Map(),
  registeredWorkspaces = [];
const fileHost = createFileHost(
  await readFile(join(app, "main/assets/rain-window.jpg")),
);
const server = createServer(async (req, res) => {
  try {
    if (req.url === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(host);
      return;
    }
    if (req.url === "/chat-host.js") {
      res.writeHead(200, { "content-type": "text/javascript" });
      const code = await readFile(
        join(root, "packages/app/dev/dist/chat-host.js"),
        "utf8",
      );
      res.end(
        code
          .replace(
            /const workspaces = \[([\s\S]*?)\];/,
            (_, defaults) =>
              `const workspaces = [${defaults}, ...${JSON.stringify(registeredWorkspaces)}];`,
          )
          .replace(
            "dispatches++;",
            `dispatches++;
        if (turn.input.text.includes("[影视生成:")) {
          const toolCallId = turn.taskId + "-media";
          emit(turn.taskId, { type: "tool_execution_start", toolCallId, toolName: "generate_media", args: { action: "generate", purpose: "image-generation" } });
          await new Promise(resolve => setTimeout(resolve, 1500)); signal.throwIfAborted();
          const result = await (await fetch("/generate", { method: "POST", body: JSON.stringify({ text: turn.input.text }) })).json();
          emit(turn.taskId, { type: "tool_execution_end", toolCallId, toolName: "generate_media", result, isError: false });
          emit(turn.taskId, { type: "done", text: "模拟图片已保存。" }); return;
        }`,
          ),
      );
      return;
    }
    if (req.url.startsWith("/resource/")) {
      const resource = fileHost.resource(req.url.slice("/resource/".length));
      if (!resource) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, {
        "content-type": resource.mimeType,
        "access-control-allow-origin": "*",
      });
      res.end(resource.bytes);
      return;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    const input = JSON.parse(body);
    let result;
    if (req.url === "/workspace") {
      registeredWorkspaces.push(input);
      result = {};
    } else if (req.url === "/files") {
      result = fileHost.request(input);
    } else if (req.url === "/generate") {
      result = fileHost.generate(input.text);
    } else if (req.url === "/data") {
      switch (input.method) {
        case "storage.keys":
          result = [...values.keys()];
          break;
        case "storage.getItem":
          result = values.get(input.params.key) ?? null;
          break;
        case "storage.setItem":
          values.set(input.params.key, structuredClone(input.params.value));
          result = null;
          break;
        case "storage.removeItem":
          values.delete(input.params.key);
          result = null;
          break;
        default:
          throw new Error("Unexpected data method");
      }
      result = { ok: true, value: result };
    } else if (req.url === "/tool") {
      const tool = tools.find((t) => t.name === input.name);
      if (!tool) throw new Error("Unknown tool");
      const value = await tool.execute(input.args);
      result = { value, content: tool.output.render(input.args, value) };
    } else {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(result));
  } catch (error) {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: error.message }));
  }
});
if (previewOnly) {
  const samples = [
    f.exampleProject(),
    f.createProject("夏日回声", "shortDrama"),
    f.createProject("海边来信", "movie"),
  ];
  samples[0].updatedAt = Date.parse("2026-10-11T13:00:00+08:00");
  samples[1].synopsis = "夏日小城，两个久别的朋友重新相遇。";
  samples[1].episodes[0].script =
    "外景 · 小城街道 · 夏日\n两个久别的朋友在树下重逢。";
  samples[1].updatedAt = Date.parse("2026-10-10T13:00:00+08:00");
  samples[2].synopsis = "一封迟到的信，让女孩再次回到海边。";
  samples[2].assets = [
    {
      ...f.blankAsset("scene"),
      name: "海边",
      description: "蓝色海岸与白色浪花",
    },
  ];
  samples[2].updatedAt = Date.parse("2026-10-08T13:00:00+08:00");
  for (const sample of samples) values.set(f.projectKey(sample.id), sample);
}
server.listen(
  previewOnly ? Number(process.env.MEWVIS_FILM_PREVIEW_PORT ?? 5188) : 0,
  "127.0.0.1",
);
await once(server, "listening");
fileHost.port = server.address().port;
if (previewOnly) {
  console.log(
    `Film sandbox preview: http://127.0.0.1:${server.address().port}/ (isolated sample data)`,
  );
  await new Promise(() => {});
}
const playwright = await import(
  process.env.MEWVIS_PLAYWRIGHT_MODULE ?? "playwright"
);
const browser = await playwright.chromium
  .launch({
    headless: true,
    ...(process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH }
      : {}),
  })
  .catch((error) => {
    server.close();
    throw error;
  });
let page;
try {
  page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const open = async () => {
    await page.goto(origin);
    await page.waitForFunction(() => window.test?.ready);
    const frame = page.frame({ name: "app" });
    await frame
      .getByRole("heading", { name: "影视工坊", exact: true })
      .waitFor();
    return frame;
  };
  let frame = await open();
  const stage = async (title) =>
    frame.locator(".film-step-button").filter({ hasText: title }).click();
  const saved = async () =>
    frame.locator(".film-save-status").filter({ hasText: "已保存" }).waitFor();
  const expandDetails = async (title) => {
    const summary = frame.locator("summary").filter({ hasText: title });
    if (!(await summary.evaluate((node) => node.parentElement.open)))
      await summary.click();
  };
  await page.screenshot({ path: join(output, "library-light.png") });
  await frame
    .getByRole("button", { name: "打开示例项目", exact: true })
    .click();
  await frame.getByRole("heading", { name: "雨夜电台", exact: true }).waitFor();
  assert.equal(await frame.locator(".film-step-button").count(), 7);
  assert.equal(
    await frame
      .getByRole("button", { name: "向左查看步骤", exact: true })
      .isVisible(),
    false,
  );
  assert.equal(
    await frame
      .getByRole("button", { name: "向右查看步骤", exact: true })
      .isVisible(),
    false,
  );
  assert.equal(
    await frame.getByLabel("影视创作助手", { exact: true }).isVisible(),
    true,
  );
  assert.equal(
    await frame
      .getByLabel("辅助工具", { exact: true })
      .getByRole("button")
      .count(),
    2,
  );
  assert.equal(await frame.locator(".film-focused-shot").count(), 1);
  const episodeSummary = frame.locator(".film-directory-list summary");
  await episodeSummary.click();
  assert.equal(
    await frame.locator(".film-directory-shot").first().isVisible(),
    false,
  );
  await episodeSummary.click();
  assert.equal(
    await frame.locator(".film-directory-shot").first().isVisible(),
    true,
  );
  await frame.getByLabel("对话内容", { exact: true }).fill("待发送的镜头建议");
  await frame.getByRole("button", { name: "参考资料", exact: true }).click();
  assert.equal(
    await frame
      .getByLabel("当前创作参考", { exact: true })
      .getByRole("textbox")
      .count(),
    0,
  );
  await page.screenshot({ path: join(output, "reference-light.png") });
  await frame.getByRole("button", { name: "创作助手", exact: true }).click();
  assert.equal(
    await frame.getByLabel("对话内容", { exact: true }).inputValue(),
    "待发送的镜头建议",
  );
  await frame.getByLabel("对话内容", { exact: true }).fill("");
  await frame.getByRole("button", { name: /^助手模型：/ }).click();
  assert.equal((await frame.getByRole("menuitemradio").count()) > 0, true);
  await page.keyboard.press("Escape");
  await frame.getByRole("button", { name: /^工具权限：/ }).click();
  assert.equal(await frame.getByRole("menuitemradio").count(), 3);
  await page.keyboard.press("Escape");
  await frame.getByRole("button", { name: "专注模式", exact: true }).click();
  assert.equal(await frame.locator(".film-shot-directory").isVisible(), false);
  await frame.getByRole("button", { name: "专注模式", exact: true }).click();
  assert.equal(
    await frame
      .getByRole("button", { name: "关闭创作助手", exact: true })
      .count(),
    0,
  );
  const readyConversation = async () =>
    frame.waitForFunction(
      () =>
        !document.querySelector('button[aria-label="新建会话"]').disabled &&
        !document.querySelector('textarea[aria-label="对话内容"]').disabled,
    );
  const showHistory = async (count, currentCount = 1) => {
    await frame.getByRole("button", { name: "会话历史", exact: true }).click();
    await frame.waitForFunction(
      (expected) =>
        document.querySelectorAll(".film-history-item").length === expected,
      count,
    );
    assert.equal(
      await frame.locator('.film-history-item[aria-current="true"]').count(),
      currentCount,
    );
  };
  const sendAndStop = async (text) => {
    await frame.getByLabel("对话内容", { exact: true }).fill(text);
    await frame.getByRole("button", { name: "发送消息", exact: true }).click();
    await frame
      .getByRole("heading", { name: "调试台已连接", exact: true })
      .waitFor();
    assert.equal(
      await frame
        .getByRole("button", { name: "会话历史", exact: true })
        .isDisabled(),
      true,
    );
    assert.equal(
      await frame
        .getByRole("button", { name: "新建会话", exact: true })
        .isDisabled(),
      true,
    );
    await frame.getByRole("button", { name: "停止生成", exact: true }).click();
    await readyConversation();
  };
  await readyConversation();
  await showHistory(0, 0);
  await frame.getByText("暂无会话历史", { exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await sendAndStop("整理当前分镜");
  const exampleAssistantKey = [...values.keys()].find((key) =>
    key.startsWith("film:assistant:"),
  );
  const originalChatId = values.get(exampleAssistantKey).chatId;
  await frame
    .getByLabel("对话内容", { exact: true })
    .fill("旧会话的未发送草稿");
  await showHistory(1);
  await page.keyboard.press("Escape");
  await page.evaluate(() => (window.test.failChat = true));
  await frame.getByRole("button", { name: "新建会话", exact: true }).click();
  await frame
    .getByRole("alert")
    .filter({ hasText: "测试助手连接失败" })
    .waitFor();
  assert.equal(
    await frame.getByLabel("对话内容", { exact: true }).inputValue(),
    "旧会话的未发送草稿",
  );
  assert.equal(values.get(exampleAssistantKey).chatId, originalChatId);
  await frame.getByRole("button", { name: "新建会话", exact: true }).click();
  await frame.waitForFunction(
    () =>
      document.querySelector('textarea[aria-label="对话内容"]').value === "",
  );
  await readyConversation();
  const freshChatId = values.get(exampleAssistantKey).chatId;
  assert.notEqual(freshChatId, originalChatId);
  await showHistory(1, 0);
  await page.keyboard.press("Escape");
  await sendAndStop("继续调整镜头节奏");
  await showHistory(2);
  await frame.locator(".film-history-item:not([aria-current])").click();
  await frame.waitForFunction(
    () =>
      document.querySelector('textarea[aria-label="对话内容"]').value ===
      "旧会话的未发送草稿",
  );
  assert.equal(values.get(exampleAssistantKey).chatId, originalChatId);
  await readyConversation();
  await showHistory(2);
  await frame.locator(".film-history-item:not([aria-current])").click();
  await frame.waitForFunction(
    () =>
      document.querySelector('textarea[aria-label="对话内容"]').value === "",
  );
  await readyConversation();
  assert.equal(values.get(exampleAssistantKey).chatId, freshChatId);
  // Reload only the sandbox: host chat records and business storage both survive.
  await page.evaluate(() => {
    const owner = document.getElementById("app");
    owner.srcdoc = owner.srcdoc;
  });
  frame = page.frame({ name: "app" });
  await frame.getByRole("heading", { name: "影视工坊", exact: true }).waitFor();
  await frame
    .getByRole("button", { name: "雨夜电台 · 继续分镜设计", exact: true })
    .click();
  await readyConversation();
  assert.equal(values.get(exampleAssistantKey).chatId, freshChatId);
  await showHistory(2);
  await page.screenshot({ path: join(output, "assistant-history-light.png") });
  await page.keyboard.press("Escape");
  await frame.getByRole("button", { name: "返回作品库", exact: true }).click();
  await frame.getByRole("heading", { name: "继续创作", exact: true }).waitFor();
  await frame.getByRole("button", { name: "新建项目", exact: true }).click();
  await frame.getByLabel("项目名称", { exact: true }).fill("沙箱验收");
  await frame.getByLabel("创作方向", { exact: true }).selectOption("movie");
  await frame.getByRole("button", { name: "创建项目", exact: true }).click();
  await frame.getByRole("heading", { name: "沙箱验收", exact: true }).waitFor();
  await stage("项目设定");
  await frame
    .getByLabel("故事梗概", { exact: true })
    .fill("一位旅人在清晨车站告别。最后一班车带走了未说出口的话。");
  await frame
    .getByLabel("视觉风格", { exact: true })
    .fill("电影质感，清晨柔光与低饱和色彩");
  await stage("剧本创作");
  await frame
    .getByLabel("本集剧本", { exact: true })
    .fill("外景 · 车站 · 清晨\n旅人回头，望向空荡的站台。");
  await frame
    .getByLabel("上传 TXT 或 Markdown 剧本", { exact: true })
    .setInputFiles({
      name: "scene.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("旅人：我们会再见。"),
    });
  await frame.getByRole("button", { name: "追加", exact: true }).click();
  assert.match(
    await frame.getByLabel("本集剧本", { exact: true }).inputValue(),
    /我们会再见/,
  );
  await stage("素材准备");
  await frame.getByRole("button", { name: "添加角色", exact: true }).click();
  await frame.getByLabel("角色名称", { exact: true }).fill("旅人");
  await frame
    .getByLabel("外观与设定", { exact: true })
    .fill("年轻旅人，灰色长风衣，提着旧行李箱");
  await frame.getByRole("button", { name: /^场景/ }).click();
  await frame.getByRole("button", { name: "添加场景", exact: true }).click();
  await frame.getByLabel("场景名称", { exact: true }).fill("清晨车站");
  await frame
    .getByLabel("外观与设定", { exact: true })
    .fill("空荡的旧站台，晨雾与远处列车");
  await stage("分镜设计");
  await frame.getByRole("button", { name: "添加镜头", exact: true }).click();
  await expandDetails("名称、场景与角色");
  await frame.getByLabel("镜头名称", { exact: true }).fill("旅人回头");
  await frame
    .getByLabel("画面内容", { exact: true })
    .fill("旅人转过身，望向站台尽头");
  await frame
    .getByLabel("分镜图片提示词", { exact: true })
    .fill("电影中景，清晨车站，灰色风衣旅人回头");
  const sceneId = await frame
    .getByLabel("场景", { exact: true })
    .locator("option")
    .nth(1)
    .getAttribute("value");
  await frame.getByLabel("场景", { exact: true }).selectOption(sceneId);
  await frame.getByRole("checkbox", { name: "旅人", exact: true }).check();
  await frame.getByLabel("台词", { exact: true }).fill("我们会再见。");
  await frame.getByRole("button", { name: "添加镜头", exact: true }).click();
  await expandDetails("名称、场景与角色");
  await frame.getByLabel("镜头名称", { exact: true }).fill("空站台");
  await frame
    .getByLabel("画面内容", { exact: true })
    .fill("列车驶离，空站台浮出晨雾");
  await frame
    .getByLabel("分镜图片提示词", { exact: true })
    .fill("电影远景，晨雾，空荡的旧站台");
  await frame.getByLabel("时长（秒）", { exact: true }).fill("3");
  await frame.getByRole("button", { name: "镜头操作", exact: true }).click();
  await frame
    .getByRole("menuitem", { name: "上移镜头 2", exact: true })
    .click();
  assert.match(
    await frame.locator(".film-shot-select").first().textContent(),
    /空站台/,
  );
  await page.screenshot({ path: join(output, "storyboard-light.png") });
  await stage("视频生成");
  await frame
    .getByLabel("镜头 1 视频提示词", { exact: true })
    .fill("列车向远方缓慢驶去，固定镜头，晨雾流动");
  assert.equal(
    await frame
      .getByRole("button", { name: "生成视频片段", exact: true })
      .first()
      .isDisabled(),
    true,
  );
  await stage("音画同步");
  await frame.locator(".film-directory-shot").nth(1).click();
  const characterId = await frame
    .getByLabel("镜头 2 说话角色", { exact: true })
    .locator("option")
    .nth(1)
    .getAttribute("value");
  await frame
    .getByLabel("镜头 2 说话角色", { exact: true })
    .selectOption(characterId);
  assert.equal(
    await frame.getByLabel("镜头 2 台词", { exact: true }).inputValue(),
    "我们会再见。",
  );
  assert.equal(
    await frame
      .getByLabel("镜头 2 台词", { exact: true })
      .getAttribute("readonly"),
    "",
  );
  await frame
    .getByLabel("镜头 2 音色备注", { exact: true })
    .fill("年轻男声，轻声告别");
  await frame
    .getByLabel("镜头 2 声音设计", { exact: true })
    .fill("远处火车汽笛与脚步声");
  await stage("预览导出");
  await frame
    .getByRole("button", { name: "检查制作计划", exact: true })
    .click();
  await frame
    .getByText("制作计划检查通过；媒体尚未生成或校验。", { exact: true })
    .waitFor();
  assert.equal(
    await frame
      .getByRole("button", { name: "导出成片", exact: true })
      .isDisabled(),
    true,
  );
  await frame
    .getByRole("button", { name: "复制项目 JSON", exact: true })
    .click();
  await frame.getByText("项目 JSON已复制", { exact: true }).waitFor();
  const exported = f.validateProject(
    JSON.parse(await page.evaluate(() => window.test.clipboard)),
  );
  assert.deepEqual(
    exported.episodes[0].shots.map((s) => s.title),
    ["空站台", "旅人回头"],
  );
  assert.equal(f.deliveryReport(exported, exported.episodes[0]).duration, 8);
  await saved();
  await page.screenshot({ path: join(output, "delivery-light.png") });

  // Failed writes and synchronous validation errors preserve the draft and remain retryable.
  await stage("项目设定");
  await page.evaluate(() => (window.test.failStorage = true));
  await frame
    .getByLabel("视觉风格", { exact: true })
    .fill("低饱和晨光，修订版");
  await frame.getByRole("alert").filter({ hasText: "测试保存失败" }).waitFor();
  assert.equal(
    await frame.getByLabel("视觉风格", { exact: true }).inputValue(),
    "低饱和晨光，修订版",
  );
  await frame.getByRole("button", { name: "保存", exact: true }).click();
  await saved();
  await frame.getByLabel("项目名称", { exact: true }).fill("");
  await frame
    .getByRole("alert")
    .filter({ hasText: "请填写项目名称" })
    .waitFor();
  await frame.getByLabel("项目名称", { exact: true }).fill("沙箱验收");
  await saved();
  await frame
    .getByRole("button", { name: "更多项目操作", exact: true })
    .click();
  await frame.getByRole("menuitem", { name: "添加分集", exact: true }).click();
  await frame
    .getByRole("dialog")
    .getByLabel("分集名称", { exact: true })
    .fill("尾声");
  await frame.getByRole("button", { name: "创建分集", exact: true }).click();
  await frame
    .getByLabel("本集剧本", { exact: true })
    .fill("多年以后，旅人重返车站。");
  await frame.getByRole("button", { name: "返回作品库", exact: true }).click();
  await frame.getByRole("heading", { name: "继续创作", exact: true }).waitFor();
  await frame.getByRole("heading", { name: "继续创作", exact: true }).waitFor();

  // Reload the whole page: the host's storage survives, the app re-reads through the SDK.
  frame = await open();
  await page.evaluate(() => (window.test.failChat = true));
  await frame
    .locator(".film-project-open")
    .filter({ hasText: "沙箱验收" })
    .click();
  await frame
    .getByRole("alert")
    .filter({ hasText: "测试助手连接失败" })
    .waitFor();
  await frame.getByRole("button", { name: "重新连接", exact: true }).click();
  await frame.getByLabel("对话内容", { exact: true }).waitFor();

  await stage("项目设定");
  assert.equal(
    await frame.getByLabel("视觉风格", { exact: true }).inputValue(),
    "低饱和晨光，修订版",
  );
  assert.equal(
    await frame
      .getByLabel("当前分集", { exact: true })
      .locator("option")
      .count(),
    2,
  );
  await stage("分镜设计");
  const resumedEpisode = await frame
    .getByLabel("当前分集", { exact: true })
    .inputValue();
  assert.equal(
    resumedEpisode,
    values.get(`film:view:${exported.id}`).episodeId,
  );
  await frame
    .getByLabel("当前分集", { exact: true })
    .selectOption(exported.episodes[0].id);
  assert.equal(await frame.locator(".film-shot-select").count(), 2);
  assert.match(
    await frame.locator(".film-shot-select").first().textContent(),
    /空站台/,
  );

  await page.screenshot({ path: join(output, "assistant-light.png") });
  await frame
    .getByLabel("对话内容", { exact: true })
    .fill("聊聊晨雾中旅人的情绪");
  await frame.getByRole("button", { name: "发送消息", exact: true }).click();
  await frame
    .getByRole("heading", { name: "调试台已连接", exact: true })
    .waitFor();
  await frame.locator(".film-shot-select").first().click();
  await frame
    .getByLabel("画面内容", { exact: true })
    .fill("列车驶离，晨雾里留下旅人的倒影");
  await saved();
  await frame.getByRole("button", { name: "停止生成", exact: true }).click();
  await frame.getByRole("button", { name: "发送消息", exact: true }).waitFor();
  await page.waitForFunction(() => {
    const latest = window.test.contexts.at(-1);
    return (
      latest &&
      JSON.parse(latest.requestContext).project?.episodes[0].shots[0]
        .description === "列车驶离，晨雾里留下旅人的倒影"
    );
  });
  await readyConversation();
  await frame.getByRole("button", { name: "新建会话", exact: true }).click();
  await frame
    .getByRole("heading", { name: "让每个镜头更有表现力", exact: true })
    .waitFor();
  await readyConversation();
  await showHistory(1, 0);
  await frame.locator(".film-history-item:not([aria-current])").click();
  await frame
    .getByRole("heading", { name: "调试台已连接", exact: true })
    .waitFor();
  await readyConversation();
  await frame.getByRole("button", { name: "创作助手", exact: true }).click();
  await page.evaluate(() => window.setTheme("dark"));
  await frame.waitForFunction(
    () =>
      document.documentElement.dataset.theme === "dark" &&
      getComputedStyle(document.querySelector(".film-app")).backgroundColor ===
        "rgb(23, 23, 32)",
  );
  await page.screenshot({ path: join(output, "storyboard-dark.png") });
  await page.setViewportSize({ width: 375, height: 812 });
  await frame.waitForFunction(() => innerWidth === 375);
  await frame.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  assert.equal(
    await frame.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  assert.equal(await frame.locator(".film-workbench-header").count(), 1);
  assert.equal(
    await frame
      .locator(".film-workbench-header")
      .evaluate((element) => element.getBoundingClientRect().height < 100),
    true,
  );
  assert.equal(
    await frame
      .locator(".film-workbench")
      .evaluate((element) =>
        Math.round(element.getBoundingClientRect().height),
      ),
    812,
  );
  await page.screenshot({ path: join(output, "storyboard-mobile.png") });
  assert.equal(await frame.locator(".film-step-button:visible").count(), 7);
  const rail = frame.locator(".film-seven-steps");
  const singleRow = () =>
    [...document.querySelectorAll(".film-seven-steps .film-step-button")].every(
      (button, _, buttons) =>
        Math.abs(
          button.getBoundingClientRect().top -
            buttons[0].getBoundingClientRect().top,
        ) < 1,
    );
  assert.equal(await frame.evaluate(singleRow), true);
  assert.equal(
    await rail.evaluate((element) => element.scrollWidth > element.clientWidth),
    true,
  );
  const beforeScroll = await rail.evaluate((element) => element.scrollLeft);
  assert.equal(
    await rail.evaluate((element) => getComputedStyle(element).scrollbarWidth),
    "none",
  );
  const rightArrow = frame.getByRole("button", {
    name: "向右查看步骤",
    exact: true,
  });
  const leftArrow = frame.getByRole("button", {
    name: "向左查看步骤",
    exact: true,
  });
  await rightArrow.click();
  await frame.waitForFunction(
    (previous) =>
      document.querySelector(".film-seven-steps").scrollLeft > previous,
    beforeScroll,
  );
  for (let i = 0; i < 6 && (await rightArrow.isEnabled()); i++)
    await rightArrow.click();
  assert.equal(await rightArrow.isDisabled(), true);
  assert.equal(
    await frame
      .getByRole("heading", { name: "分镜设计", exact: true })
      .isVisible(),
    true,
  );
  for (let i = 0; i < 6 && (await leftArrow.isEnabled()); i++)
    await leftArrow.click();
  assert.equal(await leftArrow.isDisabled(), true);
  assert.equal(await rail.evaluate((element) => element.scrollLeft), 0);
  await stage("预览导出");
  await frame.waitForFunction(() => {
    const rail = document.querySelector(".film-seven-steps");
    const active = rail.querySelector('[aria-current="step"]');
    const a = active.getBoundingClientRect(),
      r = rail.getBoundingClientRect();
    return (
      rail.scrollLeft > 0 && a.left >= r.left - 1 && a.right <= r.right + 1
    );
  });
  await stage("项目设定");
  await frame.waitForFunction(
    () => document.querySelector(".film-seven-steps").scrollLeft < 1,
  );
  await stage("分镜设计");
  await page.setViewportSize({ width: 1024, height: 768 });
  await frame.getByRole("button", { name: "创作助手", exact: true }).click();
  assert.equal(await frame.evaluate(singleRow), true);
  assert.equal(
    await rail.evaluate((element) => element.scrollWidth > element.clientWidth),
    true,
  );
  await page.setViewportSize({ width: 375, height: 812 });
  await frame.getByRole("button", { name: "创作助手", exact: true }).click();
  assert.equal(
    await frame.getByLabel("影视创作助手", { exact: true }).isVisible(),
    true,
  );
  assert.equal(
    await frame.locator(".film-assistant").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return rect.x === 0 && rect.y > 0 && rect.right <= innerWidth - 44;
    }),
    true,
  );
  await frame.getByRole("button", { name: "参考资料", exact: true }).click();
  assert.equal(
    await frame.getByLabel("当前创作参考", { exact: true }).isVisible(),
    true,
  );
  await frame.getByRole("button", { name: "创作助手", exact: true }).click();
  await frame.getByRole("button", { name: "会话历史", exact: true }).click();
  await frame.locator(".film-history-item").first().waitFor();
  await page.screenshot({ path: join(output, "assistant-history-mobile.png") });
  assert.equal(
    await frame.locator(".film-history-menu").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return rect.x >= 0 && rect.right <= innerWidth;
    }),
    true,
  );
  await page.keyboard.press("Escape");
  await frame.getByRole("button", { name: "创作助手", exact: true }).click();
  await frame.getByRole("button", { name: "返回作品库", exact: true }).click();
  await frame.getByRole("heading", { name: "继续创作", exact: true }).waitFor();

  // Imports create independent projects and keep originals; malformed imports leave the library intact.
  await frame.getByLabel("上传影视项目 JSON", { exact: true }).setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version":9}'),
  });
  await frame
    .getByRole("alert")
    .filter({ hasText: "不支持的影视项目格式或版本" })
    .waitFor();
  assert.equal(await frame.locator(".film-project-card").count(), 2);
  exported.title = "导入副本";
  await frame.getByLabel("上传影视项目 JSON", { exact: true }).setInputFiles({
    name: "film.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(exported)),
  });
  await frame.getByRole("heading", { name: "导入副本", exact: true }).waitFor();
  await frame.getByRole("button", { name: "返回作品库", exact: true }).click();
  await frame.getByRole("heading", { name: "继续创作", exact: true }).waitFor();
  assert.equal(await frame.locator(".film-project-card").count(), 3);
  await frame
    .getByRole("button", { name: "删除项目 导入副本", exact: true })
    .click();
  await frame.getByRole("button", { name: "确认删除", exact: true }).click();
  await frame.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(await frame.locator(".film-project-card").count(), 2);
  assert.ok(values.has(f.projectKey(exported.id)));
  assert.deepEqual(await page.evaluate(() => window.test.errors), []);
  assert.deepEqual(errors, []);
  console.log(
    `Browser smoke passed: seven stages, persistence, recovery, Chat connection, imports, light/dark/mobile. Screenshots: ${output}`,
  );
} catch (error) {
  await page?.screenshot({ path: join(output, "failure.png") });
  console.error(
    (await page?.frame({ name: "app" })?.locator("body").innerText())?.slice(
      0,
      12000,
    ),
  );
  console.error(await page?.evaluate(() => window.test.errors));
  throw error;
} finally {
  await browser.close();
  server.close();
  await once(server, "close");
}
