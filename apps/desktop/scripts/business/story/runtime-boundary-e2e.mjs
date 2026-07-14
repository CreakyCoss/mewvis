import { existsSync, readFileSync, readdirSync } from "node:fs";
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
const frontendStoryProjectInternalImports = collectTypeScriptFiles(frontendStoryRoot).flatMap((path) => {
  const source = readFileSync(path, "utf8");
  return /story-project\/(?:api|types|compiler|project|documents|story-types)/.test(source)
    ? [relative(root, path)]
    : [];
});
if (frontendStoryProjectInternalImports.length > 0) {
  throw new Error(`故事前端只能使用 story-project 公共入口：\n${frontendStoryProjectInternalImports.join("\n")}`);
}
if (existsSync(resolve(frontendStoryRoot, "story-project"))) {
  throw new Error("故事前端不得继续维护第二套 story-project 实现目录。");
}
const frontendStorySource = collectTypeScriptFiles(frontendStoryRoot)
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");
if (
  frontendStorySource.includes("@deprecated") ||
  frontendStorySource.includes("StoryJson") ||
  frontendStorySource.includes("storyDocumentsToStoryJson") ||
  existsSync(resolve(frontendStoryRoot, "manuscripts")) ||
  existsSync(resolve(frontendStoryRoot, "story/actions/chat")) ||
  existsSync(resolve(frontendStoryRoot, "story/model"))
) {
  throw new Error("故事前端不得保留 StoryJson、旧节点聊天或独立稿件系统等废弃实现。");
}
const workspaceChatSource = readFileSync(
  resolve(root, "src/features/pages/chat/components/workspace-chat-page/index.tsx"),
  "utf8",
);
if (
  workspaceChatSource.includes("submitStoryManuscript") ||
  workspaceChatSource.includes("storySubmittingMessageIds")
) {
  throw new Error("通用聊天页面不得保留已移除稿件系统的收稿入口。");
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
const builtinDefinition = readFileSync(resolve(root, "agent-runtime/src/engines/builtins/definition.ts"), "utf8");
const storyBuiltin = readFileSync(resolve(root, "agent-runtime/src/engines/builtins/story/index.ts"), "utf8");
const storySkill = readFileSync(resolve(root, "agent-runtime/src/engines/builtins/story/skills/definition.ts"), "utf8");
const storySkillsRoot = resolve(root, "agent-runtime/src/engines/builtins/story/skills");
const activeStorySkillInstructions = [
  ...readdirSync(storySkillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("story-assistant"))
    .flatMap((entry) => {
      const path = resolve(storySkillsRoot, entry.name, "SKILL.md");
      return existsSync(path) ? [readFileSync(path, "utf8")] : [];
    }),
  readFileSync(resolve(storySkillsRoot, "story-assistant/references/story-tool-binding.md"), "utf8"),
  readFileSync(resolve(storySkillsRoot, "story-assistant/references/incremental-changesets.md"), "utf8"),
].join("\n");
const storyProfileRoot = resolve(root, "core/story-project/story-types/long-novel/profile");
const storyProfile = [
  readFileSync(resolve(storyProfileRoot, "metadata.json"), "utf8"),
  ...readdirSync(resolve(storyProfileRoot, "objects"))
    .filter((name) => name.endsWith(".json"))
    .map((name) => readFileSync(resolve(storyProfileRoot, "objects", name), "utf8")),
  ...readdirSync(resolve(storyProfileRoot, "documents"))
    .filter((name) => name.endsWith(".json"))
    .map((name) => readFileSync(resolve(storyProfileRoot, "documents", name), "utf8")),
].join("\n");
const storyLayout = readFileSync(resolve(root, "core/story-project/story-types/long-novel/layout.ts"), "utf8");
const storyTool = readFileSync(resolve(root, "agent-runtime/src/engines/builtins/story/tool/definition.ts"), "utf8");
const storyProtocol = readFileSync(resolve(root, "agent-runtime/src/engines/builtins/story/protocol.ts"), "utf8");
const storyService = readFileSync(resolve(root, "agent-runtime/src/engines/builtins/story/tool/service.ts"), "utf8");
const storyRepository = readFileSync(
  resolve(root, "agent-runtime/src/engines/builtins/story/tool/node-repository.ts"),
  "utf8",
);
const storyToolCore = collectTypeScriptFiles(resolve(root, "agent-runtime/src/engines/builtins/story/tool"))
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");
const storyProjectWorkspace = readFileSync(resolve(root, "core/story-project/project/workspace.ts"), "utf8");
const frontendDocumentRepository = readFileSync(resolve(root, "core/story-project/documents/repository.ts"), "utf8");
const frontendStoryStorage = readFileSync(resolve(root, "src/features/pages/stories/storage.ts"), "utf8");
const protocolDefinition = readFileSync(resolve(root, "core/protocol.ts"), "utf8");
const storyProjectIndex = readFileSync(resolve(root, "core/story-project/index.ts"), "utf8");
const storyProjectApi = readFileSync(resolve(root, "core/story-project/api.ts"), "utf8");
const storyProjectTypes = readFileSync(resolve(root, "core/story-project/types.ts"), "utf8");
const storyProjectMetadata = readFileSync(resolve(root, "core/story-project/project/metadata.ts"), "utf8");
const storyProfileRegistry = readFileSync(resolve(root, "core/story-project/project/registry.ts"), "utf8");
const structuredNovelCompiler = readFileSync(resolve(root, "core/story-project/compiler/compiler.ts"), "utf8");
const storyTypeCatalog = readFileSync(resolve(root, "core/story-project/story-types/index.ts"), "utf8");
if (existsSync(resolve(root, "story-project")) || existsSync(resolve(root, "protocols"))) {
  throw new Error("Story Project 与通用协议必须统一归入 core，根目录不得保留旧实现。");
}
if (
  !activeStorySkillInstructions.includes("structure.profile.documentRoles[role]") ||
  activeStorySkillInstructions.includes("`story-chapter-content`") ||
  /story\/(?:book|positioning|style|characters|world|relationships|outline|tracking|chapters|analysis|reviews|imports)(?:\/|\.|`)/.test(
    activeStorySkillInstructions,
  )
) {
  throw new Error("Story Skill 必须通过 documentRoles 解析语义文档，不得硬编码默认 Profile kind 或业务路径。");
}
if (
  !builtinsIndex.includes("const builtinRegistry") ||
  !builtinsIndex.includes("STORY_BUILTIN") ||
  !builtinsIndex.includes("resolveBuiltins") ||
  !builtinsIndex.includes("isBuiltinPrivateToolName") ||
  builtinsIndex.includes("export const BUILTINS") ||
  builtinsIndex.includes("export const builtinRegistry") ||
  builtinsIndex.includes("STORY_AUTHORING_SKILL") ||
  builtinsIndex.includes("STORY_TOOL") ||
  builtinsIndex.includes("defineBuiltin") ||
  !storyBuiltin.includes("defineBuiltin") ||
  !storyBuiltin.includes("STORY_AUTHORING_SKILL") ||
  !storyBuiltin.includes("STORY_TOOL")
) {
  throw new Error("根 builtins/index.ts 只能收集业务模块导出的成品；Story 必须在自己的 index 中完成组装。");
}
if (
  !storySkill.includes("requiredToolContracts") ||
  storySkill.includes("createStoryToolPackage") ||
  !storySkill.includes("STORY_TOOL_CONTRACT") ||
  storySkill.includes("STORY_DOCUMENT_MODEL_CAPABILITY") ||
  !storyTool.includes("contract: STORY_TOOL_CONTRACT") ||
  !storyTool.includes("createImplementation") ||
  storyTool.includes("capabilities") ||
  storyTool.includes("resolveStoryAuthoringResourcePath")
) {
  throw new Error("story-authoring 技能必须依赖强类型 Tool Contract，Story Tool 必须显式实现该契约。");
}
if (
  storyProfile.includes('"capabilities"') ||
  storyProfile.includes('"capability"') ||
  storyProfile.includes("novel-claw.structured-document") ||
  storyProfile.includes("skillBindings") ||
  storyProfile.includes('"pathPattern"') ||
  !storyProfile.includes('"layoutPresence"') ||
  !storyProfile.includes('"documentRoles"') ||
  storyLayout.includes('"fields"') ||
  !storyLayout.includes("LONG_NOVEL_PROFILE.defineLayout") ||
  storyLayout.includes("novel-claw.story.default-novel") ||
  storySkill.includes("contract.json") ||
  !storyProtocol.includes("interface StoryToolApi") ||
  !storyProtocol.includes("defineBuiltinToolContract") ||
  storyProtocol.includes("STORY_TOOL_REQUIRED_STORY_CONTRACT_CAPABILITIES") ||
  storyService.includes("STORY_TOOL_REQUIRED_STORY_CONTRACT_CAPABILITIES") ||
  storyService.includes("STORY_DOCUMENT_MODEL_CAPABILITY") ||
  storyService.includes("STORY_PROJECT_CONTEXT_CAPABILITY") ||
  storyService.includes("STORY_CHAPTER_CONTEXT_CAPABILITY") ||
  storyService.includes("STORY_ATOMIC_CHANGES_CAPABILITY") ||
  storyService.includes("requiredContractCapabilities") ||
  !storyService.includes("repository.loadProjectApi") ||
  !storyService.includes("StoryProjectApi") ||
  !storyRepository.includes("createStoryProjectCompilerRegistry") ||
  !storyRepository.includes("STORY_PROJECT_CONFIG_PATH") ||
  !storyRepository.includes("STORY_PROJECT_PROFILE_PATH") ||
  !storyProjectApi.includes("interface StoryProjectApi") ||
  !storyProjectApi.includes("createProject(input:") ||
  !storyProjectApi.includes("projectManifestPath():") ||
  !storyProjectApi.includes("applyChanges(project:") ||
  !storyProjectApi.includes("readContext(") ||
  !storyProjectApi.includes("StoryContextBundle") ||
  !storyProjectTypes.includes("documentRoles") ||
  !storyProjectMetadata.includes("STORY_PROJECT_CONFIG_PATH") ||
  !storyProjectMetadata.includes("compileStoryProjectWorkspace") ||
  !storyProjectApi.includes("interface StoryProjectCompilerRegistry") ||
  !storyProjectApi.includes("register(compiler:") ||
  !storyProjectApi.includes("resolve(format:") ||
  !storyProfileRegistry.includes("implements StoryProjectCompilerRegistry") ||
  !storyProfileRegistry.includes("STORY_PROJECT_API_DEFINITION") ||
  !storyProfileRegistry.includes("defineProtocol<StoryProjectApi>") ||
  storyProfileRegistry.includes("DECLARATIVE_STORY_PROJECT_COMPILER") ||
  !storyProfileRegistry.includes("assertProtocolImplementation") ||
  !structuredNovelCompiler.includes('Parameters<StoryProjectCompilerRegistry["register"]>') ||
  !structuredNovelCompiler.includes("StoryProjectCompiler") ||
  !structuredNovelCompiler.includes("StoryProjectApi") ||
  !structuredNovelCompiler.includes("DECLARATIVE_STORY_PROJECT_COMPILER") ||
  storyProjectIndex.includes("export *") ||
  !storyProjectIndex.includes("StoryProjects") ||
  !storyProjectIndex.includes("listTypes:") ||
  !storyProjectIndex.includes("create:") ||
  !storyProjectIndex.includes("open:") ||
  storyProjectIndex.includes("LONG_NOVEL_PROFILE") ||
  storyProjectIndex.includes("LONG_NOVEL_LAYOUT") ||
  !storyTypeCatalog.includes("LONG_NOVEL_STORY_TYPE") ||
  !storyTypeCatalog.includes("SHORT_NOVEL_STORY_TYPE") ||
  structuredNovelCompiler.includes("standard-novel") ||
  !storyProjectWorkspace.includes("createStoryProjectCompilerRegistry") ||
  !storyProjectWorkspace.includes("resolveStoryProjectType") ||
  !storyProjectWorkspace.includes("STORY_PROJECT_PROFILE_PATH") ||
  !storyProjectWorkspace.includes("createStoryProject") ||
  !frontendDocumentRepository.includes("projectApi.applyChanges") ||
  !frontendDocumentRepository.includes("loadStoryProjectApi") ||
  !frontendDocumentRepository.includes("writeWorkspaceFilesAtomic") ||
  frontendDocumentRepository.includes("writeWorkspaceFile(") ||
  frontendDocumentRepository.includes("deleteWorkspaceFile(") ||
  !frontendStoryStorage.includes("StoryProjects.create") ||
  frontendStoryStorage.includes("LONG_NOVEL_PROFILE") ||
  frontendStoryStorage.includes("LONG_NOVEL_LAYOUT") ||
  storyProjectWorkspace.includes("compiled.describe()") ||
  !builtinDefinition.includes("type BuiltinDefinition") ||
  !builtinDefinition.includes("assertBuiltinDefinition") ||
  !builtinDefinition.includes("assertBuiltinToolImplementation") ||
  !protocolDefinition.includes("defineProtocol") ||
  !protocolDefinition.includes("assertProtocolImplementation") ||
  !builtinsIndex.includes("assertBuiltinDefinition") ||
  builtinsIndex.includes("BUILTIN_COMBINATIONS") ||
  builtinsIndex.includes("requiredContractCapabilities")
) {
  throw new Error(
    "技能必须依赖 Story Tool Protocol，Story Tool 必须依赖 Story Project Protocol，Compiler 必须实现该协议。",
  );
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
  !piResources.includes("resolveBuiltins") ||
  !piResources.includes("builtins.requiredTools.internal") ||
  piResources.includes("requiredContractCapabilities") ||
  piResources.includes("privateRuntimeTools") ||
  piResources.includes("STORY_TOOL") ||
  piResources.includes("registerPiStory") ||
  piBuiltinAdapter.includes("story-authoring") ||
  !piBuiltinAdapter.includes("assertBuiltinToolImplementation")
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
  "agent-runtime/src/engines/builtins/story/tool/tools.ts",
  "agent-runtime/src/engines/builtins/story/tool/api.ts",
  "agent-runtime/src/engines/builtins/types.ts",
  "agent-runtime/src/engines/builtins/resolve.ts",
  "agent-runtime/src/engines/protocol/story-project",
  "agent-runtime/src/engines/features/story-project",
  "agent-runtime/src/engines/drivers/native/story-project",
  "protocols/story-project/api",
  "protocols/story-project/compiler",
]) {
  try {
    const files = collectTypeScriptFiles(resolve(root, removedPath));
    if (files.length > 0) throw new Error(`旧故事边界仍有实现：${removedPath}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

for (const removedFile of [
  "protocols/story-project/compiler.ts",
  "protocols/story-project/declarative-profile.ts",
  "protocols/story-project/layout.ts",
  "protocols/story-project/protocol.ts",
  "protocols/story-project/model.ts",
  "protocols/story-project/validation.ts",
  "protocols/story-project/runtime.ts",
]) {
  if (existsSync(resolve(root, removedFile))) throw new Error(`故事协议根目录不应保留平铺实现：${removedFile}`);
}

console.log("[story-runtime-boundary] ok");
