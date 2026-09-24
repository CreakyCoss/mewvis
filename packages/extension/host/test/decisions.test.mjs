import test from "node:test";
import assert from "node:assert/strict";
import { ExtensionHost } from "../dist/services/dispatch.js";
import { createExtensionHostClient } from "../services/contracts.js";
const input = { input: "材料", question: "是否满足？", output: { type: "boolean" } };
const result = { type: "boolean", value: false, status: "accepted", reason: "规则未满足", confidence: { value: 1, source: "rule" } };
const context = { target: { workspacePath: "/test", chatId: "a" }, signal: new AbortController().signal };
const requirements = { optional: ["decisions.evaluate"] };
test("native host implementation is callable without any SDK or provider plugin", async () => {
  const host = new ExtensionHost({ "decisions.evaluate": async () => result });
  const client = createExtensionHostClient((method, input) => host.invoke(method, input, requirements, context), host.describe(requirements));
  assert.equal(client.supports("decisions.evaluate"), true);
  assert.deepEqual(await client.decisions.evaluate(input), result);
  await assert.rejects(client.decisions.evaluate({ ...input, policyId: "private" }), /参数无效/);
});
test("missing/denied providers and invalid answers fail explicitly", async () => {
  await assert.rejects(new ExtensionHost().invoke("decisions.evaluate", input, requirements, context), /未实现/);
  await assert.rejects(new ExtensionHost().invoke("decisions.evaluate", input, {}, context), /未获得/);
  for (const value of [{ ...result, value: "yes" }, { ...result, value: null }, { ...result, status: "abstained" }, { ...result, extra: 1 }, { ...result, type: "score", value: 2 }]) {
    await assert.rejects(new ExtensionHost({ "decisions.evaluate": async () => value }).invoke("decisions.evaluate", input, requirements, context), /不符合协议/);
  }
});
