import { build } from "esbuild";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const tempDir = mkdtempSync(join(tmpdir(), "novel-claw-story-builtin-binding-"));
const entryPath = join(tempDir, "runner.ts");
const bundlePath = join(tempDir, "runner.mjs");
const resourcesPath = resolve(root, "agent-runtime/src/engines/drivers/native/agent/runtimes/resources.ts");
const builtinsIndexPath = resolve(root, "agent-runtime/src/engines/builtins/index.ts");
const builtinResolverPath = resolve(root, "agent-runtime/src/engines/builtins/resolve.ts");
const builtinSkillsPath = resolve(root, "agent-runtime/src/engines/builtins/story/skills");

writeFileSync(
  entryPath,
  `
  import { allowedRuntimeTools } from ${JSON.stringify(resourcesPath)};
  import { BUILTIN_COMBINATIONS } from ${JSON.stringify(builtinsIndexPath)};
  import { resolveBuiltinCombinations } from ${JSON.stringify(builtinResolverPath)};

  const assert = (condition: unknown, message: string, details?: unknown) => {
    if (!condition) throw new Error(message + (details === undefined ? "" : "\\n" + JSON.stringify(details, null, 2)));
  };

  process.env.AGENT_RUNTIME_BUILTIN_SKILLS_DIR = ${JSON.stringify(builtinSkillsPath)};
  const storyCombination = BUILTIN_COMBINATIONS[0];
  assert(storyCombination.skill.id === "story-authoring" && storyCombination.tools[0]?.name === "story", "index 应只组合一个 story-authoring 技能与一个 story 工具。", storyCombination);
  assert(
    storyCombination.skill.requiredToolCapabilities.every((capability) =>
      storyCombination.tools.some((tool) => tool.capabilities.includes(capability))
    ),
    "组合中的工具必须满足技能声明的 capability。",
    storyCombination,
  );
  const command = (enabled: string[], allowed = ["read", "story"]) => ({
    resources: {
      tools: { allowed },
      skills: { enabled },
    },
  });

  const ordinary = command([]);
  assert(!allowedRuntimeTools(ordinary)?.includes("story"), "前端显式传入 story 也不得启用私有工具。", allowedRuntimeTools(ordinary));
  assert(resolveBuiltinCombinations([]).requiredTools.internal.length === 0, "普通技能不得获得私有故事工具。");

  const story = command(["story-assistant"], ["read"]);
  const bundle = resolveBuiltinCombinations(["story-assistant"]);
  assert(bundle.skillNames.length === 8 && bundle.skillNames.includes("story-assistant-review"), "对外引用名应展开完整内置技能列表。", bundle);
  assert(bundle.requiredTools.internal.map((item) => item.definition.name).join(",") === "story", "内置故事技能必须强制绑定内部 story 工具。", bundle);
  assert(
    bundle.requiredTools.internal[0]?.requiredContractCapabilities.join(",") === [
      "novel-claw.story.documents@1",
      "novel-claw.story.context.project@1",
      "novel-claw.story.context.chapter-writing@1",
      "novel-claw.story.changes.atomic@1",
    ].join(","),
    "故事技能必须声明抽象工作区协议能力，不得绑定默认协议 ID。",
    bundle,
  );
  assert(bundle.requiredTools.external.join(",") === "read,ls,find,grep,ask_user", "内置故事技能包必须声明外部必需工具。", bundle);
  assert(bundle.sourcePaths.length === 1, "内置技能路径必须由 bundle 自己解析。", bundle);
  assert(bundle.reservedSkillNames.size === 8, "内置故事技能名必须保留，防止外部同名覆盖。");
  for (const toolName of ["read", "ls", "find", "grep", "ask_user", "story"]) {
    assert(allowedRuntimeTools(story)?.includes(toolName), "故事技能包缺少必需工具 " + toolName + "。", allowedRuntimeTools(story));
  }

  const directSubskill = command(["story-assistant-long-write"], ["read"]);
  assert(!allowedRuntimeTools(directSubskill)?.includes("story"), "只能通过对外 referenceName 激活内置技能包。", allowedRuntimeTools(directSubskill));
  console.log("[story-builtin-binding] ok");
`,
);

try {
  await build({
    entryPoints: [entryPath],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: bundlePath,
    target: "node22",
  });
  await import(pathToFileURL(bundlePath).href);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
