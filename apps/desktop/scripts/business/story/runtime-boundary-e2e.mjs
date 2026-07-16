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
  "internal/application",
  "internal/engine",
  "internal/projections",
  "application/workspace.ts",
  "application/queries/index.ts",
  "storage/file.ts",
  "storage/memory.ts",
  "storage/core",
  "storage/adapters/registry.ts",
  "definitions/assistant.ts",
  "definitions/core.ts",
  "definitions/definition.ts",
  "definitions/fields.ts",
  "definitions/format.ts",
  "definitions/model.ts",
  "definitions/outline.ts",
  "definitions/parser.ts",
  "definitions/path.ts",
  "definitions/internal/path.ts",
  "definitions/model/reference.ts",
  "definitions/people.ts",
  "definitions/resolver.ts",
  "definitions/tracking.ts",
]) {
  if (existsSync(resolve(coreRoot, removed))) throw new Error(`旧 Story Project 边界仍存在：${removed}`);
}

const publicIndex = readFileSync(resolve(coreRoot, "index.ts"), "utf8");
if (
  !publicIndex.includes("createStoryProjectApi") ||
  publicIndex.includes("BUILTIN_STORY_FILE_LAYOUT") ||
  !publicIndex.includes("storyDocumentIdentityKey") ||
  !publicIndex.includes("storyFileStorageBindings()") ||
  !publicIndex.includes("StoryProjectApi") ||
  !publicIndex.includes("listStoryTypes()") ||
  !publicIndex.includes("workspace(projectKey") ||
  !publicIndex.includes("open(projectKey") ||
  !publicIndex.includes("commitChanges(changeSet") ||
  !publicIndex.includes("./application/index.js") ||
  !publicIndex.includes("./storage/index.js") ||
  publicIndex.includes("StoryProjects") ||
  publicIndex.includes("export type {") ||
  publicIndex.includes("documents:") ||
  publicIndex.includes("Compiler")
) {
  throw new Error("Story Project 公共入口应只暴露明确的 API 工厂和公共类型，不得混入文档辅助层。");
}
const applicationRoot = resolve(coreRoot, "application");
const queriesRoot = resolve(applicationRoot, "queries");
const definitionsRoot = resolve(coreRoot, "definitions");
const documentModelRoot = resolve(coreRoot, "definitions/model");
const documentDefinitionsRoot = resolve(coreRoot, "definitions/documents");
const storageRoot = resolve(coreRoot, "storage");
const storageInternalRoot = resolve(storageRoot, "internal");
const storageAdaptersRoot = resolve(storageRoot, "adapters");
const storyTypesRoot = resolve(coreRoot, "story-types");
for (const directory of [
  applicationRoot,
  queriesRoot,
  documentModelRoot,
  documentDefinitionsRoot,
  storageInternalRoot,
  storageAdaptersRoot,
]) {
  if (!existsSync(directory)) throw new Error(`Story Project 缺少内部层：${relative(coreRoot, directory)}`);
}
const documentModelTypes = readFileSync(resolve(documentModelRoot, "types.ts"), "utf8");
const definitionFacade = readFileSync(resolve(definitionsRoot, "index.ts"), "utf8");
const definitionTypes = readFileSync(resolve(definitionsRoot, "types.ts"), "utf8");
if (
  !definitionFacade.includes("interface StoryDefinitionApi") ||
  !definitionFacade.includes("const StoryDefinition") ||
  !definitionFacade.includes("identityKey(identity") ||
  !definitionFacade.includes("parseDocument(") ||
  !definitionFacade.includes("materializeDocument(") ||
  !definitionFacade.includes('from "./internal/parser.js"') ||
  !definitionFacade.includes('from "./internal/document.js"') ||
  !definitionFacade.includes('from "./internal/resolver.js"') ||
  definitionFacade.includes("export *") ||
  definitionFacade.includes("export {")
) {
  throw new Error("Definitions index 必须提供实际 Facade，不得退化为 re-export barrel。");
}
if (
  !definitionTypes.includes('STORY_TYPE_DEFINITION_FORMAT = "novel-claw.story-type-definition"') ||
  !definitionTypes.includes("STORY_TYPE_DEFINITION_FORMAT_VERSION = 2") ||
  !definitionFacade.includes("format: STORY_TYPE_DEFINITION_FORMAT") ||
  !definitionFacade.includes("formatVersion: STORY_TYPE_DEFINITION_FORMAT_VERSION")
) {
  throw new Error("Story Type Definition 的持久化格式必须集中定义，并由 Definitions Facade 暴露。");
}
const definitionSources = tsFiles(definitionsRoot).map((path) => readFileSync(path, "utf8"));
if (
  definitionSources.some(
    (source) =>
      source.includes("contentType") ||
      /JSON\.(?:parse|stringify)/.test(source) ||
      /\b(?:rootPath|pathPattern|kindForPath|resolvePath)\b/.test(source),
  )
) {
  throw new Error("Definitions 只能声明领域结构和文档身份，不得依赖存储格式、路径布局或 JSON 编解码。");
}
const duplicatedDefinitionFormatLiterals = tsFiles(coreRoot).filter(
  (path) =>
    path !== resolve(definitionsRoot, "types.ts") &&
    readFileSync(path, "utf8").includes("novel-claw.story-type-definition"),
);
if (duplicatedDefinitionFormatLiterals.length > 0) {
  throw new Error(
    `Story Type Definition 格式标识不得重复硬编码：\n${duplicatedDefinitionFormatLiterals
      .map((path) => relative(root, path))
      .join("\n")}`,
  );
}
const invalidDefinitionImplementationImports = tsFiles(coreRoot).filter((path) => {
  if (path.startsWith(`${definitionsRoot}/`)) return false;
  return /definitions\/internal\/(?:parser|resolver)\.js/.test(readFileSync(path, "utf8"));
});
if (invalidDefinitionImplementationImports.length > 0) {
  throw new Error(
    `Definitions 外部只能依赖 index Facade：\n${invalidDefinitionImplementationImports
      .map((path) => relative(root, path))
      .join("\n")}`,
  );
}
for (const component of ["document.ts", "fields.ts", "identity.ts"]) {
  if (!existsSync(resolve(documentModelRoot, component))) {
    throw new Error(`Story Project 缺少文档模型组件：definitions/model/${component}`);
  }
}
for (const group of ["assistant", "core", "outline", "people", "tracking"]) {
  if (!existsSync(resolve(documentDefinitionsRoot, `${group}.ts`))) {
    throw new Error(`Story Project 缺少分组文档定义：definitions/documents/${group}.ts`);
  }
}
const storyTypesFacade = readFileSync(resolve(storyTypesRoot, "index.ts"), "utf8");
const longStoryType = readFileSync(resolve(storyTypesRoot, "long-novel/index.ts"), "utf8");
const shortStoryType = readFileSync(resolve(storyTypesRoot, "short-novel/index.ts"), "utf8");
if (
  !existsSync(resolve(storyTypesRoot, "types.ts")) ||
  !existsSync(resolve(storyTypesRoot, "short-novel/settings.ts")) ||
  !existsSync(resolve(storyTypesRoot, "short-novel/file-layout.ts")) ||
  !longStoryType.includes("LONG_NOVEL_FILE_LAYOUT") ||
  !shortStoryType.includes("SHORT_NOVEL_FILE_LAYOUT") ||
  shortStoryType.includes("LONG_NOVEL") ||
  storyTypesFacade.includes('from "./long-novel/file-layout.js"') ||
  storyTypesFacade.includes("BUILTIN_STORY_FILE_LAYOUT")
) {
  throw new Error("每个 Story Type 必须独立组装 definition 与 file layout，Facade 不得指定全局默认布局。");
}
if (
  !documentModelTypes.includes("StoryFieldDefinition") ||
  !documentModelTypes.includes("StoryObjectDefinition") ||
  !documentModelTypes.includes("StoryDocumentDefinition") ||
  !documentModelTypes.includes("StoryDocumentIdentity") ||
  !documentModelTypes.includes("identityFields") ||
  !documentModelTypes.includes("StoryDocumentModelDefinition")
) {
  throw new Error("Story Document 的模型基础必须位于 definitions/model，具体实现必须位于 definitions/documents。");
}
const sourceText = (directory) =>
  tsFiles(directory)
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
const applicationSource = sourceText(applicationRoot);
const queriesSource = sourceText(queriesRoot);
const storageInternalSource = sourceText(storageInternalRoot);
const storageAdaptersSource = sourceText(storageAdaptersRoot);
const forbiddenImports = (directory, forbidden) =>
  tsFiles(directory).flatMap((path) => {
    const source = readFileSync(path, "utf8");
    const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);
    return imports.some((specifier) => forbidden.some((segment) => specifier.includes(segment))) ? [path] : [];
  });
