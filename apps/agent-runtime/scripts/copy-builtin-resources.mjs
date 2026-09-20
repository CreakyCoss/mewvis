import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const runtimeRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
// Remove retired host-owned business resources from incremental builds.
await rm(join(runtimeRoot, "dist", "builtins", "story"), {
  recursive: true,
  force: true,
});
await rm(join(runtimeRoot, "dist", "resources"), {
  recursive: true,
  force: true,
});

// Bundle the independently built application packages with the Runtime distribution.
const appHost = join(runtimeRoot, "../../packages/app/host/dist");
await mkdir(join(runtimeRoot, "dist/app-host"), { recursive: true });
for (const file of ["service.mjs", "migrate-layout.mjs"])
  await cp(join(appHost, file), join(runtimeRoot, "dist/app-host", file));
await rm(join(runtimeRoot, "dist/apps"), { recursive: true, force: true });
await cp(
  join(runtimeRoot, "../applications/dist"),
  join(runtimeRoot, "dist/apps"),
  { recursive: true },
);
