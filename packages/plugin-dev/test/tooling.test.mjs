import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
  mkdir,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Readable } from "node:stream";
import { createPlugin, packPlugin, validatePlugin } from "../src/tooling.mjs";
import { checkPlugin } from "../src/check.mjs";
import { createDevHost, toolMiddleware } from "../src/dev-host.mjs";
import { createDevServer } from "../src/dev.mjs";
import { createPreviewChat } from "../dist/chat-host.js";
import { createPluginChatClient } from "@isle/plugin-sdk/chat";

let temporary, source;
const toolName = "example_scaffold_inspect_text";
const skillName = "example-scaffold-text-inspection";
before(async () => {
  temporary = await mkdtemp(join(tmpdir(), "isle-react-scaffold-"));
  source = join(temporary, "my-plugin");
  await createPlugin({
    destination: source,
    name: "@example/scaffold",
    local: true,
  });
  // A real project install outside the monorepo, using the local unpublished packages.
  execFileSync(
    "pnpm",
    ["install", "--prefer-offline", "--registry", "https://registry.npmjs.org"],
    {
      cwd: source,
      stdio: "pipe",
      encoding: "utf8",
    },
  );
});
after(async () => {
  if (temporary) await rm(temporary, { recursive: true, force: true });
});

test("React scaffold checks and builds outside the Isle repository", async () => {
  const readme = await readFile(join(source, "README.md"), "utf8");
  assert.match(readme, /请使用 example-scaffold-text-inspection 技能/);
  assert.doesNotMatch(
    readme,
    /__(?:PLUGIN|TOOL|SKILL)_NAME__|\*\*(?:PLUGIN|SKILL)_NAME\*\*/,
  );
  await checkPlugin(source);
  const { outputRoot, manifest } = await packPlugin({ source, quiet: true });
  assert.equal(manifest.isle.ui.entry, "./isle-ui.js");
  assert.deepEqual(manifest.isle.agentAccess.filesystem.read, [
    { base: "workspace" },
    { base: "pluginData" },
  ]);
  assert.deepEqual(manifest.isle.agentAccess.filesystem.write, [
    { base: "workspace" },
    { base: "pluginData" },
  ]);
  assert.equal(manifest.dependencies, undefined);
  const ui = await readFile(join(outputRoot, "isle-ui.js"), "utf8");
  assert.match(ui, /isle-plugin-root/);
  assert.match(ui, /islePluginChatUI/);
  assert.doesNotMatch(ui, /node:crypto|createHash/);
  const host = await import(pathToFileURL(join(outputRoot, "index.js")).href);
  const registered = [];
  const skills = [];
  host.default.apply({
    tools: { register: (tool) => registered.push(tool) },
    skills: { register: (skill) => skills.push(skill) },
  });
  assert.equal(skills[0].name, skillName);
  assert.equal(skills[0].source, "bundled");
  assert.match(skills[0].content, new RegExp(toolName));
  assert.doesNotMatch(ui, /不要自行编造字符数/);
  const result = await registered[0].execute({ text: "Isle 👋" });
  assert.equal(
    result.sha256,
    createHash("sha256").update("Isle 👋").digest("hex"),
  );
  assert.equal(result.bytes, 9);
  assert.equal(result.runtime, "node");
  await assert.rejects(
    packPlugin({ source, target: "dsh", quiet: true }),
    /不能打包为 DSH/,
  );
  const { readdir } = await import("node:fs/promises");
  assert.ok(
    !(await readdir(outputRoot)).includes("main"),
    "Only compiled entries and assets ship",
  );
});

test("agentAccess uses the protocol schema and rejects typos or invalid ranges before packaging", async () => {
  const file = join(source, "isle.config.ts");
  const original = await readFile(file, "utf8");
  try {
    for (const agentAccess of [
      { filesystem: { raed: "all" } },
      { filesystem: { read: [{ base: "workspace", path: "../secret" }] } },
      { network: { hosts: ["https://example.com"] } },
      { process: { execute: "true" } },
    ]) {
      await writeFile(
        file,
        `export default ${JSON.stringify({ displayName: "Access validation", permissions: ["chat"], ui: false, agentAccess })};`,
      );
      await assert.rejects(validatePlugin(source), /agentAccess/);
    }
  } finally {
    await writeFile(file, original);
  }
});

test("SDK browser entry reports a missing bridge and preserves host errors", async () => {
  const { getPluginHost } = await import("@isle/plugin-sdk/browser");
  assert.throws(getPluginHost, /未连接/);
  globalThis.islePlugin = {
    version: 1,
    executeTool: async () => {
      throw new Error("permission denied");
    },
  };
  try {
    await assert.rejects(
      getPluginHost().executeTool(toolName, {}),
      /permission denied/,
    );
  } finally {
    delete globalThis.islePlugin;
  }
});

