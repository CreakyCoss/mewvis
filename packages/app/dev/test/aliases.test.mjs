import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { projectAliases } from "../src/dev.mjs";
test("development aliases follow inherited TypeScript paths with exact package boundaries", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "isle-alias-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(
    join(root, "base.json"),
    JSON.stringify({
      compilerOptions: {
        baseUrl: ".",
        paths: {
          "@/*": ["main/*"],
          "@story/project": ["shared/project/index.ts"],
        },
      },
    }),
  );
  await writeFile(join(root, "tsconfig.json"), '{"extends":"./base.json"}');
  const aliases = projectAliases(root);
  const resolve = (id) => {
    const rule = aliases.find((rule) => rule.find.test(id));
    return rule ? id.replace(rule.find, rule.replacement) : id;
  };
  assert.equal(resolve("@/stories/index"), join(root, "main/stories/index"));
  assert.equal(
    resolve("@story/project"),
    join(root, "shared/project/index.ts"),
  );
  assert.equal(resolve("@story/project-other"), "@story/project-other");
});
