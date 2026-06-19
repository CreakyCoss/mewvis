import { build } from "esbuild";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const workspaceRoot = process.cwd();
const tempDir = mkdtempSync(join(tmpdir(), "novel-claw-tavern-core-e2e-"));
const entryPath = join(tempDir, "runner.ts");
const bundledPath = join(tempDir, "runner.mjs");
const corePath = resolve(workspaceRoot, "src/features/pages/tavern/core/index.ts");
const promptPath = resolve(workspaceRoot, "src/features/pages/tavern/runtime/prompt.ts");
const replyCleanupPath = resolve(workspaceRoot, "src/features/pages/tavern/runtime/reply-cleanup.ts");

const assert = (condition, message, details) => {
  if (!condition) {
    const suffix = details === undefined ? "" : `\n${JSON.stringify(details, null, 2)}`;
    throw new Error(`${message}${suffix}`);
  }
};

writeFileSync(entryPath, `
  import {
    createTavernRenderableMessages,
    extractTavernPendingInteractionsFromMessages,
    formatTavernVisibleMessagesForRequestContext,
    normalizeTavernMessagesForAudience,
    planTavernContinuation,
    tavernCharacterAgentRoleId,
    tavernArchivistAgentRoleId,
    tavernDirectorAgentRoleId,
    tavernManagedUserAgentRoleId,
    tavernQuickNovelAgentRoleId,
    tavernQuickReplyAgentRoleId,
  } from ${JSON.stringify(corePath)};
  import { buildTavernSystemPrompt } from ${JSON.stringify(promptPath)};
  import { parseTavernReplyText } from ${JSON.stringify(replyCleanupPath)};

  const now = Date.now();
  const room = {
    id: "room-alpha",
    workspaceId: "workspace",
    locked: false,
    title: "测试酒馆",
    storyOutline: "",
    storyGoal: "",
    activeSceneId: "scene-alpha",
    scenes: [],
    scenePresetId: "tavern",
    scene: "一间用于测试的酒馆。",
    sceneGoal: "",
    scenePlot: "",
    sceneDirection: "",
    sceneTransition: "",
    memory: "",
    characterConfigs: {},
    characterMemories: {},
    localCharacters: [],
    lorebookEntries: [],
    timelineEvents: [],
    assetDrafts: [],
    characterIds: ["char-a", "char-b"],
    activeCharacterId: "char-a",
    replyMode: "director",
    userPersonaName: "旅人",
    settings: {
      immersiveDescriptionEnabled: true,
      showExecutionTrace: false,
      autoAssetExtractionEnabled: false,
      assetExtractionIntervalTurns: 3,
      agentKnowledgeCompactIntervalTurns: 0,
      maxAssetDrafts: 5,
      directorMaxSpeakers: 3,
      continuation: {
        enabled: true,
        maxAutoContinuationRounds: 1,
        maxSpeakersPerContinuation: 1,
        stopWhenUserTargeted: true,
      },
      replyOptions: {
        enabled: true,
        count: 3,
      },
      statusTracking: {
        enabled: true,
        visibleToUser: true,
      },
      randomEvents: {
        enabled: false,
        probability: 0.15,
      },
      illustrationHints: {
        enabled: false,
      },
    },
    createdAt: now,
    updatedAt: now,
  };
  const characters = [
    {
      id: "char-a",
      name: "阿洛",
      avatar: "",
      description: "谨慎的斥候。",
      speakingStyle: "短句，谨慎。",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "char-b",
      name: "贝拉",
      avatar: "",
      description: "热情的酒保。",
      speakingStyle: "轻快。",
      createdAt: now,
      updatedAt: now,
    },
  ];
  const bSecret = "B_PRIVATE_SECRET_SHOULD_NOT_LEAK";
  const bSecondSecret = "B_SECOND_PRIVATE_SECRET_SHOULD_NOT_LEAK";
  const aSecret = "A_PRIVATE_SECRET_VISIBLE_TO_A";
  const aSecondSecret = "A_SECOND_PRIVATE_SECRET_VISIBLE_TO_A";
  const messages = [
    {
      id: "m-user",
      roomId: room.id,
      role: "user",
      content: "今晚谁守门？",
      createdAt: now,
      status: "done",
    },
    {
      id: "m-b",
      roomId: room.id,
      role: "character",
      characterId: "char-b",
      content: "<inner_thought>" + bSecret + "</inner_thought><reply>我去吧，门口的风我熟。</reply>",
      thought: bSecret,
      createdAt: now + 1,
      status: "done",
    },
    {
      id: "m-a",
      roomId: room.id,
      role: "character",
      characterId: "char-a",
      content: "<inner_thought>" + aSecret + "</inner_thought><reply>我在屋顶看第二道影子。</reply>",
      thought: aSecret,
      createdAt: now + 2,
      status: "done",
    },
    {
      id: "m-user-2",
      roomId: room.id,
      role: "user",
      content: "第二轮，先确认各自位置。",
      createdAt: now + 3,
      status: "done",
    },
    {
      id: "m-b-2",
      roomId: room.id,
      role: "character",
      characterId: "char-b",
      content: "<inner_thought>" + bSecondSecret + "</inner_thought><reply>我还在门口，能看见灯影。</reply>",
      thought: bSecondSecret,
      createdAt: now + 4,
      status: "done",
    },
    {
      id: "m-a-2",
      roomId: room.id,
      role: "character",
      characterId: "char-a",
      content: "<inner_thought>" + aSecondSecret + "</inner_thought><reply>屋顶安全，我继续盯着第二道影子。</reply>",
      thought: aSecondSecret,
      createdAt: now + 5,
      status: "done",
    },
  ];
  const currentTurnMessages = messages.slice(3, 5);

  const visibleToA = normalizeTavernMessagesForAudience({
    messages,
    characters,
    userPersonaName: room.userPersonaName,
    audience: { type: "character", characterId: "char-a" },
  });
  const contextForA = formatTavernVisibleMessagesForRequestContext(visibleToA);
  const currentTurnContextForA = formatTavernVisibleMessagesForRequestContext(
    normalizeTavernMessagesForAudience({
      messages: currentTurnMessages,
      characters,
      userPersonaName: room.userPersonaName,
      audience: { type: "character", characterId: "char-a" },
    }),
  );
  const promptForA = buildTavernSystemPrompt({
    room,
    activeCharacter: characters[0],
    characters,
    references: [],
    currentUserText: "第二轮，先确认各自位置。",
    turnInstruction: "本轮只测试身份约束。",
  });
  const mixedSpeakerReply = parseTavernReplyText({
    text: "<inner_thought>我得继续盯住高处。</inner_thought><reply>我先留在屋顶。\\n贝拉：门口交给我。</reply>",
    activeCharacter: characters[0],
    characters,
    userPersonaName: room.userPersonaName,
  });
  const activeSegmentReply = parseTavernReplyText({
    text: "贝拉：门口的风我熟。\\n阿洛：我守屋顶。\\n旁白：灯暗下来。",
    activeCharacter: characters[0],
    characters,
    userPersonaName: room.userPersonaName,
  });
  const wrongRoleReply = parseTavernReplyText({
    text: "<inner_thought>我好像是贝拉。</inner_thought><reply>贝拉：门口交给我。</reply>",
    activeCharacter: characters[0],
    characters,
    userPersonaName: room.userPersonaName,
  });
  const directAddressReply = parseTavernReplyText({
    text: "<inner_thought>我替阿洛顶一会儿。</inner_thought><reply>阿洛你安心歇着，门闩我压着呢。</reply>",
    activeCharacter: characters[1],
    characters,
    userPersonaName: room.userPersonaName,
  });
  const missingReplyWrapper = parseTavernReplyText({
    text: "<inner_thought>我得留意东边。</inner_thought>\\n\\n*阿洛压低身形。*\\n\\n东边灯影在动，我继续盯着。",
    activeCharacter: characters[0],
    characters,
    userPersonaName: room.userPersonaName,
  });
  const unclosedThoughtWithReply = parseTavernReplyText({
    text: "<inner_thought>我得留意东边。\\n<reply>东边灯影在动，我继续盯着。</reply>",
    activeCharacter: characters[0],
    characters,
    userPersonaName: room.userPersonaName,
  });
  const unclosedThoughtWithLooseContent = parseTavernReplyText({
    text: "<inner_thought>我得留意东边。\\n\\n东边灯影在动，我继续盯着。",
    activeCharacter: characters[0],
    characters,
    userPersonaName: room.userPersonaName,
  });
  const unclosedActionMarkdown = parseTavernReplyText({
    text: "<inner_thought>我得留意东边。</inner_thought><reply>东边灯影还亮着。*阿洛把披风拢紧。</reply>",
    activeCharacter: characters[0],
    characters,
    userPersonaName: room.userPersonaName,
  });
  const bAsksA = {
    id: "m-b-asks-a",
    roomId: room.id,
    role: "character",
    characterId: "char-b",
    content: "阿洛，你听见门外那声铃了吗？",
    createdAt: now + 6,
    status: "done",
  };
  const bAsksUser = {
    id: "m-b-asks-user",
    roomId: room.id,
    role: "character",
    characterId: "char-b",
    content: "来客，你要先查怀表吗？",
    createdAt: now + 7,
    status: "done",
  };
  const aAnswersB = {
    id: "m-a-answers-b",
    roomId: room.id,
    role: "character",
    characterId: "char-a",
    content: "我听见了，铃声从门外左侧传来。",
    createdAt: now + 8,
    status: "done",
  };
  const userAsksGroup = {
    id: "m-user-asks-group",
    roomId: room.id,
    role: "user",
    content: "你们谁能先确认门外情况？",
    createdAt: now + 9,
    status: "done",
  };
  const interactionsForA = extractTavernPendingInteractionsFromMessages({
    messages: [bAsksA],
    characters,
    userPersonaName: room.userPersonaName,
    turnId: "turn-a",
  });
  const continuationForA = planTavernContinuation({
    pendingInteractions: interactionsForA,
    characters,
    continuationRound: 0,
    maxAutoContinuationRounds: 1,
    maxSpeakersPerContinuation: 1,
    stopWhenUserTargeted: true,
  });
  const interactionsForUser = extractTavernPendingInteractionsFromMessages({
    messages: [bAsksUser],
    characters,
    userPersonaName: room.userPersonaName,
    turnId: "turn-user",
  });
  const continuationForUser = planTavernContinuation({
    pendingInteractions: interactionsForUser,
    characters,
    continuationRound: 0,
    maxAutoContinuationRounds: 1,
    maxSpeakersPerContinuation: 1,
    stopWhenUserTargeted: true,
  });
  const interactionsForAnsweredA = extractTavernPendingInteractionsFromMessages({
    messages: [bAsksA, aAnswersB],
    characters,
    userPersonaName: room.userPersonaName,
    turnId: "turn-a-answered",
  });
  const interactionsForAnsweredGroup = extractTavernPendingInteractionsFromMessages({
    messages: [userAsksGroup, aAnswersB],
    characters,
    userPersonaName: room.userPersonaName,
    turnId: "turn-group-answered",
  });
  globalThis.__checks = {
    contextForA,
    currentTurnContextForA,
    promptForA,
    mixedSpeakerReply,
    activeSegmentReply,
    wrongRoleReply,
    directAddressReply,
    missingReplyWrapper,
    unclosedThoughtWithReply,
    unclosedThoughtWithLooseContent,
    unclosedActionMarkdown,
    interactionsForA,
    continuationForA,
    interactionsForUser,
    continuationForUser,
    interactionsForAnsweredA,
    interactionsForAnsweredGroup,
    renderable: createTavernRenderableMessages({
      messages,
      characters,
      userPersonaName: room.userPersonaName,
    }),
    roleIds: {
      a: tavernCharacterAgentRoleId(room, characters[0]),
      b: tavernCharacterAgentRoleId(room, characters[1]),
      director: tavernDirectorAgentRoleId(room),
      managed: tavernManagedUserAgentRoleId(room),
      quick: tavernQuickReplyAgentRoleId(room),
      novel: tavernQuickNovelAgentRoleId(room),
      archivist: tavernArchivistAgentRoleId(room),
    },
    bSecret,
    bSecondSecret,
    aSecret,
    aSecondSecret,
  };
`, "utf8");

