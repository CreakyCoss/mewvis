import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import vm from "node:vm";
import { build } from "esbuild";

const result = await build({
  entryPoints: [new URL("../../../src/workbench/pages/applications/sandbox-document.ts", import.meta.url).pathname],
  bundle: true,
  write: false,
  format: "esm",
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
const { sandboxDocument, readApplicationTheme } = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
);

function sandbox() {
  const styles = new Map();
  const classes = new Set();
  const events = [];
  const listeners = new Map();
  const root = {
    dataset: {},
    style: { setProperty: (key, value) => styles.set(key, value), removeProperty: (key) => styles.delete(key) },
    classList: { toggle: (key, enabled) => (enabled ? classes.add(key) : classes.delete(key)) },
  };
  const parent = { postMessage() {} };
  const window = {};
  const html = sandboxDocument({ style: "", script: "" });
  vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], {
    window,
    document: { documentElement: root },
    parent,
    addEventListener: (name, handler) => listeners.set(name, handler),
    dispatchEvent: (event) => events.push(event),
    CustomEvent: class {
      constructor(type, options) {
        this.type = type;
        this.detail = options.detail;
      }
    },
  });
  return {
    styles,
    classes,
    events,
    root,
    window,
    html,
    send: (message, source = parent) =>
      listeners.get("message")({ source, data: { channel: "isle-app-ui-v1", ...message } }),
  };
}

test("sandbox receives host tokens before ready, updates without changing mode and falls back for older hosts", () => {
  const app = sandbox();
  app.send({
    type: "host:init",
    host: { theme: "light", themeTokens: { "--primary": "#123456", "--background": "#ffffff" } },
  });
  assert.equal(app.styles.get("--primary"), "#123456");
  assert.equal(app.events.at(-1).type, "isle:ready");
  app.send({ type: "host:theme", theme: "light", themeTokens: { "--primary": "#654321" } });
  assert.equal(app.styles.get("--primary"), "#654321");
  assert.equal(app.styles.has("--background"), false);
  assert.equal(app.window.isleApplication.getHost().themeTokens["--primary"], "#654321");
  assert.equal(app.events.at(-1).detail, "light");
  app.send({ type: "host:theme", theme: "dark" });
  assert.equal(app.styles.size, 0);
  assert.equal(app.classes.has("dark"), true);
  assert.equal(app.root.dataset.theme, "dark");
  assert.match(app.html, /--primary:/);
  assert.match(app.html, /--error:/);
});

test("non-parent messages cannot replace theme; malformed tokens are ignored", () => {
  const app = sandbox();
  app.send({ type: "host:theme", theme: "dark", themeTokens: { "--primary": "red" } }, {});
  assert.equal(app.styles.size, 0);
  assert.equal(app.events.length, 0);
  app.send({
    type: "host:theme",
    theme: "light",
    themeTokens: { color: "red", "--primary": null, "--error": "", "--info": "blue" },
  });
  assert.deepEqual([...app.styles], [["--info", "blue"]]);
});

test("host exports only design-system properties and reads current values", () => {
  globalThis.document = { documentElement: { dataset: { theme: "dark" }, classList: { contains: () => false } } };
  let primary = "#123456";
  globalThis.getComputedStyle = () => ({ getPropertyValue: (key) => (key === "--primary" ? primary : "") });
  try {
    assert.equal(readApplicationTheme().theme, "dark");
    assert.equal(readApplicationTheme().themeTokens["--primary"], primary);
    primary = "#abcdef";
    assert.equal(readApplicationTheme().themeTokens["--primary"], primary);
    assert.equal("--app-private" in readApplicationTheme().themeTokens, false);
  } finally {
    delete globalThis.document;
    delete globalThis.getComputedStyle;
  }
});
