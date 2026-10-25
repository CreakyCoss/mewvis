import test from "node:test";
import assert from "node:assert/strict";
import {
  createApplicationFileClient,
  getApplicationFileClient,
} from "../files/index.js";

test("missing capabilities and malformed responses fail explicitly", async () => {
  assert.throws(
    () => getApplicationFileClient(),
    (e) => e.code === "CAPABILITY_UNAVAILABLE",
  );
  const client = createApplicationFileClient({
    version: 1,
    request: async () => ({ ok: true, value: {} }),
  });
  assert.equal(client.reveal, undefined);
  await assert.rejects(
    client.stat("/file.txt"),
    (e) => e.code === "INVALID_RESPONSE",
  );
  await assert.rejects(
    client.writeBinary("/file.bin", "bad"),
    (e) => e.code === "INVALID_ARGUMENT",
  );
});

test("desktop reveal is optional, follows host capabilities, and validates paths", async () => {
  const revealed = [];
  const client = createApplicationFileClient({
    version: 1,
    request: async () => ({ ok: true, value: null }),
    reveal: async (filePath) => {
      revealed.push(filePath);
    },
  });
  await client.reveal("/project/image.png");
  assert.deepEqual(revealed, ["/project/image.png"]);
  await assert.rejects(
    client.reveal("bad\0path"),
    (error) => error.code === "INVALID_ARGUMENT",
  );
  assert.equal(revealed.length, 1);
});
test("permission and transport failures retain stable codes and do not retry", async () => {
  let calls = 0;
  const client = createApplicationFileClient({
    version: 1,
    request: async () => {
      calls++;
      return {
        ok: false,
        error: { code: "PERMISSION_DENIED", message: "denied" },
      };
    },
  });
  await assert.rejects(
    client.readText("/other/file.txt"),
    (e) => e.code === "PERMISSION_DENIED",
  );
  assert.equal(calls, 1);
});
test("failed uploads abort the staging request and never commit partial data", async () => {
  const methods = [];
  const client = createApplicationFileClient({
    version: 1,
    request: async (request) => {
      methods.push(request.method);
      if (request.method === "write.begin")
        return { ok: true, value: { id: "save" } };
      if (request.method === "write.chunk")
        return {
          ok: false,
          error: { code: "FILE_ERROR", message: "disk full" },
        };
      return { ok: true, value: null };
    },
  });
  await assert.rejects(
    client.writeText("/file.txt", "contents"),
    (e) => e.code === "FILE_ERROR",
  );
  assert.deepEqual(methods, ["write.begin", "write.chunk", "write.abort"]);
});

test("resource creation and dialog opening share the same file input without a presentation flag", async () => {
  const requests = [];
  const client = createApplicationFileClient({
    version: 1,
    request: async (request) => {
      requests.push(request);
      return {
        ok: true,
        value: {
          id: "preview",
          name: "image.png",
          size: 1,
          mimeType: "image/png",
          kind: "image",
          expiresAt: Date.now() + 60_000,
          resourcePath: "file-previews/preview/token",
        },
      };
    },
  });
  await client.preview.create({ filePath: "/project/image.png" });
  await client.preview.openDialog({ filePath: "/project/image.png" });
  assert.deepEqual(
    requests.map((request) => [request.method, request.params]),
    [
      ["preview.create", { filePath: "/project/image.png" }],
      ["preview.openDialog", { filePath: "/project/image.png" }],
    ],
  );
});
