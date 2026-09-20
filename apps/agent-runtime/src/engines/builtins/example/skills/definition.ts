import { fileURLToPath } from "node:url";
import type { BuiltinSkillDefinition } from "../../definition.js";
import { TEXT_STATS_CONTRACT } from "../protocol.js";

export const EXAMPLE_SKILL = {
  id: "example-text-stats",
  referenceName: "example-text-stats",
  skills: {
    names: ["example-text-stats"],
    // 指向包含技能子目录的资源根目录，而不是 SKILL.md 本身。
    resolveSourcePath: () => fileURLToPath(new URL(".", import.meta.url)),
  },
  requiredToolContracts: [TEXT_STATS_CONTRACT],
  requiredExternalTools: [],
} as const satisfies BuiltinSkillDefinition;
