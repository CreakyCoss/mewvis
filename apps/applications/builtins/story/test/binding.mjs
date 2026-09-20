import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
const result = await build({
  entryPoints: [
    fileURLToPath(
      new URL(
        "../../../../agent-runtime/src/engines/builtins/index.ts",
        import.meta.url,
      ),
    ),
  ],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { resolveBuiltins } = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
);
assert.deepEqual(
  resolveBuiltins(["story-assistant"]).requiredTools.internal,
  [],
);
assert.deepEqual(resolveBuiltins(["story-assistant"]).sourcePaths, []);
console.log("[story-application-binding] ok");
