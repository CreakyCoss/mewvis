import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const name = "@isle/story-deslop";
export const inject = ["skills"];

const skillRoot = dirname(fileURLToPath(import.meta.url));
const skillPath = fileURLToPath(new URL("./SKILL.md", import.meta.url));
const skillContent = readFileSync(skillPath, "utf8").replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");

export function apply(ctx) {
  ctx.skills.register({
    name: "story-deslop",
    description: "网文去AI味。检测并清除模板化、书面化和过度工整的表达，同时保留剧情、人设与作者意图。",
    source: "bundled",
    path: skillPath,
    resourceBase: {
      kind: "directory",
      path: skillRoot,
    },
    content: skillContent,
  });
}
