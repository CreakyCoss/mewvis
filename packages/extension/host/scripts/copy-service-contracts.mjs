import { copyFile } from "node:fs/promises";
for (const file of [
  "services/contracts.js",
  "services/contracts.d.ts",
  "shared.d.ts",
])
  await copyFile(
    new URL(`../${file}`, import.meta.url),
    new URL(`../dist/${file}`, import.meta.url),
  );