try {
  await build({
    entryPoints: [entryPath],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    outfile: bundledPath,
    external: ["react", "react-dom"],
    alias: {
      "@": resolve(workspaceRoot, "src"),
    },
    logLevel: "silent",
  });

  await import(pathToFileURL(bundledPath).href);
  const checks = globalThis.__checks;

  assert(checks.contextForA.includes(checks.aSecret), "A 应能看到自己的心理");
  assert(checks.contextForA.includes(checks.aSecondSecret), "多轮后 A 仍应能看到自己的心理");
  assert(!checks.contextForA.includes(checks.bSecret), "A 的 request_context 不应包含 B 的心理");
  assert(!checks.contextForA.includes(checks.bSecondSecret), "多轮后 A 的 request_context 不应包含 B 的心理");
  assert(
    checks.contextForA.includes("我去吧，门口的风我熟。"),
    "A 应能看到 B 的公开发言",
    checks.contextForA,
  );
  assert(
    checks.currentTurnContextForA.includes("我还在门口，能看见灯影。"),
    "A 本轮 request_context 应包含前序角色的公开发言",
    checks.currentTurnContextForA,
  );
  assert(
    !checks.currentTurnContextForA.includes(checks.bSecondSecret),
    "A 本轮 request_context 不应包含前序角色的心理",
    checks.currentTurnContextForA,
  );
  assert(
    checks.promptForA.includes("这轮只允许以「阿洛」的身份发言") &&
      !checks.promptForA.includes("这轮只允许以「贝拉」的身份发言"),
    "A 的角色 prompt 必须锁定 A 身份",
    checks.promptForA,
  );
  assert(
    checks.promptForA.includes("不要代替用户说话") &&
      checks.promptForA.includes("不要替其他角色完整发言"),
    "A 的角色 prompt 必须约束不得替他人发言",
    checks.promptForA,
  );
  assert(
    checks.mixedSpeakerReply.content === "我先留在屋顶。" &&
      checks.mixedSpeakerReply.thought === "我得继续盯住高处。",
    "解析器应剥离同一段内混入的 B 角色发言",
    checks.mixedSpeakerReply,
  );
  assert(
    checks.activeSegmentReply.content === "我守屋顶。",
    "解析器应只保留 A 的发言片段",
    checks.activeSegmentReply,
  );
  assert(
    checks.wrongRoleReply.content === "",
    "解析器遇到纯 B 角色发言时不应把它当成 A 的回复",
    checks.wrongRoleReply,
  );
  assert(
    checks.directAddressReply.content === "阿洛你安心歇着，门闩我压着呢。",
    "解析器应保留对其他角色的正常直接称呼",
    checks.directAddressReply,
  );
  assert(
    checks.missingReplyWrapper.content.includes("东边灯影在动") &&
      !checks.missingReplyWrapper.content.includes("我得留意东边"),
    "解析器应能处理缺失 reply 标签但有 thought 标签的输出",
    checks.missingReplyWrapper,
  );
  assert(
    checks.unclosedThoughtWithReply.thought === "我得留意东边。" &&
      checks.unclosedThoughtWithReply.content === "东边灯影在动，我继续盯着。",
    "解析器应能处理未闭合 thought 后接 reply 的输出",
    checks.unclosedThoughtWithReply,
  );
  assert(
    checks.unclosedThoughtWithLooseContent.thought === "我得留意东边。" &&
      checks.unclosedThoughtWithLooseContent.content === "东边灯影在动，我继续盯着。",
    "解析器应能处理未闭合 thought 后直接接正文的输出",
    checks.unclosedThoughtWithLooseContent,
  );
  assert(
    checks.unclosedActionMarkdown.content === "东边灯影还亮着。阿洛把披风拢紧。",
    "解析器应移除未配对的动作 Markdown 标记",
    checks.unclosedActionMarkdown,
  );
  assert(
    checks.interactionsForA.length === 1 &&
      checks.interactionsForA[0].target.type === "character" &&
      checks.interactionsForA[0].target.characterIds[0] === "char-a",
    "B 问 A 时应抽取为指向 A 的待回应事项",
    checks.interactionsForA,
  );
  assert(
    checks.continuationForA.shouldContinue &&
      checks.continuationForA.speakerIds[0] === "char-a" &&
      checks.continuationForA.reason === "character_targeted",
    "B 问 A 后应自动续调度 A 回应",
    checks.continuationForA,
  );
  assert(
    checks.interactionsForUser.length === 1 &&
      checks.interactionsForUser[0].target.type === "user",
    "角色问用户时应抽取为指向用户的待回应事项",
    checks.interactionsForUser,
  );
  assert(
    !checks.continuationForUser.shouldContinue &&
      checks.continuationForUser.reason === "user_targeted",
    "角色问用户时应停止自动续调度并等待用户",
    checks.continuationForUser,
  );
  assert(
    checks.interactionsForAnsweredA.length === 0,
    "B 问 A 后如果 A 已在同轮后续回应，不应残留 pending",
    checks.interactionsForAnsweredA,
  );
  assert(
    checks.interactionsForAnsweredGroup.length === 0,
    "用户面向全场提问后如果已有角色回应，不应残留 pending",
    checks.interactionsForAnsweredGroup,
  );
  assert(
    checks.renderable.some((message) => message.thought === checks.bSecret),
    "UI 渲染模型应保留角色心理用于展示",
    checks.renderable,
  );
  assert(
    new Set(Object.values(checks.roleIds)).size === Object.values(checks.roleIds).length,
    "导演、角色、快捷回复、托管用户、小说写作、资产整理都应有独立 agentRoleId",
    checks.roleIds,
  );

  console.log(JSON.stringify({ ok: true, checks: checks.roleIds }, null, 2));
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
