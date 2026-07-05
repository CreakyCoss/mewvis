import { build } from "esbuild";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const workspaceRoot = process.cwd();
const tempDir = mkdtempSync(join(tmpdir(), "novel-claw-story-import-bridge-"));
const entryPath = join(tempDir, "runner.ts");
const bundledPath = join(tempDir, "runner.mjs");
const importConverterPath = resolve(workspaceRoot, "src/features/pages/stories/story/actions/import/converter.ts");

writeFileSync(
  entryPath,
  `
  import {
    convertStorySourceToStoryJson,
    parseStoryJsonFromText,
  } from ${JSON.stringify(importConverterPath)};

  const assert = (condition: unknown, message: string, details?: unknown) => {
    if (!condition) {
      const suffix = details === undefined ? "" : "\\n" + JSON.stringify(details, null, 2);
      throw new Error(message + suffix);
    }
  };

  const source = JSON.stringify({
    version: 1,
    id: "story-imported",
    title: "潮汐档案",
    outline: "潮汐档案馆记录着失踪船只。",
    goal: "找出潮汐钟停摆原因。",
    userPersonaName: "调查人",
    characters: [
      {
        id: "archivist",
        name: "穆青檐",
        avatar: "blank-avatar",
        description: "档案馆管理员。",
        speakingStyle: "克制、少量反问。",
        memory: {
          required: "",
          public: "记得三点十七分的潮声。",
          known: "",
          privateSelf: "",
          directorSecret: "",
        },
      },
    ],
    lorebookEntries: [
      {
        id: "lore-clock",
        title: "潮汐钟",
        content: "潮汐钟只在港口潮差异常时停摆。",
        keywords: ["潮汐钟"],
        enabled: true,
        alwaysOn: true,
      },
    ],
    scenes: [
      {
        id: "scene-archive",
        title: "档案馆",
        scene: "雨夜，潮汐钟停在三点十七分。",
        goal: "核对巡检表。",
        plot: "发现缺页。",
        direction: "证据优先。",
        transition: "",
        memory: "",
      },
    ],
    graph: {
      entryNodeId: "node-archive",
      activeNodeId: "node-archive",
      nodes: [
        {
          id: "node-archive",
          sceneId: "scene-archive",
          title: "档案馆节点",
          type: "normal",
          pathRole: "main",
          status: "draft",
        },
      ],
      edges: [],
    },
    createdAt: 1_800_000_000_000,
    updatedAt: 1_800_000_000_000,
  });

  const parsed = parseStoryJsonFromText("前置文本\\n" + source + "\\n后置文本", {
    storyId: "story-target",
    title: "目标标题",
  });
  assert(
    parsed?.id === "story-target" &&
      parsed.title === "潮汐档案" &&
      parsed.characters[0]?.name === "穆青檐" &&
      parsed.lorebookEntries[0]?.title === "潮汐钟" &&
      parsed.graph.nodes[0]?.sceneId === "scene-archive",
    "标准 story.json 应可从混合文本中解析并归一化。",
    parsed,
  );

  const converted = await convertStorySourceToStoryJson({
    source,
    storyId: "story-converted",
  });
  assert(
    converted.id === "story-converted" &&
      converted.title === "潮汐档案",
    "标准 story.json 导入不应要求来源类型或运行模型。",
    converted,
  );

  assert(
    parseStoryJsonFromText("{\\"title\\":\\"缺少结构\\"}") === null,
    "不具备 story 结构的 JSON 不应被当成标准 story.json。",
  );
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
  console.log("[story-import-bridge] ok");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
