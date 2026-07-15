import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const collect = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? collect(path) : entry.isFile() ? [path] : [];
  });
const tsFiles = (directory) => collect(directory).filter((path) => /\.tsx?$/.test(path));

const runtimeRoot = resolve(root, "agent-runtime/src");
const frontendReferences = tsFiles(runtimeRoot).filter((path) => {
  const source = readFileSync(path, "utf8");
  return source.includes("src/features/") || /from\s+["']@\//.test(source);
});
if (frontendReferences.length) {
  throw new Error(
    `agent-runtime 不得反向引用桌面前端：\n${frontendReferences.map((path) => relative(root, path)).join("\n")}`,
  );
}

const frontendStoryRoot = resolve(root, "src/features/pages/stories");
const internalCoreImports = tsFiles(frontendStoryRoot).filter((path) =>
  /core\/story-project\/(?:definitions|documents|internal|story-types)/.test(readFileSync(path, "utf8")),
);
if (internalCoreImports.length) {
  throw new Error(
    `故事前端只能导入 Story Project 公共入口或公共数据类型：\n${internalCoreImports.map((path) => relative(root, path)).join("\n")}`,
  );
}
if (
  existsSync(resolve(frontendStoryRoot, "story-project")) ||
  existsSync(resolve(frontendStoryRoot, "story-contract"))
) {
  throw new Error("故事前端不得维护第二套故事协议或 Story Project 实现。");
}

const coreRoot = resolve(root, "core/story-project");
for (const removed of [
  "api.ts",
  "identifiers.ts",
  "compiler",
  "project",
  "documents",
  "story-types/long-novel/profile.ts",
  "story-types/long-novel/layout.ts",
  "story-types/long-novel/profile",
  "story-types/long-novel/schema",
  "store.ts",
  "file-store.ts",
  "internal/runtime.ts",
  "internal/application/api.ts",
]) {
  if (existsSync(resolve(coreRoot, removed))) throw new Error(`旧 Story Project 边界仍存在：${removed}`);
}

const publicIndex = readFileSync(resolve(coreRoot, "index.ts"), "utf8");
if (
  !publicIndex.includes("createStoryProjectApi") ||
  !publicIndex.includes("StoryProjectApi") ||
  !publicIndex.includes("listStoryTypes()") ||
  !publicIndex.includes("workspace(projectKey") ||
  !publicIndex.includes("open(projectKey") ||
  !publicIndex.includes("commitChanges(changeSet") ||
  !publicIndex.includes("./internal/application/workspace.js") ||
  !publicIndex.includes("./internal/application/project-repository.js") ||
  publicIndex.includes("StoryProjects") ||
  publicIndex.includes("export type {") ||
  publicIndex.includes("documents:") ||
  publicIndex.includes("Compiler")
) {
  throw new Error("Story Project 公共入口应只暴露明确的 API 工厂和公共类型，不得混入文档辅助层。");
}
const internalRoot = resolve(coreRoot, "internal");
const engineRoot = resolve(internalRoot, "engine");
const projectionsRoot = resolve(internalRoot, "projections");
const applicationRoot = resolve(internalRoot, "application");
for (const directory of [engineRoot, projectionsRoot, applicationRoot]) {
  if (!existsSync(directory)) throw new Error(`Story Project 缺少内部层：${relative(coreRoot, directory)}`);
}
const sourceText = (directory) =>
  tsFiles(directory)
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
const engineSource = sourceText(engineRoot);
const projectionsSource = sourceText(projectionsRoot);
const applicationSource = sourceText(applicationRoot);
const forbiddenImports = (directory, forbidden) =>
  tsFiles(directory).flatMap((path) => {
    const source = readFileSync(path, "utf8");
    const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);
    return imports.some((specifier) => forbidden.some((segment) => specifier.includes(segment))) ? [path] : [];
  });
