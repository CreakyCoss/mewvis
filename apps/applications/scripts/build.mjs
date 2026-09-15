import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  discoverApplicationSources,
  packApplication,
  validateApplication,
} from "@isle/app-dev/tooling";
import { buildBook } from "./docs/book.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = join(root, "dist");
const applicationsRoot = join(root, "builtins");
await buildBook();
const builtinApplications = await discoverApplicationSources(applicationsRoot);
if (builtinApplications.length === 0)
  throw new Error(`没有发现内置应用：${applicationsRoot}`);

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

for (const application of builtinApplications) {
  const { manifest } = await validateApplication(application.sourceRoot);
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
