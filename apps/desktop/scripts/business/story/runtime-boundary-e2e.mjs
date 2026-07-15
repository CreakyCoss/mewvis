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
]) {
  if (existsSync(resolve(coreRoot, removed))) throw new Error(`旧 Story Project 边界仍存在：${removed}`);
}

const publicIndex = readFileSync(resolve(coreRoot, "index.ts"), "utf8");
if (
  !publicIndex.includes("createStoryProjectApi") ||
  !publicIndex.includes("StoryProjectApi") ||
  !publicIndex.includes("listStoryTypes()") ||
  !publicIndex.includes("workspace(workspacePath") ||
  !publicIndex.includes("open(workspacePath") ||
  !publicIndex.includes("commitChanges(changeSet") ||
  publicIndex.includes("StoryProjects") ||
  publicIndex.includes("export type {") ||
  publicIndex.includes("documents:") ||
  publicIndex.includes("Compiler")
) {
  throw new Error("Story Project 公共入口应只暴露明确的 API 工厂和公共类型，不得混入文档辅助层。");
}
const runtime = readFileSync(resolve(coreRoot, "internal/runtime.ts"), "utf8");
if (
  !runtime.includes('PROJECT_CONFIG_PATH = "story/.novel-claw/project.json"') ||
  runtime.includes("profile.json") ||
  runtime.includes("project.lock.json")
) {
  throw new Error("工作区应只保存一份完整故事类型定义，不得恢复 Profile/Layout/Lock 三文件协议。");
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
