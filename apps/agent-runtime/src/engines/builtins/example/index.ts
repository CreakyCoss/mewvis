import { defineBuiltin } from "../definition.js";
import { EXAMPLE_SKILL } from "./skills/definition.js";
import { EXAMPLE_TOOL } from "./tool/definition.js";

// 说明见 docs/runtime/builtins-example.md。
// 仅供阅读和复制；不要从 builtins/index.ts 导入或加入 builtinRegistry。
export const EXAMPLE_BUILTIN = defineBuiltin({
  id: "example-text-stats",
  skill: EXAMPLE_SKILL,
  tools: [EXAMPLE_TOOL],
});
