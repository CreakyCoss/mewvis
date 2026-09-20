import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const result = await build({
  entryPoints: [
    fileURLToPath(new URL("../main/host/registry.ts", import.meta.url)),
  ],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { createStoryRegistry } = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
);
// Construct definitions only; checking a registry must never access a user's workspace.
const registry = createStoryRegistry({});
console.log(
  `[story-registry] ${registry.tools.length} tools, ${registry.skills.length} skills validated`,
);
