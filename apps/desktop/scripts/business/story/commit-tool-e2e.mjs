import { build } from "esbuild";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const workspaceRoot = process.cwd();
const tempDir = mkdtempSync(join(tmpdir(), "novel-claw-story-commit-tool-"));
const storyWorkspace = join(tempDir, "workspace");
const entryPath = join(tempDir, "runner.ts");
const bundledPath = join(tempDir, "runner.mjs");
const toolPath = resolve(
  workspaceRoot,
  "agent-runtime/src/engines/drivers/native/agent/runtimes/pi/tools/builtin-tool.ts",
);
const storyBuiltinPath = resolve(workspaceRoot, "agent-runtime/src/engines/builtins/story/tool/definition.ts");
const storyProfilePath = resolve(workspaceRoot, "protocols/story-project/index.ts");
const nodeRepositoryPath = resolve(workspaceRoot, "agent-runtime/src/engines/builtins/story/tool/node-repository.ts");
const defaultLayoutPath = resolve(workspaceRoot, "src/features/pages/stories/layouts/default-novel/layout.json");
const defaultProfilePath = resolve(workspaceRoot, "src/features/pages/stories/profiles/default-novel/index.ts");

writeFileSync(
  entryPath,
  `
  import { createHash } from "node:crypto";
  import { mkdir, readFile, stat, utimes, writeFile } from "node:fs/promises";
  import { dirname, join } from "node:path";
  import { registerPiBuiltinTool } from ${JSON.stringify(toolPath)};
  import { STORY_TOOL, createStoryToolPackage } from ${JSON.stringify(storyBuiltinPath)};
  import defaultLayoutJson from ${JSON.stringify(defaultLayoutPath)};
  import { DEFAULT_STORY_PROFILE_SOURCE } from ${JSON.stringify(defaultProfilePath)};
  import { DECLARATIVE_STORY_PROJECT_COMPILER_ID, StoryProjectCompilerRegistry, createStoryProjectCompilerRegistry } from ${JSON.stringify(storyProfilePath)};
  import { createNodeStoryToolRepository } from ${JSON.stringify(nodeRepositoryPath)};

  const assert = (condition: unknown, message: string, details?: unknown) => {
    if (!condition) throw new Error(message + (details === undefined ? "" : "\\n" + JSON.stringify(details, null, 2)));
  };
  const root = ${JSON.stringify(storyWorkspace)};
  const contract = createStoryProjectCompilerRegistry().compile(DECLARATIVE_STORY_PROJECT_COMPILER_ID, { profile: DEFAULT_STORY_PROFILE_SOURCE, layout: defaultLayoutJson });
  const manifestPath = contract.resolveDocument("story-manifest");
  const changeSetContract = { profileId: "novel-claw.story.default-novel", profileVersion: 1 };
  const installProject = async (workspace: string, layoutInput: any = defaultLayoutJson) => {
    const path = join(workspace, "story/.novel-claw/project.json");
    const profilePath = join(workspace, "story/.novel-claw/profile.json");
    const projectText = JSON.stringify(layoutInput, null, 2) + "\\n";
    const profileText = JSON.stringify(DEFAULT_STORY_PROFILE_SOURCE, null, 2) + "\\n";
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, projectText, "utf8");
    await writeFile(profilePath, profileText, "utf8");
    await writeFile(
      join(workspace, "story/.novel-claw/project.lock.json"),
      JSON.stringify({
        $format: "novel-claw.story-project-lock",
        version: 1,
        projectPath: "story/.novel-claw/project.json",
        profilePath: "story/.novel-claw/profile.json",
        profileId: layoutInput.profile.id,
        profileVersion: layoutInput.profile.version,
        compiler: { format: DECLARATIVE_STORY_PROJECT_COMPILER_ID, version: 1 },
        projectSha256: createHash("sha256").update(projectText).digest("hex"),
        profileSha256: createHash("sha256").update(profileText).digest("hex"),
      }, null, 2) + "\\n",
      "utf8",
    );
  };
  await installProject(root);
  const project = contract.createProject({ storyId: "story-commit-tool", title: "提交工具测试", timestamp: 1_800_000_000_000 });
  const projectInfo = contract.projectInfo(project);
  for (const entry of [...contract.projectFiles(project), { path: manifestPath, value: contract.projectManifest(project) }]) {
    const path = join(root, entry.path);
    await mkdir(dirname(path), { recursive: true });
    const encoded = contract.encodeDocument(entry.value, entry.path);
    await writeFile(path, typeof encoded === "string" ? encoded + "\\n" : JSON.stringify(encoded, null, 2) + "\\n", "utf8");
  }

  const tools = new Map<string, any>();
  registerPiBuiltinTool(
    { registerTool: (tool: any) => tools.set(tool.name, tool) } as any,
    STORY_TOOL,
    { workspacePath: root },
  );
  let incompleteImplementationRejected = false;
  try {
    registerPiBuiltinTool(
      { registerTool: () => undefined } as any,
      { ...STORY_TOOL, createImplementation: () => ({ api: {}, execute: async () => null }) } as any,
      { workspacePath: root },
    );
  } catch (error) {
    incompleteImplementationRejected = String(error).includes("未实现协议") && String(error).includes("commitChanges");
  }
  assert(incompleteImplementationRejected, "PI 注册必须拒绝谎报 Tool Contract 的不完整实现。");
  assert(tools.size === 1, "完整故事能力应只注册一个 PI 工具。", [...tools.keys()]);
  const storyTool = tools.get("story");
  assert(storyTool, "story 工具应成功注册。");
  const described = await storyTool.execute("describe", { action: "describe_structure" }, undefined, undefined, undefined);
  assert(
    described.details.structure.profile.profileId === "novel-claw.story.default-novel",
    "故事工具必须返回工作区选择的 Profile。",
    described.details,
  );
  assert(
    described.details.structure.compiler.format === DECLARATIVE_STORY_PROJECT_COMPILER_ID &&
      described.details.structure.compiler.version === 1,
    "describe_structure 必须返回实际使用的受信任 Compiler 身份。",
    described.details,
  );

  const invalid = await storyTool.execute("invalid", { action: "commit_changes", changeSet: {
    ...changeSetContract,
    storyId: projectInfo.storyId,
    baseRevision: 999,
    validationProfile: "draft",
    operations: [{ type: "patch", path: "story/book.json", value: { title: "不应写入" } }],
  } }, undefined, undefined, undefined);
  assert(invalid.details.committed === false && invalid.details.valid === false, "非法 ChangeSet 应返回结构化失败结果。", invalid.details);
  const afterInvalid = JSON.parse(await readFile(join(root, "story/book.json"), "utf8"));
  assert(afterInvalid.title === "提交工具测试", "校验失败不得写入正式文件。", afterInvalid);

  const untouchedPath = join(root, "story/style.json");
  await utimes(untouchedPath, new Date(1_000), new Date(1_000));
  const untouchedBefore = (await stat(untouchedPath)).mtimeMs;
  const valid = await storyTool.execute("valid", { action: "commit_changes", changeSet: {
    ...changeSetContract,
    storyId: projectInfo.storyId,
    baseRevision: projectInfo.revision,
    validationProfile: "draft",
    batch: { workflowId: "commit-tool-test", index: 1, total: 1, label: "局部标题", final: true },
    operations: [{ type: "patch", path: "story/book.json", value: { title: "原子提交成功" } }],
  } }, undefined, undefined, undefined);
  assert(valid.details.committed === true && valid.details.revision === projectInfo.revision + 1, "合法 ChangeSet 应一次调用完成校验与提交。", valid.details);
  const afterValid = JSON.parse(await readFile(join(root, "story/book.json"), "utf8"));
  assert(afterValid.title === "原子提交成功", "合法 ChangeSet 应写入变化文件。", afterValid);
  assert(
    described.details.structure.profile.documents["story-book"].label === "作品核心" &&
      described.details.structure.profile.documents["story-book"].fields["/title"].label === "书名",
    "字段可读元数据必须由 Profile 提供，而不是复制进落盘 JSON。",
    described.details,
  );
  assert((await stat(untouchedPath)).mtimeMs === untouchedBefore, "原子提交不应重写本批未变化的 JSON 文件。");

  const fallbackRoot = join(${JSON.stringify(tempDir)}, "fallback-workspace");
  await installProject(fallbackRoot);
  await mkdir(join(fallbackRoot, "story/fallback"), { recursive: true });
  await writeFile(join(fallbackRoot, "story/fallback/index.json"), JSON.stringify({ format: "story-assistant-fallback-json" }), "utf8");
  const fallbackPackage = createStoryToolPackage(createNodeStoryToolRepository(fallbackRoot));
  const refused: any = await fallbackPackage.execute({ action: "initialize", storyId: "fallback-story", title: "兜底迁移" });
  assert(refused.initialized === false && refused.issues[0]?.code === "initialize.existing-json", "初始化默认不得覆盖兜底 JSON。", refused);
  assert(await stat(join(fallbackRoot, "story/fallback/index.json")), "初始化被拒绝时兜底 JSON 必须保留。");
  const initialized: any = await fallbackPackage.execute({ action: "initialize", storyId: "fallback-story", title: "兜底迁移", replaceExistingJson: true });
  assert(initialized.initialized === true && initialized.revision === 0, "明确允许后应创建唯一合法结构。", initialized);
  const initializedManifest = JSON.parse(await readFile(join(fallbackRoot, "story/manifest.json"), "utf8"));
  assert(initializedManifest.storyId === "fallback-story", "初始化应写入经过校验的 manifest。", initializedManifest);
  const materialized: any = await fallbackPackage.execute({
    action: "commit_changes",
    changeSet: {
      ...changeSetContract,
      storyId: "fallback-story",
      baseRevision: 0,
      validationProfile: "draft",
      operations: [{
        type: "upsert",
        path: "story/world/world-background.json",
        value: { kind: "story-world-entry", id: "world-background", category: "background", title: "故事背景" },
      }],
    },
  });
  assert(materialized.committed === true && materialized.revision === 1, "普通 data 对象应由 contract 补齐后提交。", materialized);
  const encodedWorld = JSON.parse(await readFile(join(fallbackRoot, "story/world/world-background.json"), "utf8"));
  assert(
    encodedWorld.schemaVersion === 1 && encodedWorld.summary === "" && !("$schema" in encodedWorld),
    "Profile 应补齐默认字段，落盘 JSON 不应复制字段定义。",
    encodedWorld,
  );
  const rejectedContract: any = await fallbackPackage.execute({
    action: "commit_changes",
    changeSet: {
      ...changeSetContract,
      profileVersion: 2,
      storyId: "fallback-story",
      baseRevision: 1,
      validationProfile: "draft",
      operations: [{ type: "patch", path: "story/book.json", value: { title: "错误协议" } }],
    },
  });
  assert(
    rejectedContract.committed === false && rejectedContract.issues[0]?.code === "changeset.invalid",
    "工具必须在写入前拒绝错误 contract 版本。",
    rejectedContract,
  );

  const customRoot = join(${JSON.stringify(tempDir)}, "custom-layout-workspace");
  const customLayout = structuredClone(defaultLayoutJson);
  customLayout.documents["story-manifest"].pathPattern = "story/project/index.json";
  customLayout.documents["story-book"].pathPattern = "story/project/book.json";
  await installProject(customRoot, customLayout);
  const customPackage = createStoryToolPackage(createNodeStoryToolRepository(customRoot));
  const customInitialized: any = await customPackage.execute({
    action: "initialize",
    storyId: "custom-layout",
    title: "自定义目录",
  });
  assert(
    customInitialized.initialized === true && customInitialized.manifestPath === "story/project/index.json",
    "工具必须按工作区协议决定 manifest 路径。",
    customInitialized,
  );
  const customBook = JSON.parse(await readFile(join(customRoot, "story/project/book.json"), "utf8"));
  assert(customBook.title === "自定义目录", "工具必须按工作区布局决定文档落盘路径。", customBook);

  const incompleteRegistry = new StoryProjectCompilerRegistry([{
    format: "example.incomplete-story-project",
    compilerVersion: 1,
    compile: () => ({}) as any,
  }]);
  let incompleteProjectApiRejected = false;
  try {
    incompleteRegistry.compile("example.incomplete-story-project", {});
  } catch (error) {
    incompleteProjectApiRejected =
      String(error).includes("novel-claw.story-project@1") && String(error).includes("readContext");
  }
  assert(incompleteProjectApiRejected, "Compiler Registry 必须拒绝未完整实现 Story Project Protocol 的 Compiler。");

  let untrustedRejected = false;
  try {
    createStoryProjectCompilerRegistry().compile("example.untrusted-project", { profile: DEFAULT_STORY_PROFILE_SOURCE, layout: defaultLayoutJson });
  } catch (error) {
    untrustedRejected = String(error).includes("StoryProjectCompiler");
  }
  assert(untrustedRejected, "未注册的 Compiler 必须在读取故事文件前被拒绝。");
  console.log("[story-commit-tool] ok");
`,
);

try {
  await build({
    entryPoints: [entryPath],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: bundledPath,
    target: "node22",
    alias: {
      "@": resolve(workspaceRoot, "src"),
      "@engines/native/agent": resolve(workspaceRoot, "agent-runtime/src/engines/drivers/native/agent"),
    },
    loader: {
      ".jpg": "dataurl",
      ".jpeg": "dataurl",
      ".png": "dataurl",
      ".svg": "dataurl",
      ".webp": "dataurl",
    },
  });
  await import(pathToFileURL(bundledPath).href);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
