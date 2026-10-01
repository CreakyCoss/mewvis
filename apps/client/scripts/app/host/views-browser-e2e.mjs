import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { once } from "node:events";
import { build } from "esbuild";

// Use an installed Playwright or the desktop's bundled browser test runtime.
const playwright = await import(process.env.ISLE_PLAYWRIGHT_MODULE ?? "playwright");
const browsers = (process.env.ISLE_VIEW_TEST_BROWSERS ?? "chromium").split(",");
const result = await build({
  entryPoints: [new URL("../../../src/workbench/pages/applications/sandbox-document.ts", import.meta.url).pathname],
  bundle: true,
  write: false,
  format: "esm",
  target: "es2022",
  minify: true,
  plugins: [
    {
      name: "theme-css",
      setup(builder) {
        builder.onResolve({ filter: /tokens\.css\?raw$/ }, () => ({
          path: new URL("../../../../../packages/design-system/tokens.css", import.meta.url).pathname,
          namespace: "theme",
        }));
        builder.onLoad({ filter: /.*/, namespace: "theme" }, async ({ path }) => ({
          contents: `export default ${JSON.stringify(await readFile(path, "utf8"))}`,
        }));
      },
    },
  ],
});
const { sandboxDocument } = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
);
const ownerScript = `
window.test = { views: {}, errors: [], calls: [], aborted: [], protocol: [], releases: [] };
addEventListener("message", event => {
  if (event.data?.channel === "isle-embedded-view-v1") test.protocol.push(event.data);
});
window.mount = (id, script = "document.body.textContent = '小应用';") => {
  const container = document.createElement("div");
  container.id = id; container.style.height = "160px"; document.body.append(container);
  const view = isleApplication.views.mount(container, { id, title: id, script, methods: {
    who(params, context) { test.calls.push(context.viewId); return { viewId: context.viewId, params }; },
    echo(params) { return params; },
    bad() { return undefined; },
    rejectNull() { return Promise.reject(null); },
    huge() { return "x".repeat(256 * 1024); },
    slow(_params, context) {
      context.signal.addEventListener("abort", () => test.aborted.push(context.viewId), { once: true });
      return new Promise(resolve => test.releases.push(() => resolve("late result")));
    },
  }, onError: error => test.errors.push(error.message) });
  test.views[id] = view; return view.ready;
};
`;
const pages = new Map();
function hostPage(embeddedViews) {
  const document = sandboxDocument({ script: ownerScript, style: "" }, undefined, { embeddedViews });
  return `<!doctype html><meta charset="utf-8"><iframe id="owner" name="owner" title="Owner" sandbox="allow-scripts" style="width:100%;height:800px"></iframe><script>
const owner = window.document.getElementById("owner");
window.toolCalls = 0;
addEventListener("message", event => {
  if (event.source !== owner.contentWindow || event.data?.channel !== "isle-app-ui-v1") return;
  if (event.data.type === "application:ready") {
    window.ownerReady = true;
    owner.contentWindow.postMessage({ channel: "isle-app-ui-v1", type: "host:init", host: { theme: "light", themeTokens: { "--primary": "#123456" }, tools: [] } }, "*");
  }
  if (event.data.type === "tool:execute") window.toolCalls++;
});
owner.srcdoc = ${JSON.stringify(document).replaceAll("<", "\\u003c")};
</script>`;
}
pages.set("/enabled", hostPage(true));
pages.set("/ordinary", hostPage(false));
const network = [];
const server = createServer((req, res) => {
  if (!pages.has(req.url)) network.push(req.url);
  res.writeHead(pages.has(req.url) ? 200 : 404, { "content-type": "text/html; charset=utf-8" });
  res.end(pages.get(req.url) ?? "blocked resource");
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const origin = `http://127.0.0.1:${server.address().port}`;
try {
  for (const name of browsers) {
    const browser = await playwright[name].launch({
      headless: true,
      ...(process.env[`ISLE_VIEW_TEST_${name.toUpperCase()}_EXECUTABLE`]
        ? { executablePath: process.env[`ISLE_VIEW_TEST_${name.toUpperCase()}_EXECUTABLE`] }
        : {}),
    });
    try {
      const page = await browser.newPage();
      const errors = [];
      page.on("pageerror", (error) => {
        errors.push(error.message);
        if (process.env.ISLE_VIEW_TEST_DEBUG) console.error(`${name}: ${error.stack}`);
      });
      if (process.env.ISLE_VIEW_TEST_DEBUG)
        page.on("console", (message) => console.error(`${name}: ${message.text()} ${JSON.stringify(message.location())}`));
      await page.goto(origin + "/ordinary");
      await page.waitForFunction(() => window.ownerReady);
      let owner = page.frame({ name: "owner" });
      await owner.waitForFunction(() => window.isleApplication?.getHost());
      assert.equal(await owner.evaluate(() => isleApplication.views), undefined);
      assert.equal(
        await owner.evaluate(async () => {
          const blocked = new Promise((resolve) =>
            addEventListener("securitypolicyviolation", (e) => {
              if (e.violatedDirective === "frame-src") resolve(true);
            }),
          );
          const frame = document.createElement("iframe");
          frame.src = URL.createObjectURL(new Blob(["<p>must not run</p>"], { type: "text/html" }));
          document.body.append(frame);
          return blocked;
        }),
        true,
      );

      await page.goto(origin + "/enabled");
      await page.waitForFunction(() => window.ownerReady);
      owner = page.frame({ name: "owner" });
      await owner.waitForFunction(() => window.isleApplication?.getHost());
      await owner.evaluate(() => Promise.all([mount("a"), mount("b")]));
      const a = owner.childFrames()[0];
      const b = owner.childFrames()[1];
      assert.deepEqual(await a.evaluate(() => isleEmbeddedView.request("who", { viewId: "b" })), {
        viewId: "a",
        params: { viewId: "b" },
      });
      assert.deepEqual(await b.evaluate(() => isleEmbeddedView.request("who", {})), { viewId: "b", params: {} });
      assert.equal(await a.evaluate(() => typeof window.isleApplication), "undefined");
      assert.equal(
        await a.evaluate(() => {
          try {
            return !!parent.document;
          } catch {
            return false;
          }
        }),
        false,
      );
      assert.match(await a.evaluate(() => isleEmbeddedView.request("constructor").catch((e) => e.message)), /未获授权/);
      assert.match(await a.evaluate(() => isleEmbeddedView.request("bad").catch((e) => e.message)), /有限 JSON/);
      assert.equal(await a.evaluate(() => isleEmbeddedView.request("rejectNull").then(() => "unexpected success", (e) => e.message)), "null");
      assert.match(await a.evaluate(() => isleEmbeddedView.request("huge").catch((e) => e.message)), /256 KiB/);
      assert.match(
        await a.evaluate(() =>
          isleEmbeddedView.request("echo", { value: "x".repeat(256 * 1024) }).catch((e) => e.message),
        ),
        /256 KiB/,
      );
      assert.match(
        await a.evaluate(() => isleEmbeddedView.request("echo", { value: Infinity }).catch((e) => e.message)),
        /有限 JSON/,
      );
      assert.equal(
        await a.evaluate(async (origin) => {
          try {
            await fetch(origin + "/forbidden-fetch");
            return false;
          } catch {
            return true;
          }
        }, origin),
        true,
      );
      assert.equal(
        await a.evaluate(() => {
          const blocked = new Promise((resolve) =>
            addEventListener("securitypolicyviolation", (e) => {
              if (e.violatedDirective === "frame-src") resolve(true);
            }),
          );
          const frame = document.createElement("iframe");
          frame.src = URL.createObjectURL(new Blob(["<p>nested</p>"], { type: "text/html" }));
          document.body.append(frame);
          return blocked;
        }),
        true,
      );

      const tokenA = await owner.evaluate(() => test.protocol.find((message) => message.type === "ready").instance);
      const calls = await owner.evaluate(() => test.calls.length);
      await b.evaluate(
        (instance) =>
          parent.postMessage(
            { channel: "isle-embedded-view-v1", instance, type: "request", id: 100, method: "who", params: {} },
            "*",
          ),
        tokenA,
      );
      await b.evaluate(() =>
        top.postMessage(
          { channel: "isle-app-ui-v1", type: "tool:execute", id: "spoof", toolName: "host", args: {} },
          "*",
        ),
      );
      await b.evaluate(() => isleEmbeddedView.request("echo")); // Round trip drains earlier messages.
      assert.equal(await owner.evaluate(() => test.calls.length), calls);
      assert.equal(await page.evaluate(() => window.toolCalls), 0);

      await a.evaluate(() => {
        window.received = null;
        isleEmbeddedView.subscribe((value) => {
          window.received = value;
        });
      });
      await owner.evaluate(() => test.views.a.postMessage({ selection: "current" }));
      await a.waitForFunction(() => window.received?.selection === "current");
      await page.evaluate(() =>
        document
          .getElementById("owner")
          .contentWindow.postMessage(
            { channel: "isle-app-ui-v1", type: "host:theme", theme: "dark", themeTokens: { "--primary": "#abcdef" } },
            "*",
          ),
      );
      await a.waitForFunction(() => isleEmbeddedView.getHost().theme === "dark");
      assert.equal(
        await a.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--primary")),
        "#abcdef",
      );

      await page.clock.install();
      await b.evaluate(() => {
        window.timeouts = [];
        for (let index = 0; index < 5; index++)
          isleEmbeddedView.request("slow").catch((error) => window.timeouts.push(error.message));
      });
      await owner.waitForFunction(() => test.releases.length === 4);
      assert.match(await b.evaluate(() => window.timeouts[0]), /并发请求过多/);
      await page.clock.fastForward(31_000);
      await b.waitForFunction(() => window.timeouts.length === 5);
      assert.ok((await b.evaluate(() => window.timeouts.slice(1))).every((message) => message.includes("超时")));
      assert.deepEqual(await owner.evaluate(() => test.aborted), ["b", "b", "b", "b"]);
      await owner.evaluate(() => {
        test.releases.forEach((release) => release());
        test.releases = [];
        test.aborted = [];
      });
      await page.clock.resume();

      await a.evaluate(() => {
        isleEmbeddedView.request("slow").catch(() => {});
      });
      await owner.waitForFunction(() => test.releases.length === 1);
      await owner.evaluate(() => document.getElementById("a").remove());
      await owner.waitForFunction(() => test.views.a.state === "closed");
      assert.deepEqual(await owner.evaluate(() => test.aborted), ["a"]);
      await owner.evaluate(() => mount("a"));
      const replacement = owner.childFrames().find((frame) => frame !== b);
      await replacement.evaluate(() => {
        window.events = 0;
        isleEmbeddedView.subscribe(() => window.events++);
      });
      await owner.evaluate(() => test.releases[0]());
      await replacement.evaluate(() => isleEmbeddedView.request("echo"));
      assert.equal(await replacement.evaluate(() => window.events), 0);

      await owner.evaluate(() => Promise.all([mount("c"), mount("d")]));
      const c = owner.childFrames().find((frame) => frame !== replacement && frame !== b);
      await c.evaluate(async () => {
        const instance = document.scripts[0].textContent.match(/[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}/)[0];
        const request = { channel: "isle-embedded-view-v1", instance, type: "request", id: 1, method: "who", params: {} };
        const done = new Promise((resolve) => addEventListener("message", (event) => {
          if (event.source === parent && event.data?.instance === instance && event.data?.type === "result" && event.data.id === 2) resolve();
        }));
        parent.postMessage(request, "*");
        parent.postMessage(request, "*");
        parent.postMessage({ ...request, id: 2, method: "echo" }, "*");
        await done;
      });
      assert.equal(await owner.evaluate(() => test.calls.filter((id) => id === "c").length), 1);
      assert.match(
        await owner.evaluate(() => {
          try {
            mount("e");
          } catch (e) {
            return e.message;
          }
        }),
        /最多挂载四个/,
      );
      await owner.evaluate(() => {
        test.views.c.dispose();
        test.views.c.dispose();
      });
      await owner.evaluate(() => mount("syntax-error", "throw new Error('fixture crash')").catch(() => {}));
      assert.equal(await owner.evaluate(() => test.views["syntax-error"].state), "closed");
      await owner.evaluate(() => {
        test.views.d.dispose();
        test.views.a.dispose();
      });
      await b.evaluate(() => {
        location.href = "about:blank";
      });
      await owner.waitForFunction(() => test.views.b.state === "closed");
      assert.ok(await owner.evaluate(() => test.errors.some((message) => message.includes("离开了"))));
      await owner.evaluate(() => {
        isleApplication.views.dispose();
        try {
          mount("after-close");
        } catch (e) {
          test.closeError = e.message;
        }
      });
      assert.match(await owner.evaluate(() => test.closeError), /宿主已关闭/);
      assert.ok(!network.includes("/forbidden-fetch"));
      assert.ok(
        errors.every((error) => error.includes("fixture crash")),
        errors.join("\n"),
      );
      console.log(
        `${name}: embedded views enforce CSP, owner identity, method grants, message bounds, theme, replacement and cleanup.`,
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise((resolve) => server.close(resolve));
}
