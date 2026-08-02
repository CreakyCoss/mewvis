import { build } from "esbuild";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const tempDir = mkdtempSync(join(tmpdir(), "isle-claw-story-builtin-binding-"));
const entryPath = join(tempDir, "runner.ts");
const bundlePath = join(tempDir, "runner.mjs");
const resourcesPath = resolve(root, "agent-runtime/src/engines/drivers/native/agent/runtimes/resources.ts");
const builtinsIndexPath = resolve(root, "agent-runtime/src/engines/builtins/index.ts");
const builtinDefinitionPath = resolve(root, "agent-runtime/src/engines/builtins/definition.ts");
const storyBuiltinPath = resolve(root, "agent-runtime/src/engines/builtins/story/index.ts");
const builtinSkillsPath = resolve(root, "agent-runtime/src/engines/builtins/story/skills");

writeFileSync(
  entryPath,
  `
  import { allowedRuntimeTools } from ${JSON.stringify(resourcesPath)};
  import { resolveBuiltins } from ${JSON.stringify(builtinsIndexPath)};
  import { defineBuiltin } from ${JSON.stringify(builtinDefinitionPath)};
  import { STORY_BUILTIN } from ${JSON.stringify(storyBuiltinPath)};

  const assert = (condition: unknown, message: string, details?: unknown) => {
    if (!condition) throw new Error(message + (details === undefined ? "" : "\\n" + JSON.stringify(details, null, 2)));
  };

  process.env.AGENT_RUNTIME_BUILTIN_SKILLS_DIR = ${JSON.stringify(builtinSkillsPath)};
  const storyBuiltin = STORY_BUILTIN;
  assert(storyBuiltin.id === "story" && storyBuiltin.skill.id === "story-authoring" && storyBuiltin.tools[0]?.name === "story", "根 index 应只收集 Story 模块导出的完整成品。", storyBuiltin);
  const requiredContract = storyBuiltin.skill.requiredToolContracts[0];
  const providedContract = storyBuiltin.tools[0]?.contract;
  assert(
    requiredContract.id === providedContract?.id &&
      requiredContract.version === providedContract?.version &&
      Object.keys(requiredContract.methods).every((method) => method in providedContract.methods),
    "组合中的工具必须实现技能声明的完整 Tool Contract。",
    storyBuiltin,
  );
  let incompatibleBuiltinRejected = false;
  try {
    defineBuiltin({
      ...storyBuiltin,
      tools: [{ ...storyBuiltin.tools[0], contract: { ...providedContract, methods: {} } }],
    });
  } catch (error) {
    incompatibleBuiltinRejected = String(error).includes("缺少方法");
  }
  assert(incompatibleBuiltinRejected, "defineBuiltin 必须拒绝缺少接口方法的工具实现。");
  const skillOnlyBuiltin = defineBuiltin({
    id: "skill-only-test",
    skill: {
      id: "skill-only-test",
      referenceName: "skill-only-test",
      skills: { names: ["skill-only-test"], resolveSourcePath: () => "/tmp/skill-only-test" },
      requiredToolContracts: [],
      requiredExternalTools: [],
    },
    tools: [],
  });
  assert(skillOnlyBuiltin.tools.length === 0, "通用 BuiltinDefinition 必须支持无需内部工具的纯技能。");
  const command = (enabled: string[], allowed = ["read", "story"]) => ({
    resources: {
      tools: { allowed },
      skills: { enabled },
    },
  });

  const ordinary = command([]);
  assert(!allowedRuntimeTools(ordinary)?.includes("story"), "前端显式传入 story 也不得启用私有工具。", allowedRuntimeTools(ordinary));
  assert(resolveBuiltins([]).requiredTools.internal.length === 0, "普通技能不得获得私有故事工具。");

  const story = command(["story-assistant"], ["read"]);
  const bundle = resolveBuiltins(["story-assistant"]);
  assert(bundle.skillNames.length === 8 && bundle.skillNames.includes("story-assistant-review"), "对外引用名应展开完整内置技能列表。", bundle);
  assert(bundle.requiredTools.internal.map((tool) => tool.name).join(",") === "story", "内置故事技能必须强制绑定内部 story 工具。", bundle);
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