const invalidStorageInternalImports = forbiddenImports(storageInternalRoot, [
  "/application/",
  "/queries/",
  "/story-types/",
  "../../index.js",
]);
const invalidQueryImports = forbiddenImports(queriesRoot, [
  "/application/",
  "/storage/",
  "/story-types/",
  "../../index.js",
]);
if (invalidStorageInternalImports.length || invalidQueryImports.length) {
  throw new Error(
    `Story Project 内部实现必须遵守 Application Query 与 Storage 的单向依赖：\n${[
      ...invalidStorageInternalImports,
      ...invalidQueryImports,
    ]
      .map((path) => relative(root, path))
      .join("\n")}`,
  );
}
const storageContract = readFileSync(resolve(storageRoot, "index.ts"), "utf8");
const storageTypes = readFileSync(resolve(storageRoot, "types.ts"), "utf8");
const backendContract = readFileSync(resolve(storageAdaptersRoot, "record.ts"), "utf8");
const fileStorage = readFileSync(resolve(storageAdaptersRoot, "file/index.ts"), "utf8");
const memoryStorage = readFileSync(resolve(storageAdaptersRoot, "memory/index.ts"), "utf8");
if (
  applicationSource.includes("writeAtomic(") ||
  applicationSource.includes("JSON.parse(") ||
  applicationSource.includes("PROJECT_CONFIG_PATH") ||
  applicationSource.includes("StoryProjectRecord") ||
  applicationSource.includes("profile.json") ||
  applicationSource.includes("project.lock.json") ||
  queriesSource.includes("StoryProjectStorage") ||
  queriesSource.includes("StoryProjectRecord") ||
  storageInternalSource.includes("StoryProjectRecordBackend")
) {
  throw new Error("Story Application Query 必须保持纯投影，Storage 业务规则不得依赖底层 Record Backend。");
}
if (
  !storageContract.includes("interface StoryProjectStorage") ||
  !storageContract.includes("loadDefinition(projectKey") ||
  !storageContract.includes("loadProject(projectKey") ||
  !storageContract.includes("ref: StoryDocumentIdentity") ||
  !storageContract.includes("readonly changeSet") ||
  !storageContract.includes("initializeProject(") ||
  !storageContract.includes("saveDocument(") ||
  !storageContract.includes("removeDocument(") ||
  !storageContract.includes("validateChanges(") ||
  !storageContract.includes("commitChanges(") ||
  !storageContract.includes("createStoryFileRecordBackend(options.backend, binding.layout)") ||
  !storageContract.includes("createMemoryStoryProjectRecordBackend()") ||
  storageContract.includes("normalizeDocumentPath") ||
  storageContract.includes("PROJECT_CONFIG_PATH") ||
  storageContract.includes("writeAtomic(") ||
  storageContract.includes("JSON.parse(") ||
  !storageTypes.includes('kind: "file"') ||
  !storageTypes.includes('kind: "memory"') ||
  !backendContract.includes("interface StoryProjectRecordBackend") ||
  !backendContract.includes("documentKey(identity") ||
  !backendContract.includes("documentIdentity(key") ||
  !backendContract.includes("list(projectKey") ||
  !backendContract.includes("read(projectKey") ||
  !backendContract.includes("readOptional(projectKey") ||
  !backendContract.includes("commit(projectKey") ||
  fileStorage.includes("StoryProjectStorageAdapter") ||
  memoryStorage.includes("StoryProjectStorageAdapter") ||
  !fileStorage.includes("createStoryFileRecordBackend") ||
  !fileStorage.includes("writeAtomic(") ||
  !memoryStorage.includes("createMemoryStoryProjectRecordBackend") ||
  storageAdaptersSource.includes("createStoryProjectStorage =")
) {
  throw new Error("Story Storage 必须由公共 Facade 直接分发具体 Adapter，不得引入 Registry 或 barrel 隐藏依赖。");
}
const applicationFacade = readFileSync(resolve(applicationRoot, "index.ts"), "utf8");
if (
  !applicationFacade.includes("export const createWorkspace") ||
  !applicationFacade.includes('from "./queries/context.js"') ||
  !applicationFacade.includes('from "./queries/description.js"') ||
  !applicationFacade.includes('from "./queries/document.js"') ||
  !applicationFacade.includes('from "./queries/overview.js"') ||
  applicationFacade.includes("StoryProjectQuery") ||
  applicationFacade.includes("export *") ||
  applicationFacade.includes("export {")
) {
  throw new Error("Application index 必须直接组装 Workspace 与 Query 实现，不得增加二级 Facade 或 re-export barrel。");
}

