import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { ApplicationHost } from "../../../../../packages/app/host/dist/index.js";

test("the native application host can discover and load the authoring skill", async (t) => {
  const host = await ApplicationHost.create();
  t.after(() => host.dispose());
  const packageRoot = fileURLToPath(new URL("../dist/mewvis/", import.meta.url));
  await host.load({
    kind: "mewvis",
    id: "@mewvis/app-workshop",
    packageRoot,
    entry: fileURLToPath(new URL("../dist/mewvis/index.js", import.meta.url)),
  });

  const catalog = await host.listSkills();
  assert.ok(catalog.some((skill) => skill.name === "workshop-authoring"));
  // Memory previews only collect registrations. The real registry validates
  // loaded definitions here, which previously rejected the missing source.
  const skill = await host.getSkill("workshop-authoring");
  assert.ok(skill);
  assert.equal(skill.source, "bundled");
  assert.equal(typeof skill.provider, "string");
  assert.equal(skill.invocation.modelInvocable, true);
  assert.match(skill.content, /workshop_build/);
});
