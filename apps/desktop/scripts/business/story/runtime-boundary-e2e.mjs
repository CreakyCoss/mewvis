import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const runtimeRoot = resolve(root, "agent-runtime/src");

const collectTypeScriptFiles = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectTypeScriptFiles(path);
    return entry.isFile() && /\.tsx?$/.test(path) ? [path] : [];
  });

const violations = collectTypeScriptFiles(runtimeRoot).flatMap((path) => {
  const source = readFileSync(path, "utf8");
  if (!source.includes("src/features/") && !source.match(/from\s+["']@\//)) return [];
  return [relative(root, path)];
});

if (violations.length > 0) {
  throw new Error(`agent-runtime 不得反向引用 desktop 前端：\n${violations.join("\n")}`);
}

const frontendStoryRoot = resolve(root, "src/features/pages/stories");
const frontendContractImports = collectTypeScriptFiles(frontendStoryRoot).flatMap((path) => {
  const source = readFileSync(path, "utf8");
  return source.includes("@agent-runtime/engines/builtins/story") || source.includes("story-contract")
    ? [relative(root, path)]
    : [];
});
if (frontendContractImports.length > 0) {
  throw new Error(`故事前端不得依赖 agent-runtime 故事协议：\n${frontendContractImports.join("\n")}`);
}
try {
  const legacyFrontendContract = readdirSync(resolve(frontendStoryRoot, "story-contract"));
  if (legacyFrontendContract.length > 0) {
    throw new Error("前端 story-contract 边界必须移除。");
  }
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const builtinsIndex = readFileSync(resolve(root, "agent-runtime/src/engines/builtins/index.ts"), "utf8");
const builtinResolver = readFileSync(resolve(root, "agent-runtime/src/engines/builtins/resolve.ts"), "utf8");
const storySkill = readFileSync(resolve(root, "agent-runtime/src/engines/builtins/story/skills/definition.ts"), "utf8");
const storyContract = readFileSync(
  resolve(root, "src/features/pages/stories/contracts/default-novel/contract.json"),
  "utf8",
);
const storyTool = readFileSync(resolve(root, "agent-runtime/src/engines/builtins/story/tool/definition.ts"), "utf8");
const storyService = readFileSync(resolve(root, "agent-runtime/src/engines/builtins/story/tool/service.ts"), "utf8");
const storyRepository = readFileSync(
  resolve(root, "agent-runtime/src/engines/builtins/story/tool/node-repository.ts"),
  "utf8",
);
const storyToolCore = collectTypeScriptFiles(resolve(root, "agent-runtime/src/engines/builtins/story/tool"))
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");
const frontendWorkspaceContract = readFileSync(
  resolve(root, "src/features/pages/stories/contracts/workspace.ts"),
  "utf8",
);
const storyContractCompiler = readFileSync(resolve(root, "protocols/story-project/compiler.ts"), "utf8");
const storyContractRegistry = readFileSync(resolve(root, "protocols/story-project/registry.ts"), "utf8");
const structuredNovelCompiler = readFileSync(
  resolve(root, "protocols/story-project/formats/structured-novel-v1/compiler.ts"),
  "utf8",
);
if (
  !builtinsIndex.includes("BUILTIN_COMBINATIONS") ||
  !builtinsIndex.includes("STORY_AUTHORING_SKILL") ||
  !builtinsIndex.includes("STORY_TOOL") ||
  builtinsIndex.includes("resolveBuiltin") ||
  builtinsIndex.includes("createExecutor")
) {
  throw new Error("builtins/index.ts 只能暴露技能与工具的组合列表。");
}
if (
  !storySkill.includes("requiredToolCapabilities") ||
  storySkill.includes("createStoryToolPackage") ||
  !storyTool.includes("capabilities") ||
  storyTool.includes("resolveStoryAuthoringResourcePath")
) {
  throw new Error("story-authoring 技能与 story 工具必须独立定义，只通过 contract capability 组合。");
}
if (
  !storyContract.includes("novel-claw.story.context.chapter-writing@1") ||
  storyContract.includes("novel-claw.story-project.default-novel@1") ||
  storyContract.includes("skillBindings") ||
  storySkill.includes("contract.json") ||
  !storyTool.includes("STORY_PROJECT_CONTRACT_TOOL_CAPABILITY") ||
  storyTool.includes("STORY_CHAPTER_CONTEXT_CAPABILITY") ||
  !storySkill.includes("requiredContractCapabilities") ||
  !storyService.includes("repository.loadContract") ||
  !storyService.includes("CompiledStoryContract") ||
  !storyRepository.includes("createStoryContractCompilerRegistry") ||
  !storyRepository.includes("STORY_PROJECT_CONTRACT_PATH") ||
  !storyContractCompiler.includes("interface StoryContractCompiler") ||
  !storyContractCompiler.includes("interface CompiledStoryContract") ||
  !storyContractCompiler.includes("createProject(input:") ||
  !storyContractCompiler.includes("projectManifestPath():") ||
  !storyContractCompiler.includes("applyChanges(project:") ||
  !storyContractCompiler.includes("readContext(project:") ||
  storyContractCompiler.includes("formats/structured-novel-v1") ||
  storyContractCompiler.includes("declarative-contract") ||
  storyContractCompiler.includes("StoryProjectContract") ||
  !storyContractCompiler.includes("STORY_PROJECT_CONTRACT_PATH") ||
  !storyContractRegistry.includes("class StoryContractCompilerRegistry") ||
  !structuredNovelCompiler.includes("StoryContractCompiler") ||
  !frontendWorkspaceContract.includes("createStoryContractCompilerRegistry") ||
  !frontendWorkspaceContract.includes("installDefaultStoryProjectContract") ||
  frontendWorkspaceContract.includes("compiled.describe()") ||
  !builtinResolver.includes("missingCapabilities")
) {
  throw new Error("故事侧必须拥有默认协议；技能与工具只能通过通用执行能力组合，并从工作区加载协议。");
}
if (
  storyToolCore.includes('from "./schema.js"') ||
  storyToolCore.includes('from "./project.js"') ||
  storyToolCore.includes('from "./validation.js"') ||
  storyToolCore.includes('from "./change-set.js"') ||
  storyToolCore.includes("formats/structured-novel-v1") ||
  storyToolCore.includes('resolveDocument("story-manifest")')
) {
  throw new Error("Story Tool 不得依赖具体故事 Schema、项目模型、上下文或 ChangeSet 实现。");
}
if (storyTool.includes("@earendil-works/pi") || storyService.includes("@earendil-works/pi")) {
  throw new Error("story 工具核心不得依赖 PI。");
}

const piResources = readFileSync(
  resolve(root, "agent-runtime/src/engines/drivers/native/agent/runtimes/pi/agent/resources.ts"),
  "utf8",
);
const piBuiltinAdapter = readFileSync(
  resolve(root, "agent-runtime/src/engines/drivers/native/agent/runtimes/pi/tools/builtin-tool.ts"),
  "utf8",
);
if (
  !piResources.includes("registerPiBuiltinTool") ||
  !piResources.includes("resolveBuiltinCombinations") ||
  !piResources.includes("builtins.requiredTools.internal") ||
  piResources.includes("privateRuntimeTools") ||
  piResources.includes("STORY_TOOL") ||
  piResources.includes("registerPiStory") ||
  piBuiltinAdapter.includes("story-authoring")
) {
  throw new Error("PI 只能按标准内置能力协议注册工具，不得知道 story-authoring 的身份。");
}
const agentToolDefinitions = readFileSync(
  resolve(root, "agent-runtime/src/engines/drivers/native/agent/tools/definitions.ts"),
  "utf8",
);
if (
  agentToolDefinitions.includes("STORY_AGENT_TOOL_DEFINITION") ||
  agentToolDefinitions.match(/name:\s*["']story["']/)
) {
  throw new Error("私有 story 工具不得出现在 AGENT_TOOL_DEFINITIONS 公共工具目录中。");
}
for (const removedPath of [
  "story-project-contract",
  "agent-runtime/resources/builtin-skills/story-authoring",
  "agent-runtime/src/engines/builtins/story-authoring",
  "agent-runtime/src/engines/builtins/contracts",
  "agent-runtime/src/engines/builtins/skills",
  "agent-runtime/src/engines/builtins/tools",
  "agent-runtime/src/engines/toolkits/story",
  "agent-runtime/src/engines/drivers/native/agent/runtimes/pi/tools/story-tool.ts",
  "agent-runtime/src/engines/drivers/native/agent/tools/story.ts",
  "agent-runtime/src/engines/builtins/story/tool/contract.ts",
  "agent-runtime/src/engines/builtins/story/tool/schema.ts",
  "agent-runtime/src/engines/builtins/story/tool/project.ts",
  "agent-runtime/src/engines/builtins/story/tool/validation.ts",
  "agent-runtime/src/engines/builtins/story/tool/change-set.ts",
  "agent-runtime/src/engines/protocol/story-project",
  "agent-runtime/src/engines/features/story-project",
  "agent-runtime/src/engines/drivers/native/story-project",
]) {
  try {
    const files = collectTypeScriptFiles(resolve(root, removedPath));
    if (files.length > 0) throw new Error(`旧故事边界仍有实现：${removedPath}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

console.log("[story-runtime-boundary] ok");