const protocol = readFileSync(resolve(root, "agent-runtime/src/engines/builtins/story/protocol.ts"), "utf8");
const service = readFileSync(resolve(root, "agent-runtime/src/engines/builtins/story/tool/service.ts"), "utf8");
const repository = readFileSync(resolve(root, "agent-runtime/src/engines/builtins/story/tool/repository.ts"), "utf8");
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
  !repository.includes('from "../../../../../../core/story-project/storage/adapters/file/index.js"') ||
  repository.includes("core/story-project/story-types") ||
  !repository.includes("interface StoryToolRepository") ||
  repository.includes("createStoryProjectStorage") ||
  !repository.includes("withWorkspaceWriteLock") ||
  repository.includes("core/story-project/internal")
) {
  throw new Error("Story Tool 应仅通过公共 StoryWorkspace 绑定 Node 存储适配器。");
}

const skillRoot = resolve(root, "agent-runtime/src/engines/builtins/story/skills");
const incrementalChangeSetGuide = readFileSync(
  resolve(skillRoot, "story-assistant/references/incremental-changesets.md"),
  "utf8",
);
const skillText = collect(skillRoot)
  .filter((path) => /\.(?:md|json)$/.test(path))
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");
if (
  !skillText.includes("structure.roles[role]") ||
  !skillText.includes("storyTypeId") ||
  !skillText.includes("validationMode") ||
  !incrementalChangeSetGuide.includes('"ref":') ||
  incrementalChangeSetGuide.includes('"path":') ||
  incrementalChangeSetGuide.includes("实际路径") ||
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
