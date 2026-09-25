import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { copyRegistrations } from "../../scripts/registrations.mjs";

const resources = fileURLToPath(
  new URL("../../client/resources/", import.meta.url),
);
const source = join(resources, "skills");
const output = fileURLToPath(new URL("../dist/skills/", import.meta.url));
const registrations = await copyRegistrations(
  join(resources, "registry.json"),
  "skills",
  source,
  output,
);

console.log(
  `${registrations.length} skill resource directories copied to ${output}`,
);
