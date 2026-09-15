import test from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import { once } from "node:events";
import { startHttpServer } from "../../dist/transport/http/server.js";
import { CommandRegistry } from "../../dist/transport/commands/registry.js";
import { setup, token } from "../support/helpers.mjs";

test("HTTP shutdown waits for dispatched async commands before disposing shared resources", async (t) => {
  const s = await setup(t);
  const started = Promise.withResolvers();
  const resume = Promise.withResolvers();
  const stopping = Promise.withResolvers();
  let disposed = false;
  let completed = false;
  const commands = new CommandRegistry();
  commands.register("delayed", async () => {
    started.resolve();
    await resume.promise;
    assert.equal(
      disposed,
      false,
      "an in-flight filesystem command still needs the database",
    );
    completed = true;
    return null;
  });
  const http = await startHttpServer({
    token,
    port: 0,
    supervisor: s.supervisor,
    commands,
    shutdown: async () => {
      stopping.resolve();
      await s.supervisor.close();
    },
    dispose: () => {
      assert.equal(completed, true);
      disposed = true;
    },
  });
  t.after(async () => {
    resume.resolve();
    await http.close();
  });
  const response = fetch(`${http.url}/api/commands/delayed`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: "{}",
  }).then(
    (response) => response.text(),
    () => null,
  );
  await started.promise;
  const closing = http.close();
  await stopping.promise;
  assert.equal(disposed, false);
  resume.resolve();
  await closing;
  assert.equal(disposed, true);
  await response;
});

test("HTTP shutdown terminates incomplete uploads without dispatching commands", async (t) => {
  const s = await setup(t);
  const commands = new CommandRegistry();
  let dispatched = false;
  let disposed = false;
  commands.register("upload", () => {
    dispatched = true;
  });
  const http = await startHttpServer({
    token,
    port: 0,
    supervisor: s.supervisor,
    commands,
    shutdown: () => s.supervisor.close(),
    dispose: () => {
      disposed = true;
    },
  });
  t.after(() => http.close());
  const upload = request(`${http.url}/api/commands/upload`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-length": 1000 },
  });
  const closed = new Promise((resolve) => upload.once("close", resolve));
  upload.on("error", () => {});
  upload.flushHeaders();
  const [socket] = await once(upload, "socket");
  if (socket.connecting) await once(socket, "connect");
  upload.write("{");
  await http.close();
  await closed;
  assert.equal(dispatched, false);
  assert.equal(disposed, true);
});
