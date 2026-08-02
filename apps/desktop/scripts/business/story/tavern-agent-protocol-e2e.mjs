import { build } from "esbuild";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const workspaceRoot = process.cwd();
const tempDir = mkdtempSync(join(tmpdir(), "isle-claw-tavern-agent-protocol-"));
const entryPath = join(tempDir, "runner.ts");
const bundledPath = join(tempDir, "runner.mjs");
const parsePath = resolve(workspaceRoot, "src/features/pages/stories/tavern/room/agent-protocol/codecs/xml/parse.ts");
const cleanupPath = resolve(workspaceRoot, "src/features/pages/stories/tavern/room/message/normalization/cleanup.ts");
const normalizeMessagePath = resolve(
  workspaceRoot,
  "src/features/pages/stories/tavern/room/message/normalization/message.ts",
);

writeFileSync(
  entryPath,
  `
  import { parseXmlOutput } from ${JSON.stringify(parsePath)};
  import { cleanAgentOutputContent } from ${JSON.stringify(cleanupPath)};
  import { normalizeMessageForAudience } from ${JSON.stringify(normalizeMessagePath)};

  const assert = (condition: unknown, message: string, details?: unknown) => {
    if (!condition) {
      const suffix = details === undefined ? "" : "\\n" + JSON.stringify(details, null, 2);
      throw new Error(message + suffix);
    }
  };

  const outputContent = (data: ReturnType<typeof parseXmlOutput>, key: string) =>
    data.find((item) => item.type === key)?.content;

  const camelCaseAliases = parseXmlOutput(
    "<privateThought>先观察</privateThought><publicReply>欢迎回来</publicReply>",
  );
  assert(
    outputContent(camelCaseAliases, "privateThought") === "先观察" &&
      outputContent(camelCaseAliases, "publicReply") === "欢迎回来",
    "camelCase 兼容标签应映射到 canonical 字段。",
    camelCaseAliases,
  );

  const ambiguousBodyAlias = parseXmlOutput("<正文>雨声压低了门外的脚步。</正文>");
  assert(
    outputContent(ambiguousBodyAlias, "publicReply") === "雨声压低了门外的脚步。",
    "兼容标签应独立于请求字段完成解析。",
    ambiguousBodyAlias,
  );

  const fence = String.fromCharCode(96).repeat(3);
  const fencedOutput = parseXmlOutput(
    [
      fence + "xml",
      "<行动>- 推开木门</行动>",
      "<回应>柜台后的人抬起了头。</回应>",
      fence,
    ].join("\\n"),
  );
  assert(
    outputContent(fencedOutput, "action") === "推开木门" &&
      outputContent(fencedOutput, "publicReply") === "柜台后的人抬起了头。",
    "代码围栏、中文别名和列表前缀应在解析后清理。",
    fencedOutput,
  );

  const malformedOutput = parseXmlOutput(
    "<publicReply>先坐吧。\\n<action>把椅子拉到火炉边</action>",
  );
  assert(
    outputContent(malformedOutput, "publicReply") === "先坐吧。" &&
      outputContent(malformedOutput, "action") === "把椅子拉到火炉边",
    "缺失闭合标签时应保留下一已知标签之前的可恢复内容。",
    malformedOutput,
  );

  const repeatedAndEmptyOutput = parseXmlOutput(
    "<action></action><publicReply>第一句</publicReply><publicReply>第二句</publicReply>",
  );
  assert(
    repeatedAndEmptyOutput.map((item) => item.type).join(",") === "action,publicReply,publicReply" &&
      repeatedAndEmptyOutput.map((item) => item.content).join("|") === "|第一句|第二句",
    "空字段和重复字段也应完整保留给消费端决定如何处理。",
    repeatedAndEmptyOutput,
  );

  const orderedOutput = parseXmlOutput(
    "开场正文<privateThought>先观察</privateThought>中间正文<action>推门</action>收尾正文",
  );
  assert(
    orderedOutput.map((item) => item.type).join(",") ===
      "unwrappedText,privateThought,unwrappedText,action,unwrappedText" &&
      orderedOutput.map((item) => item.content).join("|") === "开场正文|先观察|中间正文|推门|收尾正文",
    "解析结果应保留输出字段与标签外正文的原始顺序。",
    orderedOutput,
  );

  assert(
    cleanAgentOutputContent("<dialogue>别把协议标签显示出来。</dialogue>") === "别把协议标签显示出来。",
    "消息渲染前应剥离残留协议标签。",
  );

  const renderable = normalizeMessageForAudience({
    message: {
      id: "message-ordered",
      role: "character",
      characterId: "character-1",
      body: {
        type: "agent_output",
        format: "xml",
        rawText:
          "开场正文<privateThought>心里一紧</privateThought><action>推开门</action><publicReply>请进。</publicReply>",
      },
      createdAt: 1,
      presentation: {
        profileId: "dialogue-chat",
        userInputMode: "speech",
      },
    },
    characterById: new Map([["character-1", { id: "character-1", name: "守门人" }]]),
    userName: "我",
    audience: { type: "ui", includeAllThoughts: true },
  });
  assert(
    renderable.segments.map((segment) => segment.type).join(",") === "dialogue,thought,action,dialogue",
    "消息标准化应按协议数据列表顺序直接生成渲染片段。",
    renderable.segments,
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
    },
  });
  await import(pathToFileURL(bundledPath).href);
  console.log("[tavern-agent-protocol] ok");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