test("skills-only hosts build for Isle and DSH and reload definitions without tool access", async () => {
  const configFile = join(source, "isle.config.ts");
  const skillsEntry = join(source, "main/host/skills.ts");
  const config = await readFile(configFile, "utf8");
  const original = await readFile(skillsEntry, "utf8");
  const runtime = createDevHost({ skillsEntry });
  try {
    await writeFile(
      configFile,
      'export default { displayName: "Skills only", permissions: [], ui: false, host: { skills: "./main/host/skills.ts" } };',
    );
    await checkPlugin(source);
    for (const target of ["isle", "dsh"]) {
      const { outputRoot } = await packPlugin({ source, target, quiet: true });
      const { default: plugin } = await import(
        pathToFileURL(join(outputRoot, "index.js")).href + `?skills=${target}`
      );
      assert.deepEqual(plugin.inject, ["skills"]);
      const skills = [];
      plugin.apply({ skills: { register: (skill) => skills.push(skill) } });
      assert.equal(skills[0].name, skillName);
      assert.match(skills[0].content, new RegExp(toolName));
    }
    const catalog = await runtime.describe();
    assert.deepEqual(catalog.tools, []);
    assert.equal(catalog.skills[0].name, skillName);
    await assert.rejects(runtime.execute(skillName, {}), /未注册/);
    await writeFile(
      skillsEntry,
      original.replace("保留空格", "更新后保留空格"),
    );
    await runtime.reload();
    assert.match(
      (await runtime.describe()).skills[0].content,
      /更新后保留空格/,
    );
    await writeFile(skillsEntry, "export default {};");
    await runtime.reload();
    await assert.rejects(runtime.describe(), /技能数组/);
    await writeFile(skillsEntry, original);
    assert.equal((await runtime.describe()).skills[0].name, skillName);
  } finally {
    await runtime.dispose();
    await writeFile(configFile, config);
    await writeFile(skillsEntry, original);
  }
});

test("skill validation rejects invalid definitions and paths before replacing a build", async () => {
  const configFile = join(source, "isle.config.ts");
  const skillsFile = join(source, "main/host/skills.ts");
  const appFile = join(source, "main/App.tsx");
  const [config, skills, app] = await Promise.all(
    [configFile, skillsFile, appFile].map((file) => readFile(file, "utf8")),
  );
  const { outputRoot } = await packPlugin({ source, quiet: true });
  const goodBuild = await readFile(join(outputRoot, "index.js"), "utf8");
  try {
    for (const [content, error] of [
      ["export default {};", /技能数组/],
      [
        'export default [{ name: "x", description: "x", content: " " }];',
        /非空/,
      ],
      [
        'export default [{ name: "../x", description: "x", content: "x" }];',
        /名称必须/,
      ],
      [
        'export default [{ name: "x", description: "x", content: "x", source: 1 }];',
        /source/,
      ],
      [
        'export default [{ name: "x", description: "x", content: "x", invocation: {} }];',
        /invocation/,
      ],
      [
        'export default [{ name: "x", description: "x", content: "x" }, { name: "x", description: "x", content: "y" }];',
        /名称重复/,
      ],
    ]) {
      await writeFile(skillsFile, content);
      await assert.rejects(validatePlugin(source), error);
      await assert.rejects(packPlugin({ source, quiet: true }), error);
      assert.equal(
        await readFile(join(outputRoot, "index.js"), "utf8"),
        goodBuild,
      );
    }
    await writeFile(skillsFile, skills);
    for (const host of [
      {},
      { skills: null },
      { skills: "../outside.ts" },
      { skills: "" },
      { unknown: "./main/host/skills.ts" },
    ]) {
      await writeFile(
        configFile,
        `export default ${JSON.stringify({ displayName: "Invalid", permissions: [], ui: false, host })};`,
      );
      await assert.rejects(validatePlugin(source), /host/);
    }
    const outside = join(temporary, "outside.ts");
    const link = join(source, "main/host/link.ts");
    await writeFile(outside, skills);
    await symlink(outside, link);
    await writeFile(
      configFile,
      'export default { displayName: "Symlink", permissions: [], ui: false, host: { skills: "./main/host/link.ts" } };',
    );
    await assert.rejects(validatePlugin(source), /不能越过/);

    // A custom skills entry outside main/host still belongs to the Node boundary.
    await mkdir(join(source, "backend"));
    await writeFile(join(source, "backend/skills.ts"), skills);
    await writeFile(
      configFile,
      config.replace("./main/host/skills.ts", "./backend/skills.ts"),
    );
    await writeFile(
      appFile,
      'import skills from "../backend/skills"; export default function App() { return <p>{skills[0].content}</p>; }',
    );
    await assert.rejects(checkPlugin(source), /不能导入 host/);
    await assert.rejects(packPlugin({ source, quiet: true }), /不能导入 host/);
    const server = await createDevServer(source, { middlewareMode: true });
    try {
      await assert.rejects(
        server.transformRequest("/backend/skills.ts"),
        /不能导入 host/,
      );
    } finally {
      await server.close();
    }
  } finally {
    await Promise.all(
      [configFile, skillsFile, appFile].map((file, i) =>
        writeFile(file, [config, skills, app][i]),
      ),
    );
  }
});

