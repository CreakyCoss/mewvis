import test from "node:test";
import assert from "node:assert/strict";
import { startHttpServer } from "../../dist/transport/http/server.js";
import { CommandRegistry } from "../../dist/transport/commands/registry.js";
import { setup, token } from "../support/helpers.mjs";

test("large UI documents do not raise the response limit for ordinary commands", async (t) => {
  const s = await setup(t);
  const commands = new CommandRegistry();
  commands.register("ordinary", () => "x".repeat(17 * 1024 * 1024));
  commands.register("get_application_ui_document", ({ oversized }) => ({
    script: "x".repeat((oversized ? 25 : 17) * 1024 * 1024),
    style: "",
  }));
  const http = await startHttpServer({
    token,
    port: 0,
    supervisor: s.supervisor,
    commands,
    shutdown: async () => {},
    dispose() {},
  });
  t.after(() => http.close());
  const invoke = (name, input = {}) =>
    fetch(`${http.url}/api/commands/${name}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
    });
  const ordinary = await invoke("ordinary", { method: "uiDocument" });
  assert.equal(ordinary.status, 413);
  assert.match((await ordinary.json()).error.message, /16 MiB/);
  const document = await invoke("get_application_ui_document");
  assert.equal(document.status, 200);
  assert.equal((await document.json()).script.length, 17 * 1024 * 1024);
  const oversized = await invoke("get_application_ui_document", {
    oversized: true,
  });
  assert.equal(oversized.status, 413);
  assert.match((await oversized.json()).error.message, /24 MiB/);
});
