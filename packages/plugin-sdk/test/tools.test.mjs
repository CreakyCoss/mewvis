import test from "node:test";
import assert from "node:assert/strict";
import { createPluginChatClient } from "../chat/index.js";
import { createPluginToolClient } from "../tools/index.js";
import { defineSettings, schema } from "../index.js";

test("tool catalog uses the authenticated chat transport with no workspace or writable grants", async () => {
  const calls = [];
  let enabled = true;
  const chat = createPluginChatClient({
    request: async (request) => {
      calls.push(request);
      return [
        {
          name: "read",
          label: "读取",
          description: "",
          source: "host",
          enabled,
        },
      ];
    },
    subscribe: () => () => {},
  });
  const client = createPluginToolClient(chat);
  assert.equal((await client.list())[0].enabled, true);
  enabled = false;
  assert.equal((await client.list())[0].enabled, false);
  assert.deepEqual(calls, [{ method: "tools" }, { method: "tools" }]);
  assert.deepEqual(Object.keys(client), ["list"]);
  chat.dispose();
  assert.throws(() => client.list(), /已关闭/);
  assert.throws(
    () =>
      defineSettings({
        namespace: "$isleHost",
        version: 1,
        schema: schema.object({}),
      }),
    /invalid settings namespace/,
  );
});