test("ordinary React JSON and image imports typecheck and embed in the sandbox bundle", async () => {
  const file = join(source, "main/App.tsx");
  const original = await readFile(file, "utf8");
  const image = join(source, "main/icon.svg");
  const data = join(source, "main/data.json");
  await writeFile(
    image,
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><circle cx="5" cy="5" r="4"/></svg>',
  );
  await writeFile(data, '{"title":"asset example"}');
  try {
    await writeFile(
      file,
      'import icon from "./icon.svg"; import data from "./data.json"; export default function App() { return <img src={icon} alt={data.title} />; }',
    );
    await checkPlugin(source);
    const { outputRoot } = await packPlugin({ source, quiet: true });
    assert.match(
      await readFile(join(outputRoot, "isle-ui.js"), "utf8"),
      /data:image\/svg/,
    );
  } finally {
    await writeFile(file, original);
    await rm(image);
    await rm(data);
  }
});

test("Node development tools enforce schema, ownership, timeout and reload", async () => {
  const toolsFile = join(source, "main/host/tools.ts");
  const original = await readFile(toolsFile, "utf8");
  const runtime = createDevHost({ toolsEntry: toolsFile }, 1500);
  try {
    assert.equal((await runtime.describe()).tools[0].name, toolName);
    const result = await runtime.execute(toolName, { text: "Isle 👋" });
    assert.equal(result.value.bytes, 9);
    assert.equal(result.value.sha256.length, 64);
    await assert.rejects(runtime.execute(toolName, {}), /text/);
    await assert.rejects(runtime.execute(toolName, { text: "" }), /characters/);
    await assert.rejects(
      runtime.execute(toolName, { text: "x", extra: true }),
      /additional/,
    );
    await assert.rejects(runtime.execute("other_plugin_tool", {}), /其他插件/);
    await writeFile(
      toolsFile,
      original.replace(
        "characters: Array.from(text).length",
        "characters: 123",
      ),
    );
    await runtime.reload();
    assert.equal(
      (await runtime.execute(toolName, { text: "x" })).value.characters,
      123,
    );
    await writeFile(
      toolsFile,
      original.replace("const text =", "while (true) {}\n    const text ="),
    );
    await runtime.reload();
    await assert.rejects(runtime.execute(toolName, { text: "x" }), /执行超时/);
    await writeFile(toolsFile, original);
    assert.equal(
      (await runtime.execute(toolName, { text: "x" })).value.characters,
      1,
    );
  } finally {
    await runtime.dispose();
    await writeFile(toolsFile, original);
  }
});

test("HTTP tool bridge rejects unauthenticated and oversized requests without opening a port", async () => {
  const runtime = createDevHost({
    toolsEntry: join(source, "main/host/tools.ts"),
    skillsEntry: join(source, "main/host/skills.ts"),
  });
  const handler = toolMiddleware(runtime, "test-token");
  async function call(body, token = "test-token", method = "POST") {
    const req = Readable.from([Buffer.from(body)]);
    req.method = method;
    req.headers = {
      "content-type": "application/json",
      "x-isle-dev-token": token,
    };
    let data;
    const res = {
      statusCode: 200,
      setHeader() {},
      end(value) {
        data = JSON.parse(value);
      },
    };
    await handler(req, res);
    return { status: res.statusCode, ...data };
  }
  try {
    assert.equal(
      (await call(JSON.stringify({ name: toolName, args: { text: "x" } })))
        .value.runtime,
      "node",
    );
    assert.equal((await call("{}", "bad-token")).status, 400);
    assert.match((await call("x".repeat(256 * 1024 + 1))).error, /256 KiB/);
    assert.match(
      (await call(JSON.stringify({ name: toolName, args: [] }))).error,
      /对象/,
    );
    const catalog = await call("", "test-token", "GET");
    assert.equal(catalog.tools[0].name, toolName);
    assert.equal(catalog.skills[0].name, skillName);
    assert.match(catalog.skills[0].content, new RegExp(toolName));
  } finally {
    await runtime.dispose();
  }
});

