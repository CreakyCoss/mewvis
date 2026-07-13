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
const piValidationPath = resolve(workspaceRoot, "../../ai/pi/packages/ai/src/utils/validation.ts");
const defaultLayoutPath = resolve(workspaceRoot, "src/features/pages/stories/story-project/layouts/default-layout.ts");
const defaultProfilePath = resolve(
  workspaceRoot,
  "src/features/pages/stories/story-project/profiles/default-novel/index.ts",
);

writeFileSync(
  entryPath,
  `
  import { createHash } from "node:crypto";
  import { mkdir, readFile, stat, utimes, writeFile } from "node:fs/promises";
  import { dirname, join } from "node:path";
  import { validateToolArguments } from ${JSON.stringify(piValidationPath)};
  import { registerPiBuiltinTool } from ${JSON.stringify(toolPath)};
  import { STORY_TOOL, createStoryToolPackage } from ${JSON.stringify(storyBuiltinPath)};
  import { DEFAULT_STORY_PROJECT_LAYOUT as defaultLayoutJson } from ${JSON.stringify(defaultLayoutPath)};
  import { DEFAULT_STORY_PROFILE_SOURCE } from ${JSON.stringify(defaultProfilePath)};
  import { STORY_PROJECT_IDENTIFIERS, StoryProjectCompilerRegistry, createStoryProjectCompilerRegistry } from ${JSON.stringify(storyProfilePath)};
  import { createNodeStoryToolRepository } from ${JSON.stringify(nodeRepositoryPath)};

  const assert = (condition: unknown, message: string, details?: unknown) => {
    if (!condition) throw new Error(message + (details === undefined ? "" : "\\n" + JSON.stringify(details, null, 2)));
  };
  const root = ${JSON.stringify(storyWorkspace)};
  const contract = createStoryProjectCompilerRegistry().compile(STORY_PROJECT_IDENTIFIERS.declarativeCompiler.format, { profile: DEFAULT_STORY_PROFILE_SOURCE, layout: defaultLayoutJson });
  const manifestPath = contract.resolveDocument("story-manifest");
  const changeSetContract = {
    profileId: DEFAULT_STORY_PROFILE_SOURCE.profileId,
    profileVersion: DEFAULT_STORY_PROFILE_SOURCE.profileVersion,
  };
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
        $format: STORY_PROJECT_IDENTIFIERS.projectLock.format,
        version: STORY_PROJECT_IDENTIFIERS.projectLock.version,
        projectPath: "story/.novel-claw/project.json",
        profilePath: "story/.novel-claw/profile.json",
        profileId: layoutInput.profile.id,
        profileVersion: layoutInput.profile.version,
        compiler: STORY_PROJECT_IDENTIFIERS.declarativeCompiler,
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
  assert(
    storyTool.parameters.properties.changeSet.type === "object" &&
      storyTool.parameters.properties.changeSet.properties.profileVersion.type === "integer" &&
      storyTool.parameters.properties.changeSet.properties.batch.properties.final.type === "boolean" &&
      storyTool.parameters.properties.changeSet.properties.operations.type === "array" &&
      storyTool.parameters.properties.changeSet.properties.operations.items.anyOf.some(
        (operation: any) =>
          operation.properties.type.const === "upsert-items" && operation.properties.items.type === "array",
      ),
    "Story Tool 必须向模型暴露完整的 ChangeSet 数字、布尔和数组类型。",
    storyTool.parameters,
  );
  const described = await storyTool.execute("describe", { action: "describe_structure" }, undefined, undefined, undefined);
  assert(
    described.details.structure.profile.profileId === DEFAULT_STORY_PROFILE_SOURCE.profileId,
    "故事工具必须返回工作区选择的 Profile。",
    described.details,
  );
  assert(
    Object.keys(described.details.structure.schemas.documents).length === 0 &&
      JSON.stringify(described.details).length < 20_000,
    "首次 describe_structure 应返回轻量目录，不应一次注入完整 Profile。",
    { length: JSON.stringify(described.details).length },
  );
  const describedSchemas = await storyTool.execute(
    "describe-schema",
    { action: "describe_structure", documentKinds: ["story-book", "story-relationships"] },
    undefined,
    undefined,
    undefined,
  );
  assert(
    described.details.structure.compiler.format === STORY_PROJECT_IDENTIFIERS.declarativeCompiler.format &&
      described.details.structure.compiler.version === STORY_PROJECT_IDENTIFIERS.declarativeCompiler.version,
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
      describedSchemas.details.structure.schemas.documents["story-book"].fields["/title"].label === "书名" &&
      describedSchemas.details.structure.schemas.objectDefinitions.relationship,
    "字段可读元数据必须由 Profile 提供，而不是复制进落盘 JSON。",
    describedSchemas.details,
  );
  assert(
    described.details.structure.profile.documentRoles.chapterContent === "story-chapter-content" &&
      described.details.structure.profile.documentRoles.chapterResult === "story-chapter",
    "describe_structure 必须把 Compiler 解析后的文档语义角色传给技能。",
    described.details,
  );
  const miniMaxArguments = validateToolArguments(storyTool, {
    type: "toolCall",
    id: "minimax-compatible-values",
    name: "story",
    arguments: {
      action: "commit_changes",
      changeSet: {
        profileId: DEFAULT_STORY_PROFILE_SOURCE.profileId,
        profileVersion: "1",
        storyId: projectInfo.storyId,
        baseRevision: String(valid.details.revision),
        validationProfile: "draft",
        batch: {
          workflowId: "minimax-compatible-values",
          index: "2",
          total: "2",
          label: "字符串基础类型与关系数组",
          final: "false",
        },
        operations: [
          {
            type: "upsert",
            path: "story/characters/char-compatible-a.json",
            value: { id: "char-compatible-a", name: "兼容甲", role: "protagonist", age: 28, memory: {} },
          },
          {
            type: "upsert",
            path: "story/characters/char-compatible-b.json",
            value: { id: "char-compatible-b", name: "兼容乙", role: "supporting", age: "26", memory: {} },
          },
          { type: "patch", path: "story/positioning.json", value: { targetWords: "2500000" } },
          {
            type: "upsert-items",
            path: "story/relationships.json",
            field: "relationships",
            items: [
              {
                id: "rel-compatible-a-b",
                fromCharacterId: "char-compatible-a",
                toCharacterId: "char-compatible-b",
                type: "搭档",
                emotionalDirection: "从试探到信任",
                currentState: "刚开始合作",
                conflict: "做事方式不同",
                evolution: "",
              },
            ],
          },
        ],
      },
    },
  } as any);
  assert(
    typeof miniMaxArguments.changeSet.profileVersion === "number" &&
      typeof miniMaxArguments.changeSet.baseRevision === "number" &&
      typeof miniMaxArguments.changeSet.batch.index === "number" &&
      miniMaxArguments.changeSet.batch.final === false,
    "PI 注册层应按 Story Tool schema 转换 MiniMax 返回的字符串基础类型。",
    miniMaxArguments,
  );
  const miniMaxCompatible = await storyTool.execute(
    "minimax-compatible-values",
    miniMaxArguments,
    undefined,
    undefined,
    undefined,
  );
  assert(
    miniMaxCompatible.details.committed === true && miniMaxCompatible.details.revision === valid.details.revision + 1,
    "内容正确但基础类型字符串化的 MiniMax ChangeSet 应一次提交成功。",
    miniMaxCompatible.details,
  );
  const compatibleCharacter = JSON.parse(
    await readFile(join(root, "story/characters/char-compatible-a.json"), "utf8"),
  );
  const compatiblePositioning = JSON.parse(await readFile(join(root, "story/positioning.json"), "utf8"));
  const compatibleRelationships = JSON.parse(await readFile(join(root, "story/relationships.json"), "utf8"));
  assert(
    compatibleCharacter.age === "28" &&
      compatiblePositioning.targetWords === 2_500_000 &&
      Array.isArray(compatibleRelationships.relationships[0].evolution),
    "Profile 必须在写盘前把可无歧义转换的业务字段编码为规范类型。",
    { compatibleCharacter, compatiblePositioning, compatibleRelationships },
  );
  assert((await stat(untouchedPath)).mtimeMs === untouchedBefore, "原子提交不应重写本批未变化的 JSON 文件。");

  const singleItemEnvelope = await storyTool.execute("single-item-envelope", { action: "commit_changes", changeSet: {
    ...changeSetContract,
    storyId: projectInfo.storyId,
    baseRevision: miniMaxCompatible.details.revision,
    validationProfile: "draft",
    operations: { item: [
      {
        type: "patch",
        path: "story/positioning.json",
        value: { secondaryGenres: { item: "都市逆袭" }, benchmarkTitles: "" },
      },
      {
        type: "patch",
        path: "story/style.json",
        value: { forbiddenPatterns: { item: ["机械总结", "空洞升华"] } },
      },
      {
        type: "patch",
        path: "story/tracking/foreshadows.json",
        value: { foreshadows: null },
      },
      {
        type: "patch",
        path: "story/relationships.json",
        value: { relationships: { item: {
          id: "rel-compatible-a-b",
          fromCharacterId: "char-compatible-a",
          toCharacterId: "char-compatible-b",
          type: "搭档",
          emotionalDirection: "从试探到信任",
          currentState: "互相托底",
          conflict: "做事方式不同",
          evolution: "",
        } } },
      },
    ] },
  } }, undefined, undefined, undefined);
  assert(
    singleItemEnvelope.details.committed === true &&
      singleItemEnvelope.details.revision === miniMaxCompatible.details.revision + 1,
    "单层 item 信封、空字符串和 null 应能按目标数组类型安全归一化。",
    singleItemEnvelope.details,
  );
  const envelopePositioning = JSON.parse(await readFile(join(root, "story/positioning.json"), "utf8"));
  const envelopeStyle = JSON.parse(await readFile(join(root, "story/style.json"), "utf8"));
  const envelopeForeshadows = JSON.parse(await readFile(join(root, "story/tracking/foreshadows.json"), "utf8"));
  const envelopeRelationships = JSON.parse(await readFile(join(root, "story/relationships.json"), "utf8"));
  assert(
    JSON.stringify(envelopePositioning.secondaryGenres) === JSON.stringify(["都市逆袭"]) &&
      JSON.stringify(envelopePositioning.benchmarkTitles) === JSON.stringify([]) &&
      JSON.stringify(envelopeStyle.forbiddenPatterns) === JSON.stringify(["机械总结", "空洞升华"]) &&
      JSON.stringify(envelopeForeshadows.foreshadows) === JSON.stringify([]) &&
      envelopeRelationships.relationships.length === 1 &&
      JSON.stringify(envelopeRelationships.relationships[0].evolution) === JSON.stringify([]),
    "兼容输入必须以 Profile 声明的规范数组类型落盘。",
    { envelopePositioning, envelopeStyle, envelopeForeshadows, envelopeRelationships },
  );

  const nestedItemEnvelope = await storyTool.execute("nested-item-envelope", { action: "commit_changes", changeSet: {
    ...changeSetContract,
    storyId: projectInfo.storyId,
    baseRevision: singleItemEnvelope.details.revision,
    validationProfile: "draft",
    operations: [
      {
        type: "patch",
        path: "story/style.json",
        value: { forbiddenPatterns: { item: { item: ["不应通过"] } } },
      },
      {
        type: "patch",
        path: "story/positioning.json",
        value: {
          secondaryGenres: { item: { item: ["错误副类型"] } },
          benchmarkTitles: { item: { item: ["错误对标"] } },
        },
      },
    ],
  } }, undefined, undefined, undefined);
  assert(
    nestedItemEnvelope.details.committed === false &&
      nestedItemEnvelope.details.issues.some((issue: any) => issue.path === "story-style.forbiddenPatterns") &&
      nestedItemEnvelope.details.issues.some((issue: any) => issue.path === "story-positioning.secondaryGenres") &&
      nestedItemEnvelope.details.issues.some((issue: any) => issue.path === "story-positioning.benchmarkTitles"),
    "嵌套 item 信封不得递归恢复，且单次响应必须返回本批全部字段错误。",
    nestedItemEnvelope.details,
  );
  const styleAfterNestedEnvelope = JSON.parse(await readFile(join(root, "story/style.json"), "utf8"));
  assert(
    JSON.stringify(styleAfterNestedEnvelope.forbiddenPatterns) === JSON.stringify(["机械总结", "空洞升华"]),
    "嵌套 item 信封校验失败后不得修改正式文件。",
    styleAfterNestedEnvelope,
  );

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
  const rejectedTransport: any = await fallbackPackage.execute({
    action: "commit_changes",
    changeSet: {
      ...changeSetContract,
      profileVersion: "not-a-number",
      storyId: "fallback-story",
      baseRevision: "1",
      validationProfile: "draft",
      batch: { workflowId: "invalid-conversion", index: "1", label: "非法转换", final: "false" },
      operations: [{ type: "patch", path: "story/book.json", value: { title: "不应写入" } }],
    },
  });
  assert(
    rejectedTransport.committed === false &&
      rejectedTransport.issues.some(
        (issue: any) => issue.path === "changeSet.profileVersion" && issue.code.includes("invalid_type"),
      ),
    "无法安全转换的值必须返回逐字段结构化错误。",
    rejectedTransport,
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
      String(error).includes(
        STORY_PROJECT_IDENTIFIERS.projectApi.id + "@" + STORY_PROJECT_IDENTIFIERS.projectApi.version,
      ) && String(error).includes("readContext");
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
