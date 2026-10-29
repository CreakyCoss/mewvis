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
  "shared/content",
  "app/projects/content",
  "domains/card/model",
  "domains/card/validation",
  "domains/card/collections",
  "domains/card/selection",
  "app/projects/model",
  "app/projects/paths",
  "app/projects/repository",
  "app/projects/examples",
  "domains/turn/model",
  "domains/turn/engine",
  "domains/turn/definitions",
  "frameworks/numeric-runtime",
  "validation/records/records",
  "validation/records/repository",
  "validation/playtest/config",
  "validation/playtest/configured-policy",
  "validation/playtest/repository",
  "validation/experiments/comparison",
  "validation/experiments/comparison-project",
  "frameworks/catalog",
  "frameworks/factory",
  "frameworks/composition/resolve",
  "frameworks/composition/runtime",
  "frameworks/doudizhu/composition/catalog",
  "frameworks/doudizhu/composition/presets",
  "frameworks/doudizhu/runtime/core",
  "frameworks/doudizhu/rules/core-commands",
  "frameworks/doudizhu/bots/core",
  "frameworks/doudizhu/model",
  "frameworks/doudizhu/extensions/heroes/model",
  "frameworks/doudizhu/extensions/heroes/runtime",
  "frameworks/doudizhu/validation",
  "frameworks/doudizhu/rules/patterns",
  "frameworks/doudizhu/runtime/game",
  "frameworks/doudizhu/rules/commands",
  "frameworks/doudizhu/bots/basic",
  "frameworks/doudizhu/records",
  "frameworks/doudizhu/repository",
  "frameworks/card-scoring/structure",
  "frameworks/card-scoring/play/preview",
  "app/projects/compatibility",
  "frameworks/branching-story/model",
  "frameworks/branching-story/engine",
  "frameworks/branching-story/analysis",
  "frameworks/branching-story/records",
  "frameworks/branching-story/repository",
];
await build({
  stdin: {
    contents: [
      ...modules.map((module) => `export * from "./main/${module}.ts";`),
      'export { validateDesign, parseProjectDocument, projectDocument } from "./main/app/projects/document.ts";',
      'export { validateNarrative, valueMatches } from "./main/frameworks/branching-story/validation.ts";',
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
