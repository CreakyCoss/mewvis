import test from "node:test";
import assert from "node:assert/strict";
import { createPluginChatClient } from "../chat/index.js";
import { createPluginToolClient } from "../tools/index.js";
import { defineSettings, defineTool, schema } from "../index.js";
import { RISK_LEVELS, isRiskLevel } from "@isle/chat-contracts";

test("shared risk levels are immutable and reject undeclared values", () => {
  assert.deepEqual(RISK_LEVELS, ["low", "medium", "high"]);
  assert.throws(() => RISK_LEVELS.push("critical"), TypeError);
  for (const level of RISK_LEVELS) assert.equal(isRiskLevel(level), true);
  for (const value of [undefined, null, "critical", {}, 0])
    assert.equal(isRiskLevel(value), false);
});

test("tool definitions require an explicit valid risk declaration", () => {
  for (const risk of [undefined, null, "safe", "LOW", 0])
    assert.throws(() => defineTool({ name: "fixture", risk }), /risk/);
  for (const risk of ["low", "medium", "high"])
    assert.equal(defineTool({ name: "fixture", risk }).risk, risk);
});

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
