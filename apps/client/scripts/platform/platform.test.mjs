import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { desktopPlatformFixture } from "./desktop-fixture.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
let version = 0;
async function bundle(desktop = false) {
  const result = await build({
    stdin: {
      contents:
        'export { platform } from "./src/platform"; export { requestBackend } from "./src/transport/http"; export { openSystemDialog } from "./src/api/native";',
      resolveDir: root,
    },
    bundle: true,
    write: false,
    metafile: true,
    format: "esm",
    platform: "browser",
    tsconfig: join(root, "tsconfig.json"),
    plugins: desktop ? [desktopPlatformFixture()] : [],
  });
  const module = await import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}#${version++}`
  );
  return { ...module, inputs: Object.keys(result.metafile.inputs) };
}

test("shared client imports no Tauri SDK and the Web bundle contains no desktop implementation", async () => {
  const source = join(root, "src");
  for (const file of await readdir(source, { recursive: true })) {
    if (/\.tsx?$/.test(file)) assert.doesNotMatch(await readFile(join(source, file), "utf8"), /@tauri-apps\//, file);
  }
  const web = await bundle();
  assert.ok(
    web.inputs.every((input) => !/@tauri-apps|desktop\/src/.test(input)),
    web.inputs.join("\n"),
  );
  assert.equal(web.platform.kind, "web");
  assert.equal(await web.platform.getBackendConnection(), undefined);
  assert.equal(web.platform.window, undefined);
  assert.equal(web.platform.revealPath, undefined);
});

test("Web requests use same-origin credentials; external links use the shared protocol policy", async (t) => {
  const originalFetch = globalThis.fetch,
    originalWindow = globalThis.window;
  t.after(() => {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  });
  const requests = [],
    links = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url, init });
    return Response.json({});
  };
  globalThis.window = { open: (...args) => links.push(args) };
  const web = await bundle();
  await web.requestBackend("status");
  assert.equal(requests[0].url, "/api/status");
  assert.equal(requests[0].init.credentials, "same-origin");
  assert.equal(requests[0].init.headers.get("authorization"), null);
  await web.platform.openExternal("https://example.com");
  assert.deepEqual(links, [["https://example.com/", "_blank", "noopener,noreferrer"]]);
  await assert.rejects(web.platform.openExternal("file:///private/file"), /不支持/);
  await assert.rejects(web.platform.openExternal("javascript:alert(1)"), /不支持/);
  assert.equal(links.length, 1);
});

test("desktop handshake rejects invalid connections, retries failure and shares concurrent requests", async (t) => {
  t.after(() => {
    delete globalThis.__platformFixture;
  });
  const token = "a".repeat(64),
    url = "http://127.0.0.1:12345";
  let value,
    calls = 0;
  globalThis.__platformFixture = {
    invoke: async (command) => {
      assert.equal(command, "get_backend_connection");
      calls++;
      return value;
    },
  };
  const desktop = await bundle(true);
  for (const invalid of [
    { url: "https://127.0.0.1:12345", token },
    { url: "http://example.com:12345", token },
    { url: "http://127.0.0.1", token },
    { url: `${url}/api`, token },
    { url: `${url}?secret=1`, token },
    { url: "http://user@127.0.0.1:12345", token },
    { url, token: "invalid" },
  ]) {
    value = invalid;
    await assert.rejects(desktop.platform.getBackendConnection(), /Invalid desktop/);
  }
  value = { url, token };
  const before = calls;
  const connections = await Promise.all(Array.from({ length: 5 }, () => desktop.platform.getBackendConnection()));
  assert.equal(calls, before + 1);
  connections.forEach((connection) => assert.deepEqual(connection, value));
});

test("desktop links and dialogs go through native capabilities; canceled selections are discarded", async (t) => {
  t.after(() => {
    delete globalThis.__platformFixture;
  });
  const links = [],
    options = [];
  let finish;
  globalThis.__platformFixture = {
    openExternal: async (url) => {
      links.push(url);
    },
    openDialog: async (input) => {
      options.push(input);
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  };
  const desktop = await bundle(true);
  await desktop.platform.openExternal("mailto:hello@example.com");
  await assert.rejects(desktop.platform.openExternal("file:///private/file"), /不支持/);
  assert.deepEqual(links, ["mailto:hello@example.com"]);
  const abort = new AbortController();
  abort.abort();
  assert.equal(await desktop.openSystemDialog({}, abort.signal), null);
  assert.equal(options.length, 0);
  const pendingAbort = new AbortController();
  const selection = desktop.openSystemDialog({ directory: true, multiple: true }, pendingAbort.signal);
  pendingAbort.abort();
  finish(["/selected"]);
  assert.equal(await selection, null);
  assert.deepEqual(options, [{ directory: true, multiple: true }]);
});

test("desktop close waits for saving, blocks duplicates and permits retry after a failed save", async (t) => {
  t.after(() => {
    delete globalThis.__platformFixture;
  });
  let listener,
    destroyed = 0,
    unlistened = 0,
    prevented = 0,
    saveCalls = 0,
    finish;
  const errors = [];
  globalThis.__platformFixture = {
    window: {
      onCloseRequested: async (handler) => {
        listener = handler;
        return () => {
          unlistened++;
        };
      },
      destroy: async () => {
        destroyed++;
      },
    },
  };
  const desktop = await bundle(true);
  const dispose = await desktop.platform.window.onCloseRequested(
    async () => {
      saveCalls++;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
    (error) => errors.push(error),
  );
  const event = {
    preventDefault: () => {
      prevented++;
    },
  };
  const first = listener(event);
  await listener(event);
  assert.equal(saveCalls, 1);
  assert.equal(destroyed, 0);
  assert.equal(prevented, 2);
  finish(false);
  await first;
  const retry = listener(event);
  finish(true);
  await retry;
  assert.equal(destroyed, 1);
  dispose();
  assert.equal(unlistened, 1);
  assert.deepEqual(errors, []);
});

test("disposing a close subscription during saving prevents a late window destruction", async (t) => {
  t.after(() => {
    delete globalThis.__platformFixture;
  });
  let listener,
    finish,
    destroyed = 0;
  const errors = [];
  globalThis.__platformFixture = {
    window: {
      onCloseRequested: async (handler) => {
        listener = handler;
        return () => {};
      },
      destroy: async () => {
        destroyed++;
      },
    },
  };
  const desktop = await bundle(true);
  const dispose = await desktop.platform.window.onCloseRequested(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    (error) => errors.push(error),
  );
  const closing = listener({ preventDefault() {} });
  dispose();
  finish(true);
  await closing;
  assert.equal(destroyed, 0);
  assert.deepEqual(errors, []);
});

test("a thrown save error keeps the desktop window open and a later close can retry", async (t) => {
  t.after(() => {
    delete globalThis.__platformFixture;
  });
  let listener,
    attempts = 0,
    destroyed = 0;
  const errors = [];
  globalThis.__platformFixture = {
    window: {
      onCloseRequested: async (handler) => {
        listener = handler;
        return () => {};
      },
      destroy: async () => {
        destroyed++;
      },
    },
  };
  const desktop = await bundle(true);
  const dispose = await desktop.platform.window.onCloseRequested(
    async () => {
      if (++attempts === 1) throw new Error("save failed");
      return true;
    },
    (error) => errors.push(error),
  );
  await listener({ preventDefault() {} });
  assert.equal(destroyed, 0);
  assert.equal(errors[0].message, "save failed");
  await listener({ preventDefault() {} });
  assert.equal(destroyed, 1);
  dispose();
});
