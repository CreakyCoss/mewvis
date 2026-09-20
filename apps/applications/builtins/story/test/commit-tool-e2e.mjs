import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const tempDir = mkdtempSync(join(tmpdir(), "isle-claw-story-tool-"));
const workspace = join(tempDir, "workspace");
const entryPath = join(tempDir, "runner.ts");
const bundlePath = join(tempDir, "runner.mjs");
const definitionPath = resolve(root, "main/host/authoring/tool/definition.ts");
const repositoryPath = resolve(root, "main/host/adapters/project-file.ts");
const piSchemaPath = resolve(
  root,
  "../../../agent-runtime/src/engines/drivers/native/agent/runtimes/pi/tools/schema.ts",
);
const piValidationPath = resolve(
  root,
  "../../../../ai/pi/packages/ai/src/utils/validation.ts",
);

writeFileSync(
  entryPath,
  `
  import { mkdir, readFile, writeFile } from "node:fs/promises";
  import { STORY_TOOL, createStoryToolPackage } from ${JSON.stringify(definitionPath)};
  import { createNodeStoryToolRepository } from ${JSON.stringify(repositoryPath)};
  import { toPiToolParameters } from ${JSON.stringify(piSchemaPath)};
  import { validateToolArguments } from ${JSON.stringify(piValidationPath)};

  const assert = (condition: unknown, message: string, details?: unknown) => {
    if (!condition) throw new Error(message + (details === undefined ? "" : "\\n" + JSON.stringify(details, null, 2)));
  };
  const workspace = ${JSON.stringify(workspace)};
  await mkdir(workspace, { recursive: true });
  const tool = createStoryToolPackage(createNodeStoryToolRepository(workspace));

  assert(STORY_TOOL.contract.version === 2, "Story Tool Contract 应使用文档引用协议版本。");
  assert(STORY_TOOL.parameters.properties.changeSet.properties.storyTypeVersion.type === "integer", "工具参数应公开 storyTypeVersion。", STORY_TOOL.parameters);
  assert(!("profileVersion" in STORY_TOOL.parameters.properties.changeSet.properties), "工具参数不得再泄露 Profile。", STORY_TOOL.parameters);
  const operationParameters = STORY_TOOL.parameters.properties.changeSet.properties.operations.items;
  assert(operationParameters.type === "object", "operation 模型参数必须使用扁平对象，避免 array.items.anyOf 兼容问题。", operationParameters);
  assert(operationParameters.properties.type.type === "string" && operationParameters.properties.ref.type === "object", "扁平 operation 必须要求 type/ref。", operationParameters);
  assert(operationParameters.properties.value.optional && operationParameters.properties.items.optional, "不同 operation 的专属字段应保持可选，由 Story Project 严格校验。", operationParameters);
  const piStoryParameters = toPiToolParameters(STORY_TOOL.parameters);
  const piOperationParameters = piStoryParameters.properties.changeSet.properties.operations.items;
  assert(!("anyOf" in piOperationParameters), "发送给模型的 operation schema 不得重新生成 anyOf。", piOperationParameters);
  const piIdentityParameters = piOperationParameters.properties.ref.properties.identity;
  assert(
    Array.isArray(piIdentityParameters.anyOf) &&
      piIdentityParameters.anyOf.some((item) => item.type === "object") &&
      piIdentityParameters.anyOf.some((item) => item.type === "string") &&
      piOperationParameters.properties.ref.properties.identityValue.type === "string",
    "文档身份应向模型公开受约束的对象/字符串联合与扁平简写，不能继续退化成 Type.Any。",
    piOperationParameters.properties.ref,
  );
  const validatedTransport = validateToolArguments(
    { name: "story", parameters: piStoryParameters } as any,
    {
      name: "story",
      arguments: {
        action: "validate_changes",
        changeSet: {
          storyTypeId: "long-novel",
          storyTypeVersion: 4,
          storyId: "story-tool",
          baseRevision: 0,
          validationMode: "draft",
          operations: [
            { type: "upsert", ref: { kind: "story-chapter-content", identity: "chap-001" }, value: "正文" },
          ],
        },
      },
    } as any,
  );
  assert(
    validatedTransport.changeSet.operations[0].ref.identity === "chap-001",
    "Pi 参数校验必须允许兼容模型产生的单字段字符串 identity 进入 Story 归一化层。",
    validatedTransport,
  );

  const described = await tool.api.describeStructure();
  assert(described.structure.storyType.id === "long-novel", "空工作区 describe 应使用技能兜底故事类型。", described);
  assert(described.structure.roles.chapterContent === "story-chapter-content", "工具应公开语义角色。", described);
  assert(Object.keys(described.structure.schemas.documents).length === 0, "首次 describe 应保持轻量。", described);

  const initialized = await tool.api.initialize({ storyId: "story-tool", title: "工具故事" });
  assert(initialized.initialized && initialized.revision === 0, "工具应初始化完整故事项目。", initialized);
  const projectConfig = JSON.parse(await readFile(workspace + "/story/.isle-claw/project.json", "utf8"));
  assert(projectConfig.id === "long-novel" && Array.isArray(projectConfig.documents), "工作区只保存可独立解释的完整故事类型定义。", projectConfig);
  let legacyConfigFound = false;
  try { await readFile(workspace + "/story/.isle-claw/profile.json", "utf8"); legacyConfigFound = true; } catch {}
  assert(!legacyConfigFound, "不得再创建 profile.json 或编译锁文件。");

  const detailed = await tool.api.describeStructure({ documentKinds: ["story-book", "story-relationships"] });
  assert(detailed.structure.schemas.documents["story-book"].fields.title.label === "书名", "按需 describe 应返回字段 label。", detailed);
  const context = await tool.api.readContext({ scope: "project" });
  const agentContext = await tool.execute({ action: "read_context", scope: "project" }) as any;
  assert(
    agentContext.text === context.text &&
      agentContext.sections.every((section: any) => section.content.includes("不重复注入")),
    "Agent 工具输出应保留单份 text，并把 sections 降为来源元数据，避免上下文正文重复注入。",
    agentContext,
  );
  const malformed = await tool.api.validateChanges({
    changeSet: {
      storyTypeId: detailed.structure.storyType.id,
      storyTypeVersion: detailed.structure.storyType.version,
      storyId: "story-tool",
      baseRevision: context.revision,
      validationMode: "draft",
      operations: [{ type: "patch", ref: { kind: "story-book", identity: {} } }],
    },
  });
  assert(!malformed.valid, "模型 schema 扁平化后，Story Project 仍必须拒绝缺少 operation 专属字段的变更。", malformed);
  const committed = await tool.api.commitChanges({
    changeSet: {
      storyTypeId: detailed.structure.storyType.id,
      storyTypeVersion: String(detailed.structure.storyType.version),
      storyId: "story-tool",
      baseRevision: String(context.revision),
      validationMode: "draft",
      batch: { workflowId: "open-book", index: "1", label: "核心设定", final: "false" },
      operations: { item: { type: "patch", ref: { kind: "story-book", identity: {} }, value: { premise: "潮汐掩盖了真相。" } } },
    },
  });
  assert(committed.committed && committed.revision === 1, "工具应兼容无歧义的字符串数字、布尔值与单层数组信封。", committed);
  const book = JSON.parse(await readFile(workspace + "/story/book.json", "utf8"));
  assert(book.premise === "潮汐掩盖了真相。" && !("$schema" in book), "落盘应是普通业务 JSON。", book);

  const identityCommit = await tool.api.commitChanges({
    changeSet: {
      storyTypeId: detailed.structure.storyType.id,
      storyTypeVersion: detailed.structure.storyType.version,
      storyId: "story-tool",
      baseRevision: 1,
      validationMode: "draft",
      operations: [
        {
          type: "upsert",
          ref: { kind: "story-character", identity: "char-001" },
          value: { name: "字符串身份角色", role: "minor", memory: {} },
        },
        {
          type: "upsert",
          ref: { kind: "story-character", identityValue: "char-002" },
          value: { name: "扁平身份角色", role: "minor", memory: {} },
        },
        {
          type: "upsert",
          ref: { kind: "story-character-state", identityValue: "char-001" },
          value: {
            id: "state-char-001",
            identity: "调查员",
            location: "码头",
            physicalState: "正常",
            publicImage: "陌生人",
          },
        },
      ],
    },
  });
  assert(
    identityCommit.committed && identityCommit.revision === 2,
    "Story 工具应按该 kind 的 identityFields 恢复模型生成的字符串身份并写入文档。",
    identityCommit,
  );
  const [characterOne, characterTwo, characterState] = await Promise.all([
    readFile(workspace + "/story/characters/char-001.json", "utf8"),
    readFile(workspace + "/story/characters/char-002.json", "utf8"),
    readFile(workspace + "/story/tracking/character-states/char-001.json", "utf8"),
  ]);
  assert(
    characterOne.includes("字符串身份角色") &&
      characterTwo.includes("扁平身份角色") &&
      characterState.includes('"characterId": "char-001"'),
    "兼容身份必须落到各自文档，不能写入空身份或错误路径。",
    { characterOne, characterTwo, characterState },
  );

  const invalid = await tool.api.commitChanges({
    changeSet: {
      storyTypeId: detailed.structure.storyType.id,
      storyTypeVersion: detailed.structure.storyType.version,
      storyId: "story-tool",
      baseRevision: 2,
      validationMode: "draft",
      operations: [{ type: "patch", ref: { kind: "story-book", identity: {} }, value: { unknownField: "拒绝" } }],
    },
  });
  assert(!invalid.committed && invalid.issues.some((issue) => issue.message.includes("unknownField")), "未声明字段必须在写盘前拒绝。", invalid);
  const unchanged = JSON.parse(await readFile(workspace + "/story/manifest.json", "utf8"));
  assert(unchanged.revision === 2, "失败提交不得修改磁盘 revision。", unchanged);

  const mismatch = await tool.api.validateChanges({
    changeSet: {
      storyTypeId: detailed.structure.storyType.id,
      storyTypeVersion: detailed.structure.storyType.version + 1,
      storyId: "story-tool",
      baseRevision: 2,
      validationMode: "draft",
      operations: [{ type: "patch", ref: { kind: "story-book", identity: {} }, value: { premise: "不应接受" } }],
    },
  });
  assert(!mismatch.valid && mismatch.issues[0]?.message.includes("故事类型"), "故事类型版本不匹配必须拒绝。", mismatch);

  const replacementWorkspace = workspace + "-replacement";
  await mkdir(replacementWorkspace + "/story", { recursive: true });
  await writeFile(replacementWorkspace + "/story/book.json", "{\\"legacy\\":true}\\n", "utf8");
  await writeFile(replacementWorkspace + "/story/unused.json", "{}\\n", "utf8");
  const replacementTool = createStoryToolPackage(createNodeStoryToolRepository(replacementWorkspace));
  const replaced = await replacementTool.api.initialize({
    storyId: "replacement",
    title: "替换后的故事",
    replaceExisting: true,
  });
  assert(replaced.initialized, "明确允许后应替换未受管理的旧故事文件。", replaced);
  const replacedBook = JSON.parse(await readFile(replacementWorkspace + "/story/book.json", "utf8"));
  let unusedStillExists = true;
  try { await readFile(replacementWorkspace + "/story/unused.json", "utf8"); } catch { unusedStillExists = false; }
  assert(replacedBook.title === "替换后的故事" && !unusedStillExists, "替换初始化应覆盖标准文件并删除其他旧文件。", replacedBook);
  console.log("[story-commit-tool] ok");
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
