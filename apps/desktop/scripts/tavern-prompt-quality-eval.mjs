import { execFileSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const workspaceRoot = process.cwd();
const bridgePath = join(workspaceRoot, "agent-bridge/dist/index.js");
const configDbPath = process.env.NOVEL_CLAW_CONFIG_DB?.trim()
  || join(homedir(), ".novel-claw", "config.db");
const workspacePath = mkdtempSync(join(tmpdir(), "novel-claw-tavern-prompt-quality-"));
const helperEntryPath = join(workspacePath, "tavern-prompt-quality-helper.ts");
const helperBundlePath = join(workspacePath, "tavern-prompt-quality-helper.mjs");
const reportPath = process.env.NOVEL_CLAW_TAVERN_PROMPT_EVAL_REPORT?.trim()
  || join(workspaceRoot, "tmp", "tavern-prompt-quality-eval.json");
const runMarker = `TAVERN_PROMPT_QUALITY_${Date.now()}`;

const SPEED_MODEL_IDS = [
  "MiniMax-M3-highspeed",
  "MiniMax-M2.7-highspeed",
];
const MODEL_IDS = (process.env.NOVEL_CLAW_TAVERN_PROMPT_EVAL_MODELS?.trim()
  ? process.env.NOVEL_CLAW_TAVERN_PROMPT_EVAL_MODELS.split(",")
  : SPEED_MODEL_IDS)
  .map((id) => id.trim())
  .filter(Boolean);
const LIVE_TIMEOUT_MS = Number(process.env.NOVEL_CLAW_TAVERN_PROMPT_EVAL_TIMEOUT_MS ?? 6 * 60 * 1000);
const SPEED_TIMEOUT_MS = Number(process.env.NOVEL_CLAW_TAVERN_SPEED_TIMEOUT_MS ?? 90 * 1000);
const THINKING_LEVEL = process.env.NOVEL_CLAW_LIVE_THINKING?.trim() || "off";
const CASE_FILTER = process.env.NOVEL_CLAW_TAVERN_PROMPT_EVAL_CASE?.trim() || "";
const KEEP_WORKSPACE = process.env.NOVEL_CLAW_KEEP_TAVERN_PROMPT_EVAL_WORKSPACE === "1";
const CONTENT_JUDGE_ENABLED = process.env.NOVEL_CLAW_TAVERN_PROMPT_EVAL_CONTENT_JUDGE !== "0";
const CONTENT_JUDGE_ALL_SPEED_MODELS =
  process.env.NOVEL_CLAW_TAVERN_PROMPT_EVAL_JUDGE_ALL_SPEED_MODELS !== "0";

const MODEL_DEFAULTS = {
  "MiniMax-M3-highspeed": {
    provider: "minimax-cn",
    apiFormat: "anthropic-messages",
    catalogModelId: "MiniMax-M3",
    modelId: "MiniMax-M3-highspeed",
    apiEndpoint: "https://api.minimaxi.com/anthropic",
    reasoning: true,
    input: ["text", "image"],
    cost: {
      input: 0.6,
      output: 2.4,
      cacheRead: 0.12,
      cacheWrite: 0,
    },
    contextWindow: 1_000_000,
    maxTokens: 128_000,
  },
  "MiniMax-M2.7-highspeed": {
    provider: "minimax-cn",
    apiFormat: "anthropic-messages",
    catalogModelId: "MiniMax-M2.7-highspeed",
    modelId: "MiniMax-M2.7-highspeed",
    apiEndpoint: "https://api.minimaxi.com/anthropic",
    reasoning: true,
    input: ["text"],
    cost: {
      input: 0.6,
      output: 2.4,
      cacheRead: 0.06,
      cacheWrite: 0.375,
    },
    contextWindow: 204_800,
    maxTokens: 131_072,
  },
};

const EVAL_CASES = [
  {
    id: "dialogue-default",
    label: "对话演绎 / 当前默认",
    packageId: "default-dialogue",
    presentationProfileId: "dialogue-chat",
    systemNarrativePresetId: "balanced",
    promptStyleId: "novel",
    ruleCompositionId: "none",
    qualityRuleIds: [],
    immersiveDescriptionEnabled: true,
  },
  {
    id: "dialogue-grounded",
    label: "对话演绎 / 写实对话",
    packageId: "chat-grounded-roleplay",
    presentationProfileId: "dialogue-chat",
    systemNarrativePresetId: "balanced",
    promptStyleId: "grounded",
    ruleCompositionId: "none",
    qualityRuleIds: ["anti-ai-natural", "natural-dialogue", "concise-no-summary"],
    immersiveDescriptionEnabled: true,
  },
  {
    id: "dialogue-polished",
    label: "对话演绎 / 轻快可承接",
    packageId: "chat-character-banter",
    presentationProfileId: "dialogue-chat",
    systemNarrativePresetId: "balanced",
    promptStyleId: "light-novel",
    ruleCompositionId: "ciweimao-acg-fun",
    qualityRuleIds: ["anti-ai-natural", "natural-dialogue", "concise-no-summary"],
    immersiveDescriptionEnabled: true,
  },
  {
    id: "novel-default",
    label: "小说正文 / 当前默认",
    packageId: "default-novel",
    presentationProfileId: "novel-prose",
    systemNarrativePresetId: "balanced",
    promptStyleId: "novel",
    ruleCompositionId: "none",
    qualityRuleIds: [],
    immersiveDescriptionEnabled: true,
  },
  {
    id: "novel-cinematic",
    label: "小说正文 / 镜头场面",
    packageId: "novel-cinematic-suspense",
    presentationProfileId: "novel-prose",
    systemNarrativePresetId: "dramatic",
    promptStyleId: "silent-law",
    ruleCompositionId: "qidian-longform",
    qualityRuleIds: ["anti-ai-natural", "concise-no-summary", "reduce-empty-ambience"],
    immersiveDescriptionEnabled: true,
  },
  {
    id: "novel-literary",
    label: "小说正文 / 克制文学",
    packageId: "novel-grounded-literary",
    presentationProfileId: "novel-prose",
    systemNarrativePresetId: "restrained",
    promptStyleId: "grounded",
    ruleCompositionId: "zhihu-yanxuan-short",
    qualityRuleIds: ["anti-ai-natural", "natural-dialogue", "concise-no-summary"],
    immersiveDescriptionEnabled: true,
  },
  {
    id: "third-person-default",
    label: "第三人称旁白 / 当前默认",
    packageId: "default-third-person",
    presentationProfileId: "third-person-prose",
    systemNarrativePresetId: "balanced",
    promptStyleId: "novel",
    ruleCompositionId: "none",
    qualityRuleIds: [],
    immersiveDescriptionEnabled: true,
  },
  {
    id: "third-person-grounded",
    label: "第三人称旁白 / 间接叙事",
    packageId: "third-person-grounded-observer",
    presentationProfileId: "third-person-prose",
    systemNarrativePresetId: "restrained",
    promptStyleId: "grounded",
    ruleCompositionId: "zhihu-yanxuan-short",
    qualityRuleIds: ["anti-ai-natural", "concise-no-summary", "reduce-empty-ambience"],
    immersiveDescriptionEnabled: true,
  },
];

const activeEvalCases = EVAL_CASES.filter((item) =>
  !CASE_FILTER || item.id.includes(CASE_FILTER) || item.packageId.includes(CASE_FILTER)
);

if (!existsSync(bridgePath)) {
  throw new Error("agent-bridge/dist/index.js 不存在，请先运行 pnpm build:agent-bridge");
}
if (!existsSync(configDbPath)) {
  throw new Error(`配置库不存在：${configDbPath}`);
}
if (activeEvalCases.length === 0) {
  throw new Error(`没有匹配 NOVEL_CLAW_TAVERN_PROMPT_EVAL_CASE=${CASE_FILTER} 的评估用例`);
}

const safeDetails = (value) =>
  JSON.parse(JSON.stringify(value, (key, item) => {
    if (key === "apiKey" || key === "api_key") {
      return item ? "<redacted>" : item;
    }
    return item;
  }));

const assert = (condition, message, details) => {
  if (!condition) {
    const suffix = details === undefined ? "" : `\n${JSON.stringify(safeDetails(details), null, 2)}`;
    throw new Error(`${message}${suffix}`);
  }
};

const log = (...args) => {
  console.error("[tavern-prompt-quality]", ...args);
};

const sqlString = (value) => `'${String(value).replaceAll("'", "''")}'`;

const queryConfigDb = (query) => {
  const output = execFileSync("sqlite3", ["-json", configDbPath, query], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(output || "[]");
};

const loadMiniMaxProvider = () => {
  const [row] = queryConfigDb([
    "select",
    "id, provider, api_format as apiFormat, api_key as apiKey, api_endpoint as apiEndpoint",
    "from llm_providers",
    "where provider = 'minimax-cn'",
    "and coalesce(api_key, '') <> ''",
    "order by is_default desc",
    "limit 1",
  ].join(" "));
  assert(row, "未在 ~/.novel-claw/config.db 中找到已配置 API Key 的 minimax-cn provider");
  return row;
};

const loadProviderModelRow = (providerId, modelId) => {
  const [row] = queryConfigDb([
    "select",
    "model_id as modelId, model_name as modelName, is_one_million_context as isOneMillionContext",
    "from provider_models",
    `where provider_id = ${sqlString(providerId)}`,
    `and model_id = ${sqlString(modelId)}`,
    "limit 1",
  ].join(" "));
  return row ?? null;
};

const miniMaxProvider = loadMiniMaxProvider();

const runtimeModelFor = (modelId) => {
  const defaults = MODEL_DEFAULTS[modelId];
  assert(defaults, `未知测速模型：${modelId}`);
  const modelRow = loadProviderModelRow(miniMaxProvider.id, modelId);

  return {
    ...defaults,
    provider: miniMaxProvider.provider || defaults.provider,
    apiFormat: miniMaxProvider.apiFormat || defaults.apiFormat,
    apiEndpoint: miniMaxProvider.apiEndpoint || defaults.apiEndpoint,
    apiKey: miniMaxProvider.apiKey,
    modelId,
    modelName: modelRow?.modelName || defaults.modelId,
    thinkingLevel: THINKING_LEVEL,
    contextWindow: Number(modelRow?.isOneMillionContext) === 1
      ? 1_000_000
      : defaults.contextWindow,
  };
};

writeFileSync(helperEntryPath, `
  import { buildTavernReplyAgentRequest } from ${JSON.stringify(resolve(workspaceRoot, "src/features/pages/tavern/runtime/reply/request.ts"))};
  import {
    buildTavernBridgeSystemPrompt,
    buildTavernCharacterTurnInstruction,
  } from ${JSON.stringify(resolve(workspaceRoot, "src/features/pages/tavern/runtime/prompt/index.ts"))};
  import { parseTavernReplyText } from ${JSON.stringify(resolve(workspaceRoot, "src/features/pages/tavern/message/index.ts"))};
  import { getTavernPresentationContract } from ${JSON.stringify(resolve(workspaceRoot, "src/features/pages/tavern/presentation-contracts.ts"))};
  import { getTavernPresentationProfile } from ${JSON.stringify(resolve(workspaceRoot, "src/features/pages/tavern/prompt-registry/presentation-rules/index.ts"))};
  import { createDefaultTavernPromptSettings } from ${JSON.stringify(resolve(workspaceRoot, "src/features/pages/tavern/prompt-registry/text-blocks.ts"))};

  const now = Date.now();

  const baseSettings = {
    immersiveDescriptionEnabled: true,
    showExecutionTrace: false,
    autoAssetExtractionEnabled: false,
    assetExtractionIntervalTurns: 3,
    agentKnowledgeCompactIntervalTurns: 0,
    maxAssetDrafts: 5,
    directorMaxSpeakers: 3,
    directorScheduling: {
      targetedReplyPolicy: "prefer",
      maxExtraSpeakersOnTargetedReply: 1,
      allowDirectorOnly: false,
      directorOnlyPhaseStatusId: "",
      directorOnlyPhaseValues: [],
      speakerMotivation: {
        enabled: false,
        maxMotivatedSpeakers: 1,
        rules: [],
      },
      fixedOrder: {
        enabled: false,
        phaseStatusId: "",
        phaseValues: [],
        stopAfterRound: false,
        includeUser: true,
        userPosition: "first",
      },
      autoContinuation: "enabled",
      instruction: "",
    },
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
    informationPolicy: {
      mode: "open",
      uiDefaultView: "reveal",
      hideCharacterThoughts: false,
      revealThoughts: "manual",
      hiddenFacts: {
        enabled: false,
        defaultVisibility: "director",
        reveal: "manual",
      },
      roleAssignment: {
        enabled: false,
        strategy: "manual",
        includeUser: true,
        revealToAssignedCharacter: true,
        revealFactionMembers: true,
        rolePool: [],
        opening: {
          autoStart: false,
          publicEventType: "",
          publicEventValue: "",
          globalStatusPatches: [],
        },
      },
    },
  };

  const createRoom = (evalCase) => {
    const presentationProfile = getTavernPresentationProfile(evalCase.presentationProfileId);
    return {
      id: "quality-room-" + evalCase.id,
      workspaceId: "quality-workspace",
      locked: false,
      title: "雨夜铜牌",
      presentation: {
        profileId: presentationProfile.id,
        profileVersion: 1,
      },
      prompt: createDefaultTavernPromptSettings({
        presentationProfileId: presentationProfile.id,
        promptStyleId: evalCase.promptStyleId,
        systemNarrativePresetId: evalCase.systemNarrativePresetId,
        ruleCompositionId: evalCase.ruleCompositionId,
        qualityRuleIds: evalCase.qualityRuleIds,
        immersiveDescriptionEnabled: evalCase.immersiveDescriptionEnabled !== false,
      }),
      storyOutline: "雨夜，旅人在边境酒馆暂避追兵；证明身份的铜牌刚刚从桌上消失，窗外有湿泥脚印。",
      storyGoal: "找回铜牌并确认谁在说谎，但用户必须保留关键选择权。",
      storyGraph: {
        version: 1,
        entryNodeId: "quality-node-alpha",
        activeNodeId: "quality-node-alpha",
        stages: [{
          id: "quality-stage-alpha",
          title: "第一幕",
          order: 0,
        }],
        nodes: [{
          id: "quality-node-alpha",
          stageId: "quality-stage-alpha",
          title: "铜牌失踪",
          summary: "铜牌消失，窗边留下湿泥脚印。",
          type: "normal",
          pathRole: "main",
          position: { x: 120, y: 160 },
          status: "ready",
          createdAt: now,
          updatedAt: now,
        }],
        edges: [],
      },
      activeSceneId: "quality-scene-alpha",
      scenes: [],
      scenePresetId: "tavern",
      scene: "边境酒馆里炉火低伏，雨水顺着窗棂往下淌。桌上空出铜牌原本的位置，窗边有一串还没干透的泥印。",
      sceneGoal: "让阿洛根据门口和窗边线索给出下一步可行动信息，但不要替旅人决定追出去或搜谁。",
      scenePlot: "贝拉刚发现门闩内侧有新划痕；莫尔坚持铜牌失踪会影响明早通关；阿洛负责检查窗边和门口。",
      sceneDirection: "本轮重点是阿洛的反应：要承接铜牌、湿泥脚印、门闩划痕，不要直接破案。",
      sceneTransition: "",
      memory: "",
      sceneStatus: {
        location: "边境酒馆",
        timeLabel: "深夜",
        weather: "雨",
        atmosphere: "紧绷",
        scenePhase: "线索确认",
        immediateThreat: "追兵可能接近",
        updatedAt: now,
      },
      characterPublicStatuses: {
        "char-alo": {
          characterId: "char-alo",
          location: "窗边",
          posture: "半蹲查看泥印",
          visibleMood: "谨慎",
          holding: ["短灯"],
          publicGoal: "确认窗边线索",
          updatedAt: now,
        },
      },
      characterPrivateStatuses: {},
      pendingInteractions: [],
      replyOptions: [],
      statusDefinitions: [],
      statusRules: [],
      progressViews: [],
      progressTracker: {
        enabled: false,
        mode: "afterTurn",
        intervalTurns: 1,
        applyMode: "auto",
        factConfidenceThreshold: 0.75,
        generateCheckpointBeforeContextTrim: false,
      },
      factEvents: [],
      statusEvents: [],
      statusSnapshot: {
        turnId: "initial",
        global: {},
        scene: {},
        parties: {},
        characters: {},
        relationships: {},
        updatedAt: now,
      },
      statusCheckpoints: [],
      taskDefinitions: [],
      taskEvents: [],
      taskSnapshot: {},
      sceneOutcomes: [],
      outcomeEvents: [],
      characterConfigs: {},
      characterMemories: {
        "char-alo": "阿洛记得铜牌在上一轮还压在旅人的地图角上。",
      },
      localCharacters: [],
      lorebookEntries: [{
        id: "quality-lore-copper-token",
        title: "铜牌",
        content: "边境铜牌用于证明旅人通行资格。没有铜牌，明早无法通过哨卡。",
        keywords: ["铜牌", "通关", "哨卡"],
        enabled: true,
        alwaysOn: true,
        createdAt: now,
        updatedAt: now,
      }],
      illustrationHints: [],
      assetDrafts: [],
      characterIds: ["char-alo", "char-bella", "char-mor"],
      activeCharacterId: "char-alo",
      replyMode: "director",
      userPersonaName: "旅人",
      settings: {
        ...baseSettings,
        immersiveDescriptionEnabled: evalCase.immersiveDescriptionEnabled !== false,
      },
      createdAt: now,
      updatedAt: now,
    };
  };

  const createCharacters = () => [
    {
      id: "char-alo",
      name: "阿洛",
      avatar: "",
      description: "谨慎的巡夜人，负责门口和窗边的风险判断；讨厌凭空定罪。",
      speakingStyle: "短句，先确认事实，再给一个可执行建议；语气压低但不含糊。",
      writingStyle: "动作简洁，雨声、灯影和具体线索作衬。",
      replyStylePrompt: "不要自称旁白，不替旅人决定行动，不直接宣布真相。",
      goals: "确认铜牌失踪的路径，保护旅人不被追兵截住。",
      relationships: [],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "char-bella",
      name: "贝拉",
      avatar: "",
      description: "酒馆守门人，熟悉门闩和客人进出。",
      speakingStyle: "轻快直接，但遇到危险会压低声音。",
      goals: "守住门口，避免追兵闯入。",
      relationships: [],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "char-mor",
      name: "莫尔",
      avatar: "",
      description: "沉稳的地图记录员，关心路线和哨卡。",
      speakingStyle: "克制清楚，常用方位和距离描述。",
      goals: "确认明早可行路线。",
      relationships: [],
      createdAt: now,
      updatedAt: now,
    },
  ];

  const createMessages = (room) => [
    {
      id: "quality-msg-1",
      roomId: room.id,
      role: "narrator",
      kind: "narration",
      presentationProfileId: room.presentation.profileId,
      content: "雷声过去后，桌角只剩下一圈被铜牌压出的浅痕。",
      createdAt: now - 3000,
      status: "done",
    },
    {
      id: "quality-msg-2",
      roomId: room.id,
      role: "character",
      characterId: "char-bella",
      kind: "character_reply",
      presentationProfileId: room.presentation.profileId,
      content: "门闩内侧有新划痕，像是刚被细铁片拨过。",
      thought: "这不像普通客人留下的痕迹。",
      createdAt: now - 2000,
      status: "done",
    },
    {
      id: "quality-msg-3",
      roomId: room.id,
      role: "user",
      kind: "user_input",
      presentationProfileId: room.presentation.profileId,
      content: "我压低声音问阿洛：窗边脚印能看出是谁进来的吗？先别惊动其他客人。",
      targetCharacterIds: ["char-alo"],
      createdAt: now - 1000,
      status: "done",
    },
  ];

  export const createEvalRequest = (evalCase) => {
    const room = createRoom(evalCase);
    const characters = createCharacters();
    const activeCharacter = characters[0];
    const messages = createMessages(room);
    const currentUserText = "我压低声音问阿洛：窗边脚印能看出是谁进来的吗？先别惊动其他客人。";
    const turnInstruction = buildTavernCharacterTurnInstruction({
      room,
      speaker: activeCharacter,
      speakerIndex: 0,
      speakerCount: 1,
      replyMode: "director",
      isDirectorLikeMode: true,
      isManagedMode: false,
      directorReason: "用户点名阿洛查看窗边脚印；承接铜牌失踪和门闩划痕，给出下一步可行动信息，但不要直接破案。",
      allowNonverbalReply: false,
    });
    const request = buildTavernReplyAgentRequest({
      room,
      activeCharacter,
      characters,
      messages,
      references: [],
      currentUserText,
      turnInstruction,
      allowNonverbalReply: false,
    });
    const presentationProfile = getTavernPresentationProfile(room.presentation.profileId);
    const presentationContract = getTavernPresentationContract(presentationProfile);
    return {
      room,
      characters,
      activeCharacter,
      messages,
      currentUserText,
      request,
      presentationProfile: {
        id: presentationProfile.id,
        label: presentationProfile.label,
        dialoguePolicy: presentationProfile.dialoguePolicy,
        generationContract: presentationProfile.generationContract,
      },
      presentationContract: {
        publicContentTag: presentationContract.publicContentTag,
        privateThoughtTag: presentationContract.privateThoughtTag,
        characterMessageKind: presentationContract.characterMessageKind,
      },
    };
  };

  export const parseReply = ({ text, activeCharacter, characters, userPersonaName }) =>
    parseTavernReplyText({
      text,
      activeCharacter,
      characters,
      userPersonaName,
    });

  export const bridgeSystemPrompt = (room) => buildTavernBridgeSystemPrompt(room);
`, "utf8");

await build({
  entryPoints: [helperEntryPath],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: helperBundlePath,
  external: ["react", "react-dom"],
  alias: {
    "@": resolve(workspaceRoot, "src"),
  },
  loader: {
    ".css": "empty",
    ".png": "file",
    ".jpg": "file",
    ".jpeg": "file",
    ".svg": "file",
    ".webp": "file",
  },
  logLevel: "silent",
});

const helper = await import(pathToFileURL(helperBundlePath).href);

const bridge = spawn(process.execPath, [bridgePath], {
  cwd: workspaceRoot,
  stdio: ["pipe", "pipe", "pipe"],
});
const seen = [];
const waiters = [];
const runs = new Map();
let stdoutBuffer = "";
let stderrBuffer = "";

const handleLine = (line) => {
  if (!line.trim()) {
    return;
  }
  const parsed = JSON.parse(line);
  seen.push(parsed);

  if (parsed.taskId && runs.has(parsed.taskId)) {
    const run = runs.get(parsed.taskId);
    const nowMs = performance.now();
    if (
      !run.firstDeltaAt &&
      (parsed.type === "text_delta" || parsed.type === "thinking_delta")
    ) {
      run.firstDeltaAt = nowMs;
      log(`${run.label} first_delta ${Math.round(nowMs - run.startedAt)}ms`);
    }
    if (!run.firstTextAt && parsed.type === "text_delta") {
      run.firstTextAt = nowMs;
      log(`${run.label} first_text ${Math.round(nowMs - run.startedAt)}ms`);
    }
  }

  for (const waiter of [...waiters]) {
    if (waiter.predicate(parsed)) {
      clearTimeout(waiter.timer);
      waiters.splice(waiters.indexOf(waiter), 1);
      waiter.resolve(parsed);
    }
  }
};

bridge.stdout.on("data", (chunk) => {
  stdoutBuffer += chunk.toString("utf8");
  let newlineIndex;
  while ((newlineIndex = stdoutBuffer.indexOf("\n")) >= 0) {
    handleLine(stdoutBuffer.slice(0, newlineIndex));
    stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
  }
});

bridge.stderr.on("data", (chunk) => {
  stderrBuffer += chunk.toString("utf8");
});

const waitFor = (predicate, label, timeoutMs = LIVE_TIMEOUT_MS) =>
  new Promise((resolvePromise, reject) => {
    for (const item of seen) {
      if (predicate(item)) {
        resolvePromise(item);
        return;
      }
    }
    const waiter = {
      predicate,
      resolve: resolvePromise,
      timer: setTimeout(() => {
        const index = waiters.indexOf(waiter);
        if (index >= 0) {
          waiters.splice(index, 1);
        }
        reject(new Error([
          `等待 ${label} 超时`,
          stderrBuffer ? `stderr:\n${stderrBuffer}` : "",
          `recent events:\n${JSON.stringify(seen.slice(-12).map(safeDetails), null, 2)}`,
        ].filter(Boolean).join("\n\n")));
      }, timeoutMs),
    };
    waiters.push(waiter);
  });

const send = (command) => {
  bridge.stdin.write(`${JSON.stringify(command)}\n`);
};

const request = async (command, resultType, timeoutMs = LIVE_TIMEOUT_MS) => {
  send(command);
  return waitFor(
    (item) => item.requestId === command.requestId && item.type === resultType,
    `${command.type}:${command.requestId}:${resultType}`,
    timeoutMs,
  );
};

const bridgeResources = () => ({
  tools: { allowed: [] },
  skills: { enabled: [] },
});

const createSession = (sessionRootDir, systemPrompt, metadata = {}) =>
  request({
    type: "create_session",
    requestId: `create-${metadata.label ?? Date.now()}-${Math.random().toString(36).slice(2)}`,
    workspacePath,
    sessionRootDir,
    systemPrompt,
    metadata,
  }, "session_mutation_result", 10_000);

const runAgent = async ({
  label,
  sessionRootDir,
  agentRoleId,
  runtimeModel,
  systemPrompt,
  userMessage,
  requestContext,
  runtimeInstruction,
  timeoutMs = LIVE_TIMEOUT_MS,
}) => {
  const taskId = `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const requestId = taskId;
  const startedAt = performance.now();
  runs.set(taskId, {
    label,
    startedAt,
    firstDeltaAt: null,
    firstTextAt: null,
  });
  log(`${label} start model=${runtimeModel.modelId}`);
  send({
    type: "send_message",
    requestId,
    session: {
      workspacePath,
      sessionRootDir,
    },
    agent: {
      agentId: "pi",
      agentRoleId,
    },
    input: {
      systemPrompt,
      userMessage,
      requestContext,
      runtimeInstruction,
    },
    runtime: {
      mode: "agent",
      taskId,
      stream: true,
      streamId: taskId,
      model: runtimeModel,
      resources: bridgeResources(),
    },
  });

  const terminal = await waitFor(
    (item) =>
      (item.type === "done" && item.taskId === taskId) ||
      (item.type === "error" && (item.taskId === taskId || item.requestId === requestId)) ||
      (item.type === "task_result" && item.requestId === requestId && item.taskId === taskId && item.success === false),
    `${label} terminal event`,
    timeoutMs,
  );
  if (terminal.type === "error" || terminal.success === false) {
    runs.delete(taskId);
    throw new Error(`${label} 执行失败：${terminal.message ?? JSON.stringify(safeDetails(terminal))}`);
  }
  const result = await waitFor(
    (item) => item.type === "task_result" && item.requestId === requestId && item.taskId === taskId,
    `${label} task_result`,
    30_000,
  );
  const run = runs.get(taskId);
  runs.delete(taskId);
  assert(result.success === true, `${label} 应成功`, result);
  log(`${label} done ${Math.round(performance.now() - startedAt)}ms`);

  return {
    label,
    taskId,
    text: terminal.text ?? "",
    firstDeltaMs: run?.firstDeltaAt ? Math.round(run.firstDeltaAt - startedAt) : null,
    firstTextMs: run?.firstTextAt ? Math.round(run.firstTextAt - startedAt) : null,
    doneMs: Math.round(performance.now() - startedAt),
  };
};

const scoreBoolean = (condition, points) => condition ? points : 0;

const countMatches = (text, patterns) =>
  patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);

const stripActionBlocks = (text) =>
  text.replace(/(^|\n)\s*[*_][^*_\n]+[*_]\s*(?=\n|$)/g, "\n").trim();

const hasSpeakerLabel = (content, names) =>
  new RegExp(`(^|\\n)\\s*(?:${names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}|旁白|用户|旅人)\\s*[:：]`).test(content);

const evaluateOutput = ({
  evalCase,
  raw,
  parsed,
  activeCharacter,
  characters,
  presentationContract,
}) => {
  const content = parsed.content.trim();
  const thought = String(parsed.thought ?? "").trim();
  const expectedPublicTag = presentationContract.publicContentTag;
  const hasThoughtTag = new RegExp("<\\s*inner_thought(?:\\s+[^>]*)?\\s*>", "i").test(raw)
    && new RegExp("<\\s*/\\s*inner_thought\\s*>", "i").test(raw);
  const hasPublicTag = new RegExp(`<\\s*${expectedPublicTag}(?:\\s+[^>]*)?\\s*>`, "i").test(raw)
    && new RegExp(`<\\s*/\\s*${expectedPublicTag}\\s*>`, "i").test(raw);
  const contentHasProtocolLeak = /<\/?(?:inner_thought|private_thought|thought|reply|public_reply|narrative_beat|public_narrative_beat)[^>]*>/i.test(content);
  const names = characters.map((character) => character.name);
  const speakerLabel = hasSpeakerLabel(content, names);
  const sceneSignals = countMatches(content, [/铜牌/, /脚印|泥印/, /窗|窗边/, /门闩|划痕/, /雨|炉火|灯/, /旅人/]);
  const actionSignals = countMatches(content, [/蹲|看|压低|伸手|指|停|收|抬|避|靠|摸|检查|辨认|提醒/, /雨|泥|灯|窗|门|桌|炉火/]);
  const clicheSignals = countMatches(content, [/空气.*安静|沉默.*蔓延|气氛.*凝固|一时间.*无人|静静地|似乎|仿佛/]);
  const userAgencyTakeover = /(旅人|你)(已经|立刻|转身|追出|决定|拿起|搜查|冲向|推开|拔出|承认|说：|说道)/.test(content);
  const foreignThought = characters
    .filter((character) => character.id !== activeCharacter.id)
    .some((character) =>
      new RegExp(`${character.name}.*(?:心里|意识到|知道|明白|想起)`).test(content)
    );
  const firstPersonInContent = /(^|[^\u4e00-\u9fa5])我|我的|我们/.test(content);
  const directQuote = /[“「『"][^”」』"]{2,}[”」』"]/.test(content);
  const dialogueText = stripActionBlocks(content);

  const dimensions = {
    protocol: {
      score:
        scoreBoolean(hasThoughtTag, 7) +
        scoreBoolean(hasPublicTag, 8) +
        scoreBoolean(Boolean(content), 6) +
        scoreBoolean(!contentHasProtocolLeak, 4),
      max: 25,
    },
    profileFit: {
      score: 0,
      max: 25,
    },
    sceneContinuity: {
      score:
        Math.min(sceneSignals, 4) * 4 +
        scoreBoolean(/铜牌/.test(content), 2) +
        scoreBoolean(/脚印|泥印|窗边|门闩|划痕/.test(content), 2),
      max: 20,
    },
    characterBoundary: {
      score:
        scoreBoolean(!speakerLabel, 4) +
        scoreBoolean(!userAgencyTakeover, 4) +
        scoreBoolean(!foreignThought, 4) +
        scoreBoolean(thought.length >= 6 && thought.length <= 100, 3),
      max: 15,
    },
    proseQuality: {
      score:
        Math.min(actionSignals, 2) * 4 +
        scoreBoolean(content.length >= 45 && content.length <= 260, 4) +
        scoreBoolean(clicheSignals === 0, 3),
      max: 15,
    },
  };

  if (evalCase.presentationProfileId === "dialogue-chat") {
    dimensions.profileFit.score =
      scoreBoolean(dialogueText.length >= 8, 8) +
      scoreBoolean(!speakerLabel, 5) +
      scoreBoolean(!directQuote, 4) +
      scoreBoolean(content.length <= 180, 4) +
      scoreBoolean(!/第三人称|小说正文|叙事片段/.test(content), 4);
  } else if (evalCase.presentationProfileId === "third-person-prose") {
    dimensions.profileFit.score =
      scoreBoolean(/阿洛|他/.test(content), 6) +
      scoreBoolean(!speakerLabel, 5) +
      scoreBoolean(!directQuote, 5) +
      scoreBoolean(!firstPersonInContent, 5) +
      scoreBoolean(actionSignals >= 1, 4);
  } else {
    dimensions.profileFit.score =
      scoreBoolean(/阿洛|他/.test(content), 5) +
      scoreBoolean(!speakerLabel, 5) +
      scoreBoolean(actionSignals >= 1, 5) +
      scoreBoolean(content.length >= 70, 5) +
      scoreBoolean(!/^[“「『"]/.test(content), 5);
  }

  const notes = [];
  if (!hasThoughtTag || !hasPublicTag) {
    notes.push("XML 标签不完整或不是目标 public tag");
  }
  if (speakerLabel) {
    notes.push("存在角色名冒号/聊天记录残留");
  }
  if (contentHasProtocolLeak) {
    notes.push("解析后的公开内容仍残留协议标签");
  }
  if (userAgencyTakeover) {
    notes.push("疑似替用户做关键动作或说话");
  }
  if (foreignThought) {
    notes.push("疑似写入其他角色未公开心理");
  }
  if (sceneSignals < 2) {
    notes.push("场景线索承接不足");
  }
  if (clicheSignals > 0) {
    notes.push("存在套话氛围描写");
  }
  if (evalCase.presentationProfileId === "third-person-prose" && (directQuote || firstPersonInContent)) {
    notes.push("第三人称间接叙事仍出现直接对白或第一人称");
  }
  if (evalCase.presentationProfileId === "novel-prose" && content.length < 70) {
    notes.push("小说正文长度和场面展开不足");
  }

  const total = Object.values(dimensions).reduce((sum, item) => sum + item.score, 0);
  const max = Object.values(dimensions).reduce((sum, item) => sum + item.max, 0);

  return {
    score: total,
    maxScore: max,
    normalizedScore: Number((total / max).toFixed(4)),
    dimensions,
    notes,
    signals: {
      sceneSignals,
      actionSignals,
      clicheSignals,
      contentLength: content.length,
      thoughtLength: thought.length,
      hasDirectQuote: directQuote,
      hasFirstPersonInContent: firstPersonInContent,
    },
  };
};

const nameByCharacterId = (characters) =>
  new Map(characters.map((character) => [character.id, character.name]));

const formatVisibleExcerpt = ({
  evalCase,
  messages,
  characters,
  activeCharacter,
  content,
}) => {
  const characterNames = nameByCharacterId(characters);
  const visibleLines = messages.map((message) => {
    if (message.role === "narrator") {
      return evalCase.presentationProfileId === "dialogue-chat"
        ? `旁白：${message.content}`
        : message.content;
    }

    if (message.role === "user") {
      return evalCase.presentationProfileId === "dialogue-chat"
        ? `旅人：${message.content}`
        : `旅人压低声音问阿洛：“${message.content.replace(/^我压低声音问阿洛[:：]?\s*/, "")}”`;
    }

    const name = characterNames.get(message.characterId) ?? "角色";
    return evalCase.presentationProfileId === "dialogue-chat"
      ? `${name}：${message.content}`
      : `${name}低声提到：“${message.content}”`;
  });

  if (evalCase.presentationProfileId === "dialogue-chat") {
    return [
      "[已存在上下文，姓名前缀代表 UI 气泡来源，不视为模型输出格式]",
      ...visibleLines,
      "",
      "[本轮生成的角色回复，只评这段文本的真人感、角色感和环境比例]",
      content,
    ].join("\n");
  }

  return [
    "[已存在上下文，可能包含历史直接引语；请把它作为前文，不要把历史引号计入本轮输出格式扣分]",
    ...visibleLines,
    "",
    "[本轮生成的小说/旁白正文，请重点评估它与前文连起来是否像目标模式]",
    content,
  ].join("\n\n");
};

const contentJudgeCategoriesFor = (presentationProfileId) => {
  if (presentationProfileId === "dialogue-chat") {
    return [
      "humanDialogue",
      "characterVoice",
      "responsiveness",
      "environmentBalance",
      "nonRoboticNaturalness",
      "continuationHook",
    ];
  }

  if (presentationProfileId === "third-person-prose") {
    return [
      "thirdPersonConsistency",
      "narrativeFlow",
      "indirectExpression",
      "environmentFunction",
      "characterBoundary",
      "sceneMomentum",
    ];
  }

  return [
    "novelCohesion",
    "proseTexture",
    "dialogueIntegration",
    "environmentFunction",
    "characterRealism",
    "sceneMomentum",
  ];
};

const contentJudgeRubricFor = (presentationProfileId) => {
  if (presentationProfileId === "dialogue-chat") {
    return [
      "humanDialogue: 角色对白是否像真人在当前场景中说话，而不是 AI 总结、说明书或剧情梗概。",
      "characterVoice: 是否符合阿洛谨慎、短句、先确认事实的角色口吻。",
      "responsiveness: 是否直接回答用户关于窗边脚印的问题，并承接铜牌、门闩、雨夜线索。",
      "environmentBalance: 动作/环境描写是否适量服务对白；过少会空，过多会不像聊天回复。",
      "nonRoboticNaturalness: 语言是否自然，有停顿、判断和分寸，避免模板化、空泛安慰或过度精确破案。",
      "continuationHook: 结尾是否给用户可接的下一步，而不是替用户完成选择或封死互动。",
    ].join("\n");
  }

  if (presentationProfileId === "third-person-prose") {
    return [
      "thirdPersonConsistency: 是否稳定使用第三人称，不出现角色直接第一人称自述或聊天气泡格式。",
      "narrativeFlow: 旁白、用户意图、角色段落连起来是否像一段可读小说，而不是拼接记录。",
      "indirectExpression: 角色要表达的话是否被自然转译为间接表达、动作和可见反应。",
      "environmentFunction: 雨、窗、泥印、炉火等环境是否推动判断和节奏，而非装饰堆砌。",
      "characterBoundary: 是否只写当前角色可知/可见内容，不替用户决定，不写其他角色未公开心理。",
      "sceneMomentum: 是否留下可继续推进的调查方向或张力。",
    ].join("\n");
  }

  return [
    "novelCohesion: 最近旁白、用户输入、角色输出连起来是否像一篇小说正文的连续片段。",
    "proseTexture: 句子、动作、感官细节和节奏是否有小说质感，避免流水账和说明文。",
    "dialogueIntegration: 角色对白若出现，是否自然嵌入动作/环境/冲突，而不是聊天记录。",
    "environmentFunction: 雨、窗、泥印、炉火等环境是否服务线索、情绪和节奏，而非空泛氛围。",
    "characterRealism: 阿洛的谨慎、短句和判断分寸是否可信，不像 AI 代言。",
    "sceneMomentum: 是否推进场景目标并给用户保留下一步选择。",
  ].join("\n");
};

const extractJsonObject = (text) => {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }
  const match = trimmed.match(/\{[\s\S]*\}/);
  return match?.[0] ?? "{}";
};

const clampNumber = (value, min, max) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return Math.min(max, Math.max(min, numeric));
};

const normalizeContentJudgeResult = ({
  text,
  presentationProfileId,
  judgeModelId,
}) => {
  const categories = contentJudgeCategoriesFor(presentationProfileId);
  const parsed = JSON.parse(extractJsonObject(text));
  const scores = Object.fromEntries(categories.map((category) => [
    category,
    clampNumber(parsed?.scores?.[category], 0, 5),
  ]));
  const numericScores = Object.values(scores).filter((value) => value !== null);
  const scoreFromCategories = numericScores.length === categories.length
    ? numericScores.reduce((sum, value) => sum + value, 0)
    : null;
  const categoryMax = categories.length * 5;
  const overall = clampNumber(parsed?.overall, 0, 100);
  const normalizedScore = scoreFromCategories !== null
    ? scoreFromCategories / categoryMax
    : (overall !== null ? overall / 100 : 0);

  return {
    ok: true,
    judgeModelId,
    score: scoreFromCategories ?? (overall !== null ? overall : 0),
    maxScore: scoreFromCategories !== null ? categoryMax : 100,
    normalizedScore: Number(normalizedScore.toFixed(4)),
    scores,
    overall: overall ?? null,
    notes: Array.isArray(parsed?.notes)
      ? parsed.notes.filter((item) => typeof item === "string").slice(0, 6)
      : [],
    verdict: typeof parsed?.verdict === "string" ? parsed.verdict.slice(0, 240) : "",
    raw: text.trim(),
  };
};

const buildContentJudgeRequestContext = (result) => {
  const categories = contentJudgeCategoriesFor(result.case.presentationProfileId);
  const modeLabel = result.case.presentationProfileId === "dialogue-chat"
    ? "对话模式"
    : result.case.presentationProfileId === "third-person-prose"
    ? "第三人称旁白模式"
    : "小说正文模式";

  return [
    "<task>",
    "评估 Novel Claw 酒馆模式最终可见片段的实际阅读质量。重点判断读者看到的内容是否真的像目标模式：小说模式要像连续小说正文；对话模式要像真人角色在现场回应；环境描写要服务情节和互动。",
    "</task>",
    "",
    "<mode>",
    modeLabel,
    "</mode>",
    "",
    "<scoring>",
    "每个 scores 字段给 0 到 5 分：0=严重失败，3=基本可用，5=优秀。",
    "overall 给 0 到 100 分，应与各项 scores 大体一致。",
    "不要因为 XML 标签正确而加分；这次只评估最终可见内容本身。",
    "visible_excerpt 里的方括号说明和上下文来源标签不是模型最终正文的一部分；对话模式里的姓名前缀只表示 UI 气泡来源，不作为聊天记录格式扣分。",
    "小说/第三人称模式里，历史上下文可能包含直接引语；可以评估它与本轮正文的衔接，但不要因为历史引号本身扣本轮输出格式分。",
    "严格扣分：不像小说/不像真人对话、环境堆砌、角色像 AI 总结、替用户做选择、第三人称模式出现直接第一人称对白。",
    "</scoring>",
    "",
    "<rubric>",
    contentJudgeRubricFor(result.case.presentationProfileId),
    "</rubric>",
    "",
    "<output_schema>",
    `{"scores":{${categories.map((category) => `"${category}":0`).join(",")}},"overall":0,"notes":["扣分点或优秀点"],"verdict":"一句总体判断"}`,
    "</output_schema>",
    "",
    "<visible_excerpt>",
    result.visibleExcerpt,
    "</visible_excerpt>",
  ].join("\n");
};

const runContentQualityJudges = async ({
  results,
  availableModelIds,
  speedResults,
}) => {
  if (!CONTENT_JUDGE_ENABLED) {
    return [];
  }

  const fastestModelId = [...speedResults]
    .filter((item) => item.ok)
    .sort((first, second) => first.doneMs - second.doneMs)[0]?.modelId;
  const judgeModelIds = CONTENT_JUDGE_ALL_SPEED_MODELS
    ? availableModelIds
    : [fastestModelId].filter(Boolean);
  const judgeSystemPrompt = "你是 Novel Claw 酒馆输出质量裁判。不要调用工具，只按给定 rubric 评估最终可见内容。";
  const judgeFailures = [];

  for (const result of results.filter((item) => item.ok)) {
    result.contentJudges = [];
    for (const judgeModelId of judgeModelIds) {
      const runtimeModel = runtimeModelFor(judgeModelId);
      const label = `content-judge-${result.case.id}-${result.modelId}-by-${judgeModelId}`;
      const sessionRootDir = join(
        workspacePath,
        "content-judge",
        judgeModelId,
        result.modelId,
        result.case.id,
        "session",
      );
      await createSession(sessionRootDir, judgeSystemPrompt, {
        label,
        judgeModelId,
        generationModelId: result.modelId,
        evalCaseId: result.case.id,
      });
      try {
        const judgeRun = await runAgent({
          label,
          sessionRootDir,
          agentRoleId: `content-judge-${judgeModelId.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
          runtimeModel,
          systemPrompt: judgeSystemPrompt,
          userMessage: "请按 rubric 评估最终可见片段，只输出严格合法 JSON。",
          requestContext: buildContentJudgeRequestContext(result),
          runtimeInstruction: "只输出严格合法 JSON 对象，不要 Markdown，不要解释。",
          timeoutMs: LIVE_TIMEOUT_MS,
        });
        const normalized = normalizeContentJudgeResult({
          text: judgeRun.text,
          presentationProfileId: result.case.presentationProfileId,
          judgeModelId,
        });
        result.contentJudges.push({
          ...normalized,
          timings: {
            firstDeltaMs: judgeRun.firstDeltaMs,
            firstTextMs: judgeRun.firstTextMs,
            doneMs: judgeRun.doneMs,
          },
        });
        log(`${label} contentScore=${normalized.normalizedScore} verdict=${normalized.verdict || "ok"}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const failure = {
          modelId: result.modelId,
          judgeModelId,
          caseId: result.case.id,
          error: message,
        };
        judgeFailures.push(failure);
        result.contentJudges.push({
          ok: false,
          judgeModelId,
          error: message,
        });
        log(`${label} failed ${message}`);
      }
    }

    const successfulJudges = result.contentJudges.filter((judge) => judge.ok);
    if (successfulJudges.length > 0) {
      const normalizedScore = average(successfulJudges.map((judge) => judge.normalizedScore));
      result.contentEvaluation = {
        normalizedScore: Number(normalizedScore.toFixed(4)),
        judges: successfulJudges.length,
        notes: successfulJudges.flatMap((judge) => judge.notes).slice(0, 8),
        verdicts: successfulJudges.flatMap((judge) => judge.verdict ? [judge.verdict] : []).slice(0, 4),
      };
    }
  }

  return judgeFailures;
};

const average = (values) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

const buildRankings = (results) => {
  const grouped = new Map();
  for (const result of results.filter((item) => item.ok)) {
    const key = result.case.packageId;
    const group = grouped.get(key) ?? {
      packageId: key,
      label: result.case.label,
      presentationProfileId: result.case.presentationProfileId,
      scores: [],
      hardScores: [],
      contentScores: [],
      dimensionScores: new Map(),
    };
    const hardScore = result.evaluation.normalizedScore;
    const contentScore = result.contentEvaluation?.normalizedScore;
    const combinedScore = contentScore === undefined
      ? hardScore
      : hardScore * 0.45 + contentScore * 0.55;
    group.scores.push(combinedScore);
    group.hardScores.push(hardScore);
    if (contentScore !== undefined) {
      group.contentScores.push(contentScore);
    }
    for (const [dimension, value] of Object.entries(result.evaluation.dimensions)) {
      const list = group.dimensionScores.get(dimension) ?? [];
      list.push(value.score / value.max);
      group.dimensionScores.set(dimension, list);
    }
    grouped.set(key, group);
  }

  return Array.from(grouped.values())
    .map((group) => ({
      packageId: group.packageId,
      label: group.label,
      presentationProfileId: group.presentationProfileId,
      averageScore: Number(average(group.scores).toFixed(4)),
      hardScore: Number(average(group.hardScores).toFixed(4)),
      contentQualityScore: group.contentScores.length > 0
        ? Number(average(group.contentScores).toFixed(4))
        : null,
      dimensions: Object.fromEntries(Array.from(group.dimensionScores.entries()).map(([key, values]) => [
        key,
        Number(average(values).toFixed(4)),
      ])),
      samples: group.scores.length,
    }))
    .sort((left, right) =>
      right.averageScore - left.averageScore || left.packageId.localeCompare(right.packageId)
    );
};

const shutdown = async () => {
  try {
    await request({ type: "shutdown", requestId: "shutdown" }, "shutdown_ack", 5_000);
  } catch {
    bridge.kill();
  }
};

const cleanup = async () => {
  bridge.stdin.end();
  await new Promise((resolvePromise) => {
    bridge.once("close", resolvePromise);
  });
  if (!KEEP_WORKSPACE) {
    rmSync(workspacePath, { recursive: true, force: true });
  } else {
    log(`kept workspace ${workspacePath}`);
  }
};

try {
  log("checking bridge agents");
  const list = await request({ type: "list_agents", requestId: "list" }, "agent_definitions", 10_000);
  assert(list.agents.some((agent) => agent.id === "pi" && agent.capabilities.includes("agent")), "pi agent 应可用", list);

  const speedResults = [];
  const speedSystemPrompt = "你是 Novel Claw 酒馆提示词质量评估测速助手。不要调用工具。";
  for (const modelId of MODEL_IDS) {
    const runtimeModel = runtimeModelFor(modelId);
    const sessionRootDir = join(workspacePath, "speed", modelId, "session");
    await createSession(sessionRootDir, speedSystemPrompt, {
      label: `speed-${modelId}`,
      modelId,
    });
    const marker = `${runMarker}_SPEED_${modelId.replace(/[^a-z0-9]+/gi, "_")}`;
    try {
      const speed = await runAgent({
        label: `speed-${modelId}`,
        sessionRootDir,
        agentRoleId: `speed-${modelId.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        runtimeModel,
        systemPrompt: speedSystemPrompt,
        userMessage: `只输出一行 JSON：{"marker":"${marker}","ok":true}`,
        requestContext: `speed_test_model=${modelId}`,
        runtimeInstruction: "只输出 JSON，不要 Markdown，不要解释。",
        timeoutMs: SPEED_TIMEOUT_MS,
      });
      assert(speed.text.includes(marker), `${modelId} 测速输出应包含 marker`, speed);
      speedResults.push({
        modelId,
        ok: true,
        firstDeltaMs: speed.firstDeltaMs,
        firstTextMs: speed.firstTextMs,
        doneMs: speed.doneMs,
        text: speed.text.trim().slice(0, 180),
      });
      log(`speed test ${modelId} ok doneMs=${speed.doneMs}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      speedResults.push({
        modelId,
        ok: false,
        error: message,
      });
      log(`speed test ${modelId} failed ${message}`);
    }
  }

  const availableModelIds = speedResults.filter((item) => item.ok).map((item) => item.modelId);
  assert(availableModelIds.length > 0, "没有可用于质量评估的 SPEED_MODEL_IDS 模型", speedResults);

  const results = [];
  for (const modelId of availableModelIds) {
    const runtimeModel = runtimeModelFor(modelId);
    for (const evalCase of activeEvalCases) {
      const fixture = helper.createEvalRequest(evalCase);
      const label = `${evalCase.id}-${modelId}`;
      const sessionRootDir = join(workspacePath, "quality", modelId, evalCase.id, "session");
      await createSession(sessionRootDir, fixture.request.systemPrompt, {
        label,
        modelId,
        evalCaseId: evalCase.id,
        packageId: evalCase.packageId,
      });
      try {
        const run = await runAgent({
          label,
          sessionRootDir,
          agentRoleId: fixture.request.agentRoleId,
          runtimeModel,
          systemPrompt: fixture.request.systemPrompt,
          userMessage: fixture.request.userMessage,
          requestContext: fixture.request.requestContext,
          runtimeInstruction: fixture.request.runtimeInstruction,
        });
        const parsed = helper.parseReply({
          text: run.text,
          activeCharacter: fixture.activeCharacter,
          characters: fixture.characters,
          userPersonaName: fixture.room.userPersonaName,
        });
        const evaluation = evaluateOutput({
          evalCase,
          raw: run.text,
          parsed,
          activeCharacter: fixture.activeCharacter,
          characters: fixture.characters,
          presentationContract: fixture.presentationContract,
        });
        results.push({
          ok: true,
          modelId,
          case: evalCase,
          presentationProfile: fixture.presentationProfile,
          presentationContract: fixture.presentationContract,
          timings: {
            firstDeltaMs: run.firstDeltaMs,
            firstTextMs: run.firstTextMs,
            doneMs: run.doneMs,
          },
          raw: run.text.trim(),
          parsed,
          visibleExcerpt: formatVisibleExcerpt({
            evalCase,
            messages: fixture.messages,
            characters: fixture.characters,
            activeCharacter: fixture.activeCharacter,
            content: parsed.content,
          }),
          evaluation,
        });
        log(`${label} score=${evaluation.score}/${evaluation.maxScore} (${evaluation.normalizedScore}) notes=${evaluation.notes.join("；") || "ok"}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({
          ok: false,
          modelId,
          case: evalCase,
          error: message,
        });
        log(`${label} failed ${message}`);
      }
    }
  }

  const contentJudgeFailures = await runContentQualityJudges({
    results,
    availableModelIds,
    speedResults,
  });
  const rankings = buildRankings(results);
  const report = {
    metadata: {
      runAt: new Date().toISOString(),
      runMarker,
      modelIds: availableModelIds,
      requestedModelIds: MODEL_IDS,
      speedModelIds: SPEED_MODEL_IDS,
      caseFilter: CASE_FILTER || null,
      contentJudgeEnabled: CONTENT_JUDGE_ENABLED,
      contentJudgeAllSpeedModels: CONTENT_JUDGE_ALL_SPEED_MODELS,
      rubricVersion: 2,
      rubric: {
        protocol: "25 分：inner_thought 与目标公开内容标签、非空内容、解析后无协议残留。",
        profileFit: "25 分：对话/小说正文/第三人称间接叙事各自的形态贴合度。",
        sceneContinuity: "20 分：承接铜牌、脚印、窗边、门闩、雨夜等场景目标信号。",
        characterBoundary: "15 分：无说话人标签残留、不替用户行动、不写他人心理、角色心理长度合理。",
        proseQuality: "15 分：动作/感官具体性、长度可读、少套话氛围。",
        contentQuality: "SPEED 模型裁判评估最终可见片段：小说连贯度、真人对白感、环境描写是否服务剧情、节奏和可继续性。",
        combinedRanking: "综合分 = 硬指标 45% + 内容质量 55%；若内容裁判关闭，则使用硬指标。",
      },
    },
    speedResults,
    contentJudgeFailures,
    cases: activeEvalCases,
    rankings,
    results,
  };
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(safeDetails(report), null, 2), "utf8");

  console.log(JSON.stringify({
    reportPath,
    models: availableModelIds,
    rankings: rankings.slice(0, 8),
    failures: results.filter((item) => !item.ok).map((item) => ({
      modelId: item.modelId,
      caseId: item.case.id,
      error: item.error,
    })),
    contentJudgeFailures,
  }, null, 2));
} finally {
  await shutdown();
  await cleanup();
}
