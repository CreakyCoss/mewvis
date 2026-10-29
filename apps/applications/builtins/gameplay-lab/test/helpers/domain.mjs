import { after } from "node:test";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const root = fileURLToPath(new URL("../../", import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), "gameplay-domain-test-"));
const entry = join(temporary, "domain.mjs");
after(() => rm(temporary, { recursive: true, force: true }));
const modules = [
  "shared/utils",
  "shared/contracts",
  "card/model",
  "card/validation",
  "card/collections",
  "card/selection",
  "projects/model",
  "projects/paths",
  "projects/repository",
  "projects/examples",
  "turn/model",
  "turn/engine",
  "turn/definitions",
  "turn/simulators",
  "turn/records/records",
  "turn/records/repository",
  "turn/playtest/config",
  "turn/playtest/configured-policy",
  "turn/playtest/repository",
  "turn/experiments/comparison",
  "turn/experiments/comparison-project",
  "projects/catalog",
  "projects/compatibility",
  "narrative/model",
  "narrative/engine",
  "narrative/analysis",
  "narrative/records",
  "narrative/repository",
];
await build({
  stdin: {
    contents: [
      ...modules.map((module) => `export * from "./main/${module}.ts";`),
      'export { validateDesign, parseProjectDocument, projectDocument } from "./main/projects/document.ts";',
      'export { validateNarrative, valueMatches } from "./main/narrative/validation.ts";',
    ].join("\n"),
    resolveDir: root,
  },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: entry,
  logLevel: "silent",
});
export const f = await import(pathToFileURL(entry).href);
