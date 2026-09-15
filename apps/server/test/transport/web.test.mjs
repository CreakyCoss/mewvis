import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { request as httpRequest } from "node:http";
import { startServer } from "../../dist/server.js";
import { token } from "../support/helpers.mjs";

const cliPath = fileURLToPath(
  new URL("../support/fixtures/runtime.mjs", import.meta.url),
);
test("Web assets and authenticated APIs share one listener without exposing the bearer credential", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "isle-static-web-"));
  let server;
  t.after(async () => {
    await server?.close();
    await rm(root, { recursive: true, force: true });
  });
  const webRoot = join(root, "web");
  await mkdir(join(webRoot, "assets"), { recursive: true });
  const html =
    '<!doctype html><div id="root"></div><script type="module" src="/assets/app.js"></script>';
  await writeFile(join(webRoot, "index.html"), html);
  await writeFile(join(webRoot, "assets/app.js"), "console.log('web')");
  await writeFile(join(root, "private.txt"), "private data");
  await symlink(join(root, "private.txt"), join(webRoot, "escape.txt"));
  const runtime = { cliPath, dataDir: join(root, "data") };
  server = await startServer({ port: 0, token, webRoot, runtime });
  const request = (path, options) => fetch(`${server.url}${path}`, options);
  const page = await request("/");
  assert.equal(page.status, 200);
  assert.equal(await page.text(), html);
  const setCookie = page.headers.get("set-cookie");
  assert.match(setCookie, /HttpOnly; SameSite=Strict; Path=\/api\//);
  assert.ok(!setCookie.includes(token));
  assert.equal(page.headers.get("cache-control"), "no-store");
  const cookie = setCookie.split(";")[0];
  const auth = { cookie, origin: server.url, "sec-fetch-site": "same-origin" };
  assert.equal((await request("/api/status")).status, 401);
  assert.equal(
    (await request("/api/status", { headers: { cookie: cookie + "wrong" } }))
      .status,
    401,
  );
  const status = await request("/api/status", { headers: auth });
  assert.equal(status.status, 200);
  assert.ok(!JSON.stringify(await status.json()).includes(token));
  const result = await request("/api/commands/get_config_database_status", {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(result.status, 200);
  assert.equal((await result.json()).setupError, null);
  const stream = await request("/api/events", { headers: auth });
  assert.equal(stream.status, 200);
  assert.ok(stream.headers.get("x-event-cursor"));
  await stream.body.cancel();
  for (const headers of [
    { ...auth, origin: "http://127.0.0.1:1" },
    { ...auth, origin: "https://evil.example" },
    { ...auth, origin: "null" },
    { ...auth, "sec-fetch-site": "same-site" },
    { ...auth, "sec-fetch-site": "cross-site" },
  ])
    assert.equal(
      (await request("/api/status", { headers })).status,
      403,
      JSON.stringify(headers),
    );
  const foreignHostStatus = await new Promise((resolve, reject) => {
    httpRequest(
      server.url,
      { headers: { host: "evil.example" } },
      (response) => {
        response.resume();
        resolve(response.statusCode);
      },
    )
      .on("error", reject)
      .end();
  });
  assert.equal(foreignHostStatus, 403);
  assert.equal(
    (await request("/", { headers: { "sec-fetch-site": "cross-site" } }))
      .status,
    403,
  );
  const asset = await request("/assets/app.js");
  assert.match(asset.headers.get("content-type"), /javascript/);
  assert.equal(asset.headers.get("set-cookie"), null);
  assert.equal(
    (
      await request("/assets/app.js", {
        headers: { "if-none-match": asset.headers.get("etag") },
      })
    ).status,
    304,
  );
  assert.equal(
    await (await request("/assets/app.js", { method: "HEAD" })).text(),
    "",
  );
  assert.equal(
    await (
      await request("/workspace/chat", { headers: { accept: "text/html" } })
    ).text(),
    html,
  );
  for (const path of [
    "/assets/missing.js",
    "/escape.txt",
    "/..%2fprivate.txt",
    "/%2eenv",
    "/%5cprivate.txt",
    "/api/missing",
  ])
    assert.equal(
      (await request(path, { headers: { ...auth, accept: "text/html" } }))
        .status,
      404,
      path,
    );
  assert.equal((await request("/%zz")).status, 400);
  assert.equal((await request("/", { method: "POST" })).status, 405);
  // A second desktop/API backend must fail, never attach to the Web process.
  await assert.rejects(
    startServer({ port: 0, token, runtime }),
    /占用|使用|lock|正在/,
  );
  await server.close();
  const desktop = await startServer({ port: 0, token, runtime });
  try {
    await assert.rejects(
      startServer({ port: 0, token, webRoot, runtime }),
      /占用|使用|lock|正在/,
    );
  } finally {
    await desktop.close();
  }
});

test("missing Web build fails explicitly and releases the data directory", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "isle-missing-web-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const options = {
    port: 0,
    token,
    runtime: { cliPath, dataDir: join(root, "data") },
  };
  await assert.rejects(
    startServer({ ...options, webRoot: join(root, "missing") }),
    /build:web/,
  );
  const server = await startServer(options);
  await server.close();
});
