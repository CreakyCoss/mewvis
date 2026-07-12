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
const projectPath = resolve(workspaceRoot, "protocols/story-project/formats/structured-novel-v1/project.ts");
const toolPath = resolve(
  workspaceRoot,
  "agent-runtime/src/engines/drivers/native/agent/runtimes/pi/tools/builtin-tool.ts",
);
const storyBuiltinPath = resolve(workspaceRoot, "agent-runtime/src/engines/builtins/story/tool/definition.ts");
const storyContractPath = resolve(workspaceRoot, "protocols/story-project/index.ts");
const nodeRepositoryPath = resolve(workspaceRoot, "agent-runtime/src/engines/builtins/story/tool/node-repository.ts");
const defaultContractPath = resolve(workspaceRoot, "src/features/pages/stories/contracts/default-novel/contract.json");

writeFileSync(
  entryPath,
  `
  import { createHash } from "node:crypto";
  import { mkdir, readFile, stat, utimes, writeFile } from "node:fs/promises";
  import { dirname, join } from "node:path";
  import { createEmptyStoryProject, storyProjectFiles } from ${JSON.stringify(projectPath)};
  import { registerPiBuiltinTool } from ${JSON.stringify(toolPath)};
  import { STORY_TOOL, createStoryToolPackage } from ${JSON.stringify(storyBuiltinPath)};
  import defaultContractJson from ${JSON.stringify(defaultContractPath)};
  import { StoryContractCompilerRegistry, createStoryContractCompilerRegistry } from ${JSON.stringify(storyContractPath)};
  import { createNodeStoryToolRepository } from ${JSON.stringify(nodeRepositoryPath)};

  const assert = (condition: unknown, message: string, details?: unknown) => {
    if (!condition) throw new Error(message + (details === undefined ? "" : "\\n" + JSON.stringify(details, null, 2)));
  };
  const root = ${JSON.stringify(storyWorkspace)};
  const contract = createStoryContractCompilerRegistry().compile(defaultContractJson);
  const manifestPath = contract.resolveDocument("story-manifest");
  const changeSetContract = { contractId: "novel-claw.story.default-novel", contractVersion: 1 };
  const installContract = async (workspace: string, contractInput: any = defaultContractJson) => {
    const path = join(workspace, "story/.novel-claw/contract.json");
    const contractText = JSON.stringify(contractInput, null, 2) + "\\n";
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, contractText, "utf8");
    await writeFile(
      join(workspace, "story/.novel-claw/contract.lock.json"),
      JSON.stringify({
        $format: "novel-claw.story-project-contract-lock",
        formatVersion: 1,
        contractPath: "story/.novel-claw/contract.json",
        contractId: contractInput.contractId,
        contractVersion: contractInput.contractVersion,
        compiler: { format: contractInput.$format, version: 1 },
        sha256: createHash("sha256").update(contractText).digest("hex"),
      }, null, 2) + "\\n",
      "utf8",
    );
  };
  await installContract(root);
  const project = createEmptyStoryProject({ id: "story-commit-tool", title: "提交工具测试", timestamp: 1_800_000_000_000, contract });
  for (const entry of [...storyProjectFiles(project, contract), { path: manifestPath, value: project.manifest }]) {
    const path = join(root, entry.path);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(contract.encodeDocument(entry.value, entry.path), null, 2) + "\\n", "utf8");
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
    described.details.structure.contract.contractId === "novel-claw.story.default-novel",
    "故事工具必须返回工作区固定保存的 contract。",
    described.details,
  );
  assert(
    described.details.structure.compiler.format === "novel-claw.structured-document-contract" &&
      described.details.structure.compiler.version === 1,
    "describe_structure 必须返回实际使用的受信任 Compiler 身份。",
    described.details,
  );

  const invalid = await storyTool.execute("invalid", { action: "commit_changes", changeSet: {
    ...changeSetContract,
    storyId: project.manifest.storyId,
    baseRevision: 999,
    validationProfile: "draft",
    operations: [{ type: "patch", path: "story/book.json", value: { title: "不应写入" } }],
  } }, undefined, undefined, undefined);
  assert(invalid.details.committed === false && invalid.details.valid === false, "非法 ChangeSet 应返回结构化失败结果。", invalid.details);
  const afterInvalid = JSON.parse(await readFile(join(root, "story/book.json"), "utf8"));
  assert(afterInvalid.data.title === "提交工具测试", "校验失败不得写入正式文件。", afterInvalid);

  const untouchedPath = join(root, "story/style.json");
  await utimes(untouchedPath, new Date(1_000), new Date(1_000));
  const untouchedBefore = (await stat(untouchedPath)).mtimeMs;
  const valid = await storyTool.execute("valid", { action: "commit_changes", changeSet: {
    ...changeSetContract,
    storyId: project.manifest.storyId,
    baseRevision: project.manifest.revision,
    validationProfile: "draft",
    batch: { workflowId: "commit-tool-test", index: 1, total: 1, label: "局部标题", final: true },
    operations: [{ type: "patch", path: "story/book.json", value: { title: "原子提交成功" } }],
  } }, undefined, undefined, undefined);
  assert(valid.details.committed === true && valid.details.revision === project.manifest.revision + 1, "合法 ChangeSet 应一次调用完成校验与提交。", valid.details);
  const afterValid = JSON.parse(await readFile(join(root, "story/book.json"), "utf8"));
  assert(afterValid.data.title === "原子提交成功", "合法 ChangeSet 应写入变化文件。", afterValid);
  assert(
    afterValid.$document.label === "作品核心" && afterValid.$schema.fields["/title"].label === "书名",
    "落盘 JSON 必须携带文档与字段可读元数据。",
    afterValid,
  );
  assert((await stat(untouchedPath)).mtimeMs === untouchedBefore, "原子提交不应重写本批未变化的 JSON 文件。");

  const fallbackRoot = join(${JSON.stringify(tempDir)}, "fallback-workspace");
  await installContract(fallbackRoot);
  await mkdir(join(fallbackRoot, "story/fallback"), { recursive: true });
  await writeFile(join(fallbackRoot, "story/fallback/index.json"), JSON.stringify({ format: "story-assistant-fallback-json" }), "utf8");
  const fallbackPackage = createStoryToolPackage(createNodeStoryToolRepository(fallbackRoot));
  const refused: any = await fallbackPackage.execute({ action: "initialize", storyId: "fallback-story", title: "兜底迁移" });
  assert(refused.initialized === false && refused.issues[0]?.code === "initialize.existing-json", "初始化默认不得覆盖兜底 JSON。", refused);
  assert(await stat(join(fallbackRoot, "story/fallback/index.json")), "初始化被拒绝时兜底 JSON 必须保留。");
  const initialized: any = await fallbackPackage.execute({ action: "initialize", storyId: "fallback-story", title: "兜底迁移", replaceExistingJson: true });
  assert(initialized.initialized === true && initialized.revision === 0, "明确允许后应创建唯一合法结构。", initialized);
  const initializedManifest = JSON.parse(await readFile(join(fallbackRoot, "story/manifest.json"), "utf8"));
  assert(initializedManifest.data.storyId === "fallback-story", "初始化应写入经过校验的 manifest。", initializedManifest);
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
    encodedWorld.data.schemaVersion === 1 && encodedWorld.data.summary === "" && encodedWorld.$schema.fields["/content"].label === "详细内容",
    "contract 应补齐默认字段并将字段定义编码进落盘 JSON。",
    encodedWorld,
  );
  const rejectedContract: any = await fallbackPackage.execute({
    action: "commit_changes",
    changeSet: {
      ...changeSetContract,
      contractVersion: 2,
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
  const customContract = structuredClone(defaultContractJson);
  customContract.contractId = "example.custom-layout";
  customContract.documents["story-manifest"].pathPattern = "story/project/index.json";
  customContract.documents["story-book"].pathPattern = "story/project/book.json";
  await installContract(customRoot, customContract);
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
  assert(customBook.data.title === "自定义目录", "工具必须按工作区协议决定文档落盘路径。", customBook);

  const incompleteRegistry = new StoryContractCompilerRegistry([{
    format: "example.incomplete-story-project",
    compilerVersion: 1,
    compile: () => ({}) as any,
  }]);
  let incompleteProjectApiRejected = false;
  try {
    incompleteRegistry.compile({ $format: "example.incomplete-story-project" });
  } catch (error) {
    incompleteProjectApiRejected =
      String(error).includes("novel-claw.story-project@1") && String(error).includes("readContext");
  }
  assert(incompleteProjectApiRejected, "Compiler Registry 必须拒绝未完整实现 Story Project Protocol 的 Compiler。");

  const untrustedRoot = join(${JSON.stringify(tempDir)}, "untrusted-contract-workspace");
  const untrustedContract = structuredClone(defaultContractJson);
  untrustedContract.$format = "example.untrusted-contract";
  untrustedContract.contractId = "example.untrusted-contract";
  await installContract(untrustedRoot, untrustedContract);
  const untrustedPackage = createStoryToolPackage(createNodeStoryToolRepository(untrustedRoot));
  let untrustedRejected = false;
  try {
    await untrustedPackage.execute({ action: "describe_structure" });
  } catch (error) {
    untrustedRejected = String(error).includes("StoryContractCompiler");
  }
  assert(untrustedRejected, "未注册的协议格式必须在读取工作区文件前被拒绝。");
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
