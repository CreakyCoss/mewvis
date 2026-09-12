import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const runtimeRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const desktopRoot = join(runtimeRoot, "..");
const source = join(desktopRoot, "node_modules", "pnpm");
const destination = join(runtimeRoot, "dist", "application-installer", "pnpm");

await mkdir(dirname(destination), { recursive: true });
await rm(destination, { recursive: true, force: true });
await cp(source, destination, { recursive: true, dereference: true });

console.log(`Application installer copied to ${destination}`);
