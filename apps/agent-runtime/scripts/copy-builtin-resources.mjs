import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const runtimeRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(runtimeRoot, "src", "engines", "builtins", "story");
const target = join(runtimeRoot, "dist", "builtins", "story");

await rm(join(runtimeRoot, "dist", "resources"), {
  recursive: true,
  force: true,
});
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(join(source, "skills"), join(target, "skills"), { recursive: true });

console.log(`Agent runtime story built-in resources copied to ${target}`);

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