const invalidEngineImports = forbiddenImports(engineRoot, [
  "/application/",
  "/projections/",
  "/storage/",
  "/story-types/",
  "../../index.js",
]);
const invalidProjectionImports = forbiddenImports(projectionsRoot, [
  "/application/",
  "/storage/",
  "/story-types/",
  "../../index.js",
]);
if (invalidEngineImports.length || invalidProjectionImports.length) {
  throw new Error(
    `Story Project 内部依赖必须保持 application -> projections -> engine：\n${[
      ...invalidEngineImports,
      ...invalidProjectionImports,
    ]
      .map((path) => relative(root, path))
      .join("\n")}`,
  );
}
const storeContract = readFileSync(resolve(coreRoot, "storage/index.ts"), "utf8");
const fileStore = readFileSync(resolve(coreRoot, "storage/file.ts"), "utf8");
const memoryStore = readFileSync(resolve(coreRoot, "storage/memory.ts"), "utf8");
if (
  !applicationSource.includes('PROJECT_CONFIG_PATH = "story/.novel-claw/project.json"') ||
  applicationSource.includes("writeAtomic(") ||
  applicationSource.includes("JSON.parse(") ||
  applicationSource.includes("profile.json") ||
  applicationSource.includes("project.lock.json") ||
  engineSource.includes("StoryProjectStore") ||
  projectionsSource.includes("StoryProjectStore")
) {
  throw new Error("Story Application 必须只消费结构化 Store，Engine/Projections 不得依赖存储。");
}
if (
  !storeContract.includes("interface StoryProjectStore") ||
  !storeContract.includes("list(projectKey") ||
  !storeContract.includes("read(projectKey") ||
  !storeContract.includes("commit(projectKey") ||
  !storeContract.includes("StoryProjectRevisionCondition") ||
  storeContract.includes('from "./file.js"') ||
  !fileStore.includes("createStoryFileStore") ||
  !memoryStore.includes("createMemoryStoryProjectStore")
) {
  throw new Error("Story Project 必须分离稳定 Store 协议与文件、内存等具体持久化实现。");
}

const protocol = readFileSync(resolve(root, "agent-runtime/src/engines/builtins/story/protocol.ts"), "utf8");
const service = readFileSync(resolve(root, "agent-runtime/src/engines/builtins/story/tool/service.ts"), "utf8");
const repository = readFileSync(
  resolve(root, "agent-runtime/src/engines/builtins/story/tool/node-repository.ts"),
  "utf8",
);
if (
  protocol.includes("core/story-project") ||
  protocol.includes("StoryProjectApi") ||
  protocol.includes("profileId") ||
  !protocol.includes("interface StoryToolApi") ||
  !protocol.includes("STORY_TOOL_CONTRACT")
) {
  throw new Error("Story Tool Contract 必须自包含且保持五方法边界，不得依赖内部故事实现。");
}
if (
  !service.includes("repository.project.describe") ||
  service.includes("StoryProjectApi") ||
  !repository.includes('from "../../../../../../core/story-project/index.js"') ||
  !repository.includes('from "../../../../../../core/story-project/storage/file.js"') ||
  !repository.includes("createStoryFileStore") ||
  !repository.includes("withWorkspaceWriteLock") ||
  repository.includes("core/story-project/internal")
) {
  throw new Error("Story Tool 应仅通过公共 StoryWorkspace 绑定 Node 存储适配器。");
}

const skillRoot = resolve(root, "agent-runtime/src/engines/builtins/story/skills");
const skillText = collect(skillRoot)
  .filter((path) => /\.(?:md|json)$/.test(path))
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");
if (
  !skillText.includes("structure.roles[role]") ||
  !skillText.includes("storyTypeId") ||
  !skillText.includes("validationMode") ||
  /profileId|profileVersion|validationProfile|structure\.profile/.test(skillText)
) {
  throw new Error("Story Skill 必须只消费 Story Tool 的故事类型、语义角色和稳定 ChangeSet 字段。");
}

const builtinsIndex = readFileSync(resolve(root, "agent-runtime/src/engines/builtins/index.ts"), "utf8");
const storyBuiltin = readFileSync(resolve(root, "agent-runtime/src/engines/builtins/story/index.ts"), "utf8");
if (
  !builtinsIndex.includes("STORY_BUILTIN") ||
  builtinsIndex.includes("STORY_TOOL_CONTRACT") ||
  !storyBuiltin.includes("defineBuiltin") ||
  !storyBuiltin.includes("STORY_AUTHORING_SKILL") ||
  !storyBuiltin.includes("STORY_TOOL")
) {
  throw new Error("Story 模块应自行组装技能与私有工具，通用 builtins index 只消费成品。");
}

for (const legacy of ["story-project", "protocols/story-project", "src/features/pages/stories/contracts"]) {
  if (existsSync(resolve(root, legacy))) throw new Error(`已废弃目录仍存在：${legacy}`);
}
console.log("[story-runtime-boundary] ok");