test("browser code cannot import a host module, even one using browser-compatible APIs", async () => {
  const appFile = join(source, "main/App.tsx");
  const original = await readFile(appFile, "utf8");
  const helper = join(source, "main/host/private.ts");
  await writeFile(
    helper,
    'export const privateValue = "secret host implementation";',
  );
  try {
    await writeFile(
      appFile,
      'import { privateValue } from "./host/private";\n' +
        original.replace("<header>", "<header>{privateValue}"),
    );
    await assert.rejects(checkPlugin(source), /不能导入 host/);
    await assert.rejects(packPlugin({ source, quiet: true }), /不能导入 host/);
  } finally {
    await writeFile(appFile, original);
    await rm(helper);
  }
});

test("plain React and host-only projects need no chat permission; duplicate metadata is rejected", async () => {
  const configFile = join(source, "isle.config.ts"),
    appFile = join(source, "main/App.tsx"),
    pkgFile = join(source, "package.json");
  const originals = await Promise.all(
    [configFile, appFile, pkgFile].map((file) => readFile(file, "utf8")),
  );
  try {
    await writeFile(
      configFile,
      'export default { displayName: "Plain React", permissions: [] };',
    );
    await writeFile(
      appFile,
      "export default function App() { return <h1>Plain React</h1>; }",
    );
    await checkPlugin(source);
    const result = await packPlugin({ source, quiet: true });
    assert.doesNotMatch(
      await readFile(join(result.outputRoot, "isle-ui.js"), "utf8"),
      /islePluginChatUI/,
    );
    await writeFile(
      configFile,
      'export default { displayName: "Host only", permissions: [], ui: false, host: { tools: "./main/host/tools.ts" } };',
    );
    const portable = await packPlugin({ source, target: "dsh", quiet: true });
    assert.equal(portable.manifest.isle.ui, undefined);
    assert.equal(portable.manifest.dsh.bundle.patch, "./cordis.patch.yml");
    const manifest = JSON.parse(originals[2]);
    manifest.isle = {};
    await writeFile(pkgFile, JSON.stringify(manifest));
    await assert.rejects(validatePlugin(source), /重复声明/);
  } finally {
    await Promise.all(
      [configFile, appFile, pkgFile].map((file, index) =>
        writeFile(file, originals[index]),
      ),
    );
  }
});

test("Vite generates the HTML and React entry in middleware mode without starting a server", async () => {
  const server = await createDevServer(source, { middlewareMode: true });
  try {
    assert.equal(server.httpServer, null);
    const entry = await server.transformRequest("virtual:isle-plugin-entry");
    assert.match(entry.code, /mountPreview/);
    assert.match(entry.code, /main\/App.tsx/);
    const app = await server.transformRequest("/main/App.tsx");
    assert.match(app.code, /jsxDEV/);
    const html = await server.transformIndexHtml(
      "/",
      '<html><body><script type="module" src="/@id/virtual:isle-plugin-entry"></script></body></html>',
    );

    assert.match(html, /@vite\/client/);
  } finally {
    await server.close();
  }
});

test("preview chat runs the shared core headlessly with isolated workspaces and cancellable preparation", async () => {
  const host = createPreviewChat({
    name: "@example/scaffold",
    permissions: ["chat", "workspace-files"],
    tools: [],
    executeTool: async () => {
      throw new Error("unused");
    },
  });
  const client = createPluginChatClient(host.transport);
  try {
    const session = await client.createSession({
      workspaceId: "preview",
      sceneId: "test",
      profile: { id: "test", systemPrompt: "Test" },
    });
    host.pause(true);
    const sending = session.send({ text: "stop before dispatch" });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await session.stop();
    host.pause(false);
    await sending;
    assert.equal(host.stats().dispatches, 0);
    assert.equal(session.getSnapshot().phase, "idle");
    const detach = session.subscribe(() => {});
    const second = session.subscribe(() => {});
    await session.send({ text: "追问" });
    await session.reconnect();
    const question = session.getSnapshot().pendingQuestion;
    assert.ok(question, JSON.stringify(session.getSnapshot()));
    await session.answer({ questionId: question.questionId, answer: "简洁" });
    await session.flush();
    await session.reconnect();
    assert.equal(session.getSnapshot().phase, "idle");
    assert.ok(
      (await client.listSessions({ workspaceId: "preview" })).some(
        (item) => item.chatId === session.identity.id,
      ),
    );
    assert.equal(
      (await client.listSessions({ workspaceId: "alternate" })).length,
      0,
    );
    await assert.rejects(
      client.openSession({
        workspaceId: "alternate",
        chatId: session.identity.id,
      }),
      /未找到/,
    );
    detach();
    second();
  } finally {
    client.dispose();
    await host.dispose();
  }
  assert.equal(host.stats().subscriptions, 0);
});
