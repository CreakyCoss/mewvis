import { build } from "esbuild";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const workspaceRoot = process.cwd();
const tempDir = mkdtempSync(join(tmpdir(), "novel-claw-story-import-bridge-"));
const entryPath = join(tempDir, "runner.ts");
const bundledPath = join(tempDir, "runner.mjs");
const storyPath = resolve(workspaceRoot, "src/features/story/index.ts");

writeFileSync(entryPath, `
  import {
    assertStoryImportDraftReady,
    createStoryImportDraftFromJsonValue,
    createStoryImportDraftFromText,
  } from ${JSON.stringify(storyPath)};

  const assert = (condition: unknown, message: string, details?: unknown) => {
    if (!condition) {
      const suffix = details === undefined ? "" : "\\n" + JSON.stringify(details, null, 2);
      throw new Error(message + suffix);
    }
  };

  const characterDraft = createStoryImportDraftFromText(JSON.stringify({
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: {
      name: "铃央",
      description: "守灯人，记忆力很好。",
      personality: "冷静，先观察再回答。",
      scenario: "雨巷旧灯下，信使失踪。",
      first_mes: "灯刚刚灭过一次。",
      mes_example: "铃央：我先看灯芯。",
      system_prompt: "保持守灯人的谨慎，不替用户行动。",
      character_book: {
        entries: [
          {
            key: ["灯芯"],
            comment: "灯芯",
            content: "灯芯混入银粉时会发出冷白光。",
            constant: true,
            disable: false,
          },
        ],
      },
    },
  }), { sourceKind: "json" });
  assertStoryImportDraftReady(characterDraft);
  assert(
    characterDraft.mode === "story" &&
      characterDraft.sourceKind === "characterCard" &&
      characterDraft.story.title === "铃央（角色卡导入）" &&
      characterDraft.characters[0]?.name === "铃央" &&
      characterDraft.characters[0]?.description.includes("守灯人") &&
      characterDraft.characters[0]?.replyStylePrompt === "保持守灯人的谨慎，不替用户行动。" &&
      characterDraft.scenes[0]?.scene.includes("信使失踪") &&
      characterDraft.lorebookEntries[0]?.title === "灯芯" &&
      characterDraft.lorebookEntries[0]?.alwaysOn &&
      characterDraft.messages[0]?.role === "character",
    "角色卡 JSON 应转换为故事导入草稿。",
    characterDraft,
  );

  const worldBookDraft = createStoryImportDraftFromJsonValue({
    name: "雨巷世界书",
    entries: {
      0: {
        uid: 0,
        key: ["旧灯"],
        keysecondary: ["雨巷"],
        comment: "旧灯",
        content: "雨巷旧灯只会在子夜前后闪烁。",
        constant: false,
        disable: false,
      },
      1: {
        uid: 1,
        key: ["停用"],
        comment: "停用条目",
        content: "这条应该以禁用状态导入。",
        constant: false,
        disable: true,
      },
    },
  });
  assertStoryImportDraftReady(worldBookDraft);
  assert(
    worldBookDraft.mode === "lorebookPatch" &&
      worldBookDraft.sourceKind === "worldBook" &&
      worldBookDraft.lorebookEntries[0]?.title === "旧灯" &&
      worldBookDraft.lorebookEntries[0]?.keywords.includes("旧灯") &&
      worldBookDraft.lorebookEntries[0]?.keywords.includes("雨巷") &&
      worldBookDraft.lorebookEntries[1]?.enabled === false,
    "世界书 JSON 应转换为世界书补丁草稿。",
    worldBookDraft,
  );

  const standardDraft = createStoryImportDraftFromJsonValue({
    story: {
      title: "潮汐档案",
      outline: "潮汐档案馆记录着失踪船只。",
      goal: "找出潮汐钟停摆原因。",
      userPersonaName: "调查人",
    },
    characters: [
      {
        id: "archivist",
        name: "穆青檐",
        description: "档案馆管理员。",
        speakingStyle: "克制、少量反问。",
        memory: "记得三点十七分的潮声。",
      },
    ],
    scenes: [
      {
        id: "scene-archive",
        title: "档案馆",
        scene: "雨夜，潮汐钟停在三点十七分。",
        goal: "核对巡检表。",
        characterIds: ["archivist"],
      },
    ],
    lorebookEntries: [
      {
        title: "潮汐钟",
        content: "潮汐钟只在港口潮差异常时停摆。",
        keywords: ["潮汐钟"],
      },
    ],
  });
  assertStoryImportDraftReady(standardDraft);
  assert(
    standardDraft.sourceKind === "json" &&
      standardDraft.story.title === "潮汐档案" &&
      standardDraft.characters[0]?.id === "archivist" &&
      standardDraft.scenes[0]?.id === "scene-archive" &&
      standardDraft.lorebookEntries[0]?.title === "潮汐钟",
    "标准故事 JSON 应按故事草稿导入。",
    standardDraft,
  );

  const plainTextDraft = createStoryImportDraftFromText("# 雾港档案\\n潮声在午夜后变得很轻。");
  assertStoryImportDraftReady(plainTextDraft);
  assert(
    plainTextDraft.sourceKind === "plainText" &&
      plainTextDraft.story.title === "雾港档案" &&
      plainTextDraft.scenes[0]?.scene.includes("潮声在午夜后变得很轻"),
    "纯文本应转换为故事草稿。",
    plainTextDraft,
  );

  let oldTavernCardError = "";
  try {
    createStoryImportDraftFromJsonValue({
      type: "novel-claw:tavern-character",
      version: 1,
      name: "旧角色",
      description: "旧酒馆角色卡。",
      speakingStyle: "旧格式。",
    });
  } catch (error) {
    oldTavernCardError = error instanceof Error ? error.message : String(error);
  }
  assert(
    oldTavernCardError.includes("没有可识别"),
    "旧 tavern 角色卡内部格式不应再作为故事导入格式接收。",
    oldTavernCardError,
  );
`);

try {
  await build({
    entryPoints: [entryPath],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: bundledPath,
    target: "node22",
  });
  await import(pathToFileURL(bundledPath).href);
  console.log("[story-import-bridge] ok");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
