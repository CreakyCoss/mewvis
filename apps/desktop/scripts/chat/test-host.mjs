import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { build } from "esbuild";
import { resolve } from "node:path";
import Ajv from "ajv";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const bundled = await build({
  entryPoints: ["scripts/chat/host.test.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  write: false,
  plugins: [
    {
      name: "fixture-api",
      setup(build) {
        build.onResolve(
          {
            filter:
              /^(?:@\/(api\/(agents|skills|knowledge|chat|conversation-ledger)|agent-client\/runtime)|@tauri-apps\/api\/core)$/,
          },
          () => ({
            path: resolve("scripts/chat/fixtures/api.ts"),
          }),
        );
      },
    },
  ],
});
const output = mkdtempSync(join(tmpdir(), "isle-chat-tests-"));
try {
  const file = join(output, "test.mjs");
  writeFileSync(file, bundled.outputFiles[0].text);
  const result = spawnSync(process.execPath, ["--test", file], { stdio: "inherit" });
  if (result.status !== 0) process.exitCode = result.status ?? 1;
} finally {
  rmSync(output, { recursive: true, force: true });
}
// Regression for 9610802f5: compile the complete strict schema and validate DSH patchPath.
const ajv = new Ajv({ strict: true, strictTypes: false, allowUnionTypes: true });
const dir = "agent-runtime/protocol/v1/schema";
const model = JSON.parse(readFileSync(`${dir}/model.schema.json`, "utf8"));
const request = JSON.parse(readFileSync(`${dir}/request.schema.json`, "utf8"));
ajv.addSchema(model);
ajv.addSchema(JSON.parse(readFileSync(`${dir}/permissions.schema.json`, "utf8")));
ajv.addSchema(JSON.parse(readFileSync(`${dir}/access.schema.json`, "utf8")));
ajv.addSchema(request);
const validate = ajv.compile({ $ref: `${request.$id}#/definitions/AgentRuntimePlugin` });
assert.equal(
  validate({ kind: "dsh", id: "fixture", entry: "", packageRoot: "/fixture", patchPath: "/fixture/patch.js" }),
  true,
);
assert.equal(validate({ kind: "dsh", id: "fixture", entry: "", packageRoot: "/fixture" }), false);
console.log("DSH strict patchPath schema regression passed.");
