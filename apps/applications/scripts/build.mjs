import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { packApplication, validateApplication } from "@isle/app-dev/tooling";
import { loadRegistrations } from "../../scripts/registrations.mjs";
import { buildBook } from "./docs/book.mjs";
import { prepareRuntime } from "../builtins/app-workshop/scripts/runtime.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = join(root, "dist");
const applicationsRoot = join(root, "builtins");
const builtinApplications = await loadRegistrations(
  join(root, "registry.json"),
  "applications",
  applicationsRoot,
);
await buildBook();
await prepareRuntime();

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

const ids = new Set();
for (const application of builtinApplications) {
  const { manifest } = await validateApplication(application.sourceRoot);
  if (ids.has(manifest.name)) throw new Error(`重复内置应用：${manifest.name}`);
  ids.add(manifest.name);
  // Chat depends on the Isle host bridge; keep existing portable applications dual-target.
  const target = manifest.isle.permissions.includes("chat") ? "isle" : "dsh";
  await packApplication({
    source: application.sourceRoot,
    target,
    outDir: join(outputRoot, application.name),
    quiet: true,
  });
}

console.log(
  `${builtinApplications.length} built-in applications packed to ${outputRoot}`,
);
