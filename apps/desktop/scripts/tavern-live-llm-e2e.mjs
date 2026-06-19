import { execFileSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const workspaceRoot = process.cwd();
const bridgePath = join(workspaceRoot, "agent-bridge/dist/index.js");
const configDbPath = process.env.NOVEL_CLAW_CONFIG_DB?.trim()
  || join(homedir(), ".novel-claw", "config.db");
const workspacePath = mkdtempSync(join(tmpdir(), "novel-claw-tavern-live-llm-e2e-"));
const helperEntryPath = join(workspacePath, "tavern-live-helper.ts");
const helperBundlePath = join(workspacePath, "tavern-live-helper.mjs");
const runMarker = `TAVERN_LIVE_${Date.now()}`;

const SPEED_MODEL_IDS = [
  "MiniMax-M3-highspeed",
  "MiniMax-M2.7-highspeed",
];
const LIVE_TIMEOUT_MS = Number(process.env.NOVEL_CLAW_TAVERN_LIVE_TIMEOUT_MS ?? 10 * 60 * 1000);
const SPEED_TIMEOUT_MS = Number(process.env.NOVEL_CLAW_TAVERN_SPEED_TIMEOUT_MS ?? 90 * 1000);
const FLOW_TIMEOUT_MS = Number(process.env.NOVEL_CLAW_TAVERN_FLOW_TIMEOUT_MS ?? 10 * 60 * 1000);
const FLOW_ROUNDS = Number(process.env.NOVEL_CLAW_TAVERN_LIVE_ROUNDS ?? 5);
const PROMPT_VARIANT = process.env.NOVEL_CLAW_TAVERN_PROMPT_VARIANT?.trim() || "xml_contract";
const THINKING_LEVEL = process.env.NOVEL_CLAW_LIVE_THINKING?.trim() || "off";

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

if (!existsSync(bridgePath)) {
  throw new Error("agent-bridge/dist/index.js 不存在，请先运行 pnpm build:agent-bridge");
}
if (!existsSync(configDbPath)) {
  throw new Error(`配置库不存在：${configDbPath}`);
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
  console.error("[tavern-live]", ...args);
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
  import { buildTavernReplyAgentRequest } from ${JSON.stringify(resolve(workspaceRoot, "src/features/pages/tavern/runtime/reply-request.ts"))};
  import { buildTavernCharacterTurnInstruction } from ${JSON.stringify(resolve(workspaceRoot, "src/features/pages/tavern/runtime/turn-instruction.ts"))};
  import { buildTavernBridgeSystemPrompt } from ${JSON.stringify(resolve(workspaceRoot, "src/features/pages/tavern/runtime/bridge-prompt.ts"))};
  import {
    hasTavernReplyDialogueText,
    parseTavernReplyText,
  } from ${JSON.stringify(resolve(workspaceRoot, "src/features/pages/tavern/runtime/reply-cleanup.ts"))};
  import {
    extractTavernPendingInteractionsFromMessages,
    formatTavernVisibleMessagesForRequestContext,
    normalizeTavernMessagesForAudience,
    planTavernContinuation,
    tavernBridgeSessionRootDir,
    tavernDirectorAgentRoleId,
    tavernManagedUserAgentRoleId,
  } from ${JSON.stringify(resolve(workspaceRoot, "src/features/pages/tavern/core/index.ts"))};
  import {
    formatTavernLorebookEntries,
    formatTavernTimelineEvents,
    selectTavernLorebookEntries,
    tavernMessagesToRuntimeMessages,
  } from ${JSON.stringify(resolve(workspaceRoot, "src/features/pages/tavern/runtime/prompt.ts"))};
  import { formatTavernRuntimeMessagesForSummary } from ${JSON.stringify(resolve(workspaceRoot, "src/features/pages/tavern/runtime/conversation.ts"))};

  const now = Date.now();

  export const createFixture = () => {
    const room = {
      id: "live-room-alpha",
      workspaceId: "live-workspace",
      locked: false,
      title: "身份边界测试酒馆",
      storyOutline: "五名角色在风雨夜的酒馆分工守望，必须保持各自身份、岗位和发言边界。",
      storyGoal: "确认多轮多角色调度后不会串角色、不会泄露心理。",
      activeSceneId: "live-scene-alpha",
      scenes: [],
      scenePresetId: "tavern",
      scene: "屋内有旧木桌、吧台、炉火和窗边地图，门外有风，屋顶能看见远处灯影。",
      sceneGoal: "完成守门、屋顶观察、吧台照应、地图记录和炉火维护的分工。",
      scenePlot: "贝拉负责门口，阿洛负责屋顶，琪拉负责吧台物资，莫尔负责地图和路线，赛恩负责炉火与灯。",
      sceneDirection: "角色只说自己的公开发言，不替别人说话；未发言角色可以被导演安排公开动作描写。",
      sceneTransition: "",
      memory: "",
      characterConfigs: {},
      characterMemories: {},
      localCharacters: [],
      lorebookEntries: [],
      timelineEvents: [],
      assetDrafts: [],
      characterIds: ["char-a", "char-b", "char-c", "char-d", "char-e"],
      activeCharacterId: "char-a",
      replyMode: "round",
      userPersonaName: "旅人",
      settings: {
        immersiveDescriptionEnabled: true,
        showExecutionTrace: false,
        autoAssetExtractionEnabled: false,
        assetExtractionIntervalTurns: 3,
        agentKnowledgeCompactIntervalTurns: 0,
        maxAssetDrafts: 5,
        directorMaxSpeakers: 4,
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
        description: "谨慎的屋顶斥候，只汇报自己看见的高处动静。",
        speakingStyle: "短句，谨慎，不替别人说话。",
        goals: "守住屋顶观察点。",
        relationships: "信任贝拉守门，但不会替贝拉表达。",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "char-b",
        name: "贝拉",
        avatar: "",
        description: "热情的酒馆守门人，只汇报门口情况。",
        speakingStyle: "轻快直接，不替阿洛判断屋顶。",
        goals: "守住门口。",
        relationships: "知道阿洛在屋顶观察。",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "char-c",
        name: "琪拉",
        avatar: "",
        description: "细心的吧台照应者，只汇报酒馆内部、热汤和物资情况。",
        speakingStyle: "温和利落，常用短句确认物资和客人状态。",
        goals: "照看吧台、热汤和应急物资。",
        relationships: "信任贝拉守门，提醒莫尔记录重要线索。",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "char-d",
        name: "莫尔",
        avatar: "",
        description: "沉稳的地图记录员，只根据地图和旅人路线发言。",
        speakingStyle: "克制、清楚，喜欢用方位和距离描述。",
        goals: "记录灯影、路线和风雨变化。",
        relationships: "会向阿洛询问高处观察，但不替阿洛下判断。",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "char-e",
        name: "赛恩",
        avatar: "",
        description: "寡言的炉火看守，只汇报炉火、灯光和室内安全。",
        speakingStyle: "简短稳定，很少主动扩展话题。",
        goals: "维持炉火、灯光和屋内安全。",
        relationships: "会配合琪拉照应吧台和客人。",
        createdAt: now,
        updatedAt: now,
      },
    ];
    return { room, characters };
  };

  export const bridgeSystemPrompt = (room) => buildTavernBridgeSystemPrompt(room);

  const characterById = (characters, characterId) => {
    const character = characters.find((item) => item.id === characterId);
    if (!character) {
      throw new Error("missing character " + characterId);
    }
    return character;
  };

  const extractJsonObject = (text) => {
    const trimmed = text.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      return trimmed;
    }
    const match = trimmed.match(/\\{[\\s\\S]*\\}/);
    return match?.[0] ?? "{}";
  };

  const cleanLooseJsonString = (value) => value.trim();

  const extractLooseJsonStringArray = (text, fieldName) => {
    const fieldPattern = new RegExp('"' + fieldName + '"\\\\s*:\\\\s*\\\\[([\\\\s\\\\S]*?)\\\\]', "i");
    const fieldMatch = fieldPattern.exec(text);
    if (!fieldMatch) {
      return [];
    }

    return [...(fieldMatch[1] ?? "").matchAll(/"([^"]+)"/g)]
      .map((match) => cleanLooseJsonString(match[1] ?? ""))
      .filter(Boolean);
  };

  const extractLooseJsonStringField = (text, fieldName) => {
    const fieldPattern = new RegExp(
      '"' + fieldName + '"\\\\s*:\\\\s*"([\\\\s\\\\S]*?)"\\\\s*(?=,\\\\s*"(?:speakerIds|narrator|reason)"\\\\s*:|\\\\s*}\\\\s*$)',
      "i",
    );
    const fieldMatch = fieldPattern.exec(text);

    return fieldMatch ? cleanLooseJsonString(fieldMatch[1] ?? "") : "";
  };

  const stripUserLabel = (text, userPersonaName) => {
    const labels = [userPersonaName, "我", "用户", "玩家"]
      .map((label) => label.trim())
      .filter(Boolean);
    let cleaned = text.trim();
    for (const label of labels) {
      if (cleaned.startsWith(label + ":") || cleaned.startsWith(label + "：")) {
        cleaned = cleaned.slice(label.length + 1).trim();
      }
    }
    return cleaned;
  };

  const cleanManagedReply = (text, userPersonaName) => stripUserLabel(text, userPersonaName)
    .replace(/^\\\`\\\`\\\`(?:json)?\\s*/i, "")
    .replace(/\\s*\\\`\\\`\\\`$/i, "")
    .replace(/^[\\"“”]+|[\\"“”]+$/g, "")
    .trim();

  export const parseManagedReply = (text, userPersonaName) => {
    try {
      const parsed = JSON.parse(extractJsonObject(text));
      const candidates = [
        parsed.reply,
        parsed.userReply,
        parsed.user_reply,
        parsed.content,
        parsed.message,
        parsed.text,
      ];
      const reply = candidates.find((candidate) => typeof candidate === "string" && candidate.trim());
      if (typeof reply === "string") {
        return cleanManagedReply(reply, userPersonaName);
      }
    } catch {
      // Fall through.
    }
    return cleanManagedReply(text.split(/\\n+/).find((line) => line.trim()) ?? "", userPersonaName);
  };

  export const buildManagedUserRequest = ({
    room,
    characters,
    messages,
    currentDraft,
  }) => {
    const runtimeMessages = tavernMessagesToRuntimeMessages({
      messages,
      characters,
      userPersonaName: room.userPersonaName,
    });
    const recentConversation = formatTavernRuntimeMessagesForSummary(runtimeMessages.slice(-12));
    const characterList = characters.map((character) =>
      character.name + ": " + character.description
    ).join("\\n");
    const prompt = [
      "<task>",
      "以导演身份，为酒馆用户「" + (room.userPersonaName || "我") + "」调度并生成本轮要发送的回复。",
      "</task>",
      "",
      "<rules>",
      "reply 必须是用户可以直接发送的一句话或一小段话。",
      "reply 不可为空，也不可只输出 reason；即使信息不足，也要生成一句谨慎的追问或推进决定。",
      "reply 绝对不能包含 <function_calls>、<tool_calls>、XML/HTML 标签、工具调用、JSON 代码块或系统标记。",
      "只替用户说话，不要替酒馆角色说话，不要写角色动作，不要输出角色名加冒号。",
      "回复需要承接当前对话和场景目标，能自然推动下一轮角色回应。",
      "避免连续输出“嗯”“好”“继续守着”这类低信息短句；等待场景里也要给出一个具体观察点、轮报要求或下一步检查指令。",
      "可以包含用户的行动决定、追问、试探或态度，但不要越过当前剧情直接解决核心谜题。",
      "建议 20 到 120 个中文字符；内容不要自带引号、编号或列表符号。",
      currentDraft?.trim()
        ? "用户输入框里的文字是托管方向提示，请吸收其意图；如果其中明确点名角色、发言顺序、人数或限制，必须保留这些硬约束，但不要机械照抄措辞。"
        : "没有方向提示时，根据当前剧情自动选择最合理、最有戏剧张力的一句回复。",
      "只输出严格合法 JSON 对象，不要 Markdown、代码块或解释。",
      "</rules>",
      "",
      "<output_schema>",
      "{\\"reply\\":\\"用户本轮要发送的回复\\",\\"reason\\":\\"可选简短调度原因\\"}",
      "</output_schema>",
      "",
      room.storyOutline.trim() || room.storyGoal.trim()
        ? "<story_arc>\\n" + [room.storyOutline.trim(), room.storyGoal.trim() ? "终局目标：" + room.storyGoal.trim() : ""].filter(Boolean).join("\\n\\n") + "\\n</story_arc>"
        : "<story_arc>（无）</story_arc>",
      "",
      "<room title=\\"" + room.title + "\\">",
      room.scene,
      "</room>",
      "",
      room.scenePlot.trim() ? "<scene_plot>\\n" + room.scenePlot.trim() + "\\n</scene_plot>" : "<scene_plot>（无）</scene_plot>",
      "",
      room.sceneGoal.trim() ? "<scene_goal>\\n" + room.sceneGoal.trim() + "\\n</scene_goal>" : "<scene_goal>（无）</scene_goal>",
      "",
      room.sceneDirection.trim() ? "<scene_direction>\\n" + room.sceneDirection.trim() + "\\n</scene_direction>" : "<scene_direction>（无）</scene_direction>",
      "",
      "<characters>",
      characterList,
      "</characters>",
      "",
      currentDraft?.trim() ? "<managed_direction_hint>\\n" + currentDraft.trim() + "\\n</managed_direction_hint>" : "",
      "",
      "<recent_conversation>",
      recentConversation || "（无）",
      "</recent_conversation>",
      "",
      "<public_visible_messages>",
      formatTavernVisibleMessagesForRequestContext(
        normalizeTavernMessagesForAudience({
          messages,
          characters,
          userPersonaName: room.userPersonaName,
          audience: { type: "user_proxy" },
        }).slice(-12),
      ) || "（无）",
      "</public_visible_messages>",
    ].filter(Boolean).join("\\n");
    return {
      sessionRootDir: tavernBridgeSessionRootDir(room.id),
      agentRoleId: tavernManagedUserAgentRoleId(room),
      systemPrompt: buildTavernBridgeSystemPrompt(room),
      userMessage: "以导演身份，为酒馆用户「" + (room.userPersonaName || "我") + "」生成本轮要发送的回复。",
      requestContext: prompt,
      runtimeInstruction: [
        "你是酒馆模式的全托管导演。",
        "你负责代用户生成下一句可发送回复，让剧情自然继续。",
        "reply 字段必须非空，且不得包含工具调用、函数调用、XML/HTML 标签或系统标记。",
        "只输出符合 schema 的严格合法 JSON 对象，不要代码块。",
      ].join("\\n"),
    };
  };

  export const parseDirectorDecision = (text, characters, maxSpeakers) => {
    const ids = new Set(characters.map((character) => character.id));
    const nameById = new Map(characters.map((character) => [character.id, character.name]));
    const jsonText = extractJsonObject(text);
    let parsed = null;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      parsed = null;
    }
    const parsedSpeakerIds = Array.isArray(parsed?.speakerIds) ? parsed.speakerIds : null;
    const speakerIds = (parsedSpeakerIds
      ? parsedSpeakerIds.filter((id) => typeof id === "string" && ids.has(id))
      : extractLooseJsonStringArray(jsonText, "speakerIds").filter((id) => ids.has(id))
    );
    const uniqueSpeakerIds = [...new Set(speakerIds)].slice(0, maxSpeakers);
    const speakerIdSet = new Set(uniqueSpeakerIds);
    const narrator = typeof parsed?.narrator === "string"
      ? parsed.narrator.trim()
      : extractLooseJsonStringField(jsonText, "narrator");
    const reason = typeof parsed?.reason === "string"
      ? parsed.reason.trim()
      : extractLooseJsonStringField(jsonText, "reason");
    const ambientActions = Array.isArray(parsed?.ambientActions)
      ? parsed.ambientActions.flatMap((candidate) => {
        if (!candidate || typeof candidate !== "object") {
          return [];
        }
        const characterId = typeof candidate.characterId === "string" ? candidate.characterId.trim() : "";
        const rawAction = typeof candidate.action === "string" ? candidate.action.trim() : "";
        const characterName = nameById.get(characterId);
        if (!ids.has(characterId) || speakerIdSet.has(characterId) || !characterName || !rawAction) {
          return [];
        }
        const action = rawAction.includes(characterName)
          ? rawAction
          : characterName + rawAction.replace(/^他(?:们)?|^她(?:们)?|^它(?:们)?/, "");

        return [{
          characterId,
          action: action.replace(/^[*_\\s]+|[*_\\s]+$/g, "").slice(0, 120),
        }];
      }).slice(0, 2)
      : [];

    return {
      speakerIds: uniqueSpeakerIds,
      narrator: narrator ? narrator.slice(0, 280) : undefined,
      ambientActions,
      reason: reason ? reason.slice(0, 180) : undefined,
    };
  };

  export const buildDirectorRequest = ({
    room,
    characters,
    messages,
    currentUserText,
    maxSpeakers,
  }) => {
    const runtimeMessages = tavernMessagesToRuntimeMessages({
      messages,
      characters,
      userPersonaName: room.userPersonaName,
    });
    const lorebookText = formatTavernLorebookEntries(selectTavernLorebookEntries({
      room,
      characters,
      currentUserText,
    }));
    const characterList = characters.map((character) => [
      "id: " + character.id,
      "name: " + character.name,
      "description: " + character.description,
      character.goals ? "goals: " + character.goals : "",
      character.relationships ? "relationships: " + character.relationships : "",
      room.characterMemories[character.id]?.trim()
        ? "memory: " + room.characterMemories[character.id].trim()
        : "",
    ].filter(Boolean).join("\\n")).join("\\n\\n---\\n\\n");
    const ambientActionMax = Math.min(2, Math.max(0, characters.length - 1));
    const prompt = [
      "<output_schema>",
      "{\\"speakerIds\\":[\\"character-id\\"],\\"ambientActions\\":[{\\"characterId\\":\\"未发言角色 id\\",\\"action\\":\\"一句可观察动作\\"}],\\"narrator\\":\\"可选旁白\\",\\"reason\\":\\"可选简短原因\\"}",
      "</output_schema>",
      "",
      "<constraints maxSpeakers=\\"" + maxSpeakers + "\\">",
      "speakerIds 只能使用下方角色 id；如果需要多人发言，按发言顺序排列。",
      "speakerIds 是本轮角色调用计划，不是氛围描述；只要 characters 非空，speakerIds 必须至少包含 1 个角色 id。",
      "不要用空数组表示沉默、留白、等待或用户要求少说；这种情况选择 1 个最相关角色进行一句短回应。",
      "当用户输入是“嗯”“好”“继续”等短确认时，也必须选择 1 个角色承接当前岗位状态，不要返回 []。",
      "每轮自主选择 1 到 " + maxSpeakers + " 个角色，不要为了凑人数而加入无必要发言者。",
      "如果用户明确点名多个角色发言或给出发言顺序，在 " + maxSpeakers + " 人上限内优先按用户点名安排。",
      "普通承接轮次优先选择 1-2 个角色；冲突、会议、多人相关场景可选择最多 " + maxSpeakers + " 个角色。",
      "优先选择最能推进场景目标、回应用户、制造承接关系的角色。",
      "ambientActions 可选，最多 " + ambientActionMax + " 条，只能选择未出现在 speakerIds 里的角色；只写可被观察到的动作/状态，不写对白、心理、意图或新剧情结果。",
      "ambientActions 用来让未发言角色保持在场感，例如“琪拉把托盘放回吧台”“莫尔侧身让开门口”；不要为了凑数而生成。",
      "narrator 只能写已发生状态、环境过渡或镜头提示，不要新增关键事实、行动结果或替角色做决定；可为空，建议 40 字内。",
      "如果已经输出 narrator，后续 speakerIds 应选择会对旁白产生角色回应的人；不要安排角色复述 narrator。",
      "输出必须是严格合法 JSON 对象，以 { 开头，以 } 结尾；不要代码块。",
      "</constraints>",
      "",
      room.storyOutline.trim() || room.storyGoal.trim()
        ? "<story_arc>\\n" + [room.storyOutline.trim(), room.storyGoal.trim() ? "终局目标：" + room.storyGoal.trim() : ""].filter(Boolean).join("\\n\\n") + "\\n</story_arc>"
        : "<story_arc>（无）</story_arc>",
      "",
      "<room title=\\"" + room.title + "\\">",
      room.scene,
      "</room>",
      "",
      room.scenePlot.trim() ? "<scene_plot>\\n" + room.scenePlot.trim() + "\\n</scene_plot>" : "<scene_plot>（无）</scene_plot>",
      "",
      room.sceneGoal.trim() ? "<scene_goal>\\n" + room.sceneGoal.trim() + "\\n</scene_goal>" : "<scene_goal>（无）</scene_goal>",
      "",
      room.sceneDirection.trim() ? "<scene_direction>\\n" + room.sceneDirection.trim() + "\\n</scene_direction>" : "<scene_direction>（无）</scene_direction>",
      "",
      "<story_timeline>",
      formatTavernTimelineEvents(room) || "（无）",
      "</story_timeline>",
      "",
      "<lorebook>",
      lorebookText || "（无）",
      "</lorebook>",
      "",
      "<characters>",
      characterList,
      "</characters>",
      "",
      "<current_user_input>",
      currentUserText,
      "</current_user_input>",
      "",
      "<recent_conversation>",
      formatTavernRuntimeMessagesForSummary(runtimeMessages.slice(-10)),
      "</recent_conversation>",
      "",
      "<public_visible_messages>",
      formatTavernVisibleMessagesForRequestContext(
        normalizeTavernMessagesForAudience({
          messages,
          characters,
          userPersonaName: room.userPersonaName,
          audience: { type: "director" },
        }).slice(-10),
      ) || "（无）",
      "</public_visible_messages>",
    ].join("\\n");
    return {
      sessionRootDir: tavernBridgeSessionRootDir(room.id),
      agentRoleId: tavernDirectorAgentRoleId(room),
      systemPrompt: buildTavernBridgeSystemPrompt(room),
      userMessage: "请决定本轮酒馆对话的发言顺序和可选在场动作，并只输出严格合法 JSON。",
      requestContext: prompt,
      runtimeInstruction: [
        "你是酒馆模式的导演 Agent。",
        "你的职责是根据用户输入、场景目标、剧情时间线和角色状态，决定下一轮谁应该发言。",
        "可以插入一条简短旁白来做环境过渡，但不要新增关键事实，不要代替角色行动或长篇发言。",
        "ambientActions 只用于未发言角色的公开可观察动作，不是角色对白，也不要写心理。",
        "只要有可用角色，就必须返回至少一个 speakerId；不要用空 speakerIds 表达沉默。",
        "JSON 字符串内不要使用未转义英文双引号；引用用户短句时改用中文引号。",
        "只输出严格合法 JSON，不要输出 Markdown、代码块或解释。",
      ].join("\\n"),
    };
  };

  export const buildCharacterRequest = ({
    room,
    characters,
    activeCharacterId,
    messages,
    currentUserText,
    speakerIndex,
    speakerCount,
    replyMode = room.replyMode,
    isDirectorLikeMode = false,
    isManagedMode = false,
    directorReason = "",
    promptVariant,
  }) => {
    const activeCharacter = characterById(characters, activeCharacterId);
    const turnInstruction = buildTavernCharacterTurnInstruction({
      room,
      speaker: activeCharacter,
      speakerIndex,
      speakerCount,
      replyMode,
      isDirectorLikeMode,
      isManagedMode,
      directorReason,
      promptVariant,
    });
    return buildTavernReplyAgentRequest({
      room,
      activeCharacter,
      characters,
      messages,
      references: [],
      currentUserText,
      turnInstruction,
    });
  };

  export const parseCharacterReply = ({
    text,
    room,
    characters,
    activeCharacterId,
  }) => parseTavernReplyText({
    text,
    activeCharacter: characterById(characters, activeCharacterId),
    characters,
    userPersonaName: room.userPersonaName,
  });

  export const hasCharacterDialogueText = hasTavernReplyDialogueText;

  export const extractPendingInteractions = ({
    room,
    characters,
    messages,
    turnId,
  }) => extractTavernPendingInteractionsFromMessages({
    messages,
    characters,
    userPersonaName: room.userPersonaName,
    turnId,
  });

  export const planContinuation = ({
    room,
    characters,
    pendingInteractions,
    continuationRound,
  }) => planTavernContinuation({
    pendingInteractions,
    characters,
    continuationRound,
    maxAutoContinuationRounds: room.settings.continuation.maxAutoContinuationRounds,
    maxSpeakersPerContinuation: room.settings.continuation.maxSpeakersPerContinuation,
    stopWhenUserTargeted: room.settings.continuation.stopWhenUserTargeted,
  });
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
          stderrBuffer ? `stderr:\\n${stderrBuffer}` : "",
          `recent events:\\n${JSON.stringify(seen.slice(-12).map(safeDetails), null, 2)}`,
        ].filter(Boolean).join("\\n\\n")));
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
  timeoutMs = FLOW_TIMEOUT_MS,
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

const hasRecognizableReplyStructure = (text) =>
  /<\s*inner_thought(?:\s+[^>]*)?\s*>/i.test(text) &&
  /<\s*reply(?:\s+[^>]*)?\s*>/i.test(text);

const foreignSpeakerLinePattern = (activeName, characterNames) => {
  const names = [...characterNames, "旅人", "旁白", "用户"]
    .filter((name) => name !== activeName)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`(^|\\n)\\s*(?:${names.join("|")})\\s*[:：]`);
};

const formatWarnings = [];

const stripItalicActionBlocks = (text) =>
  text.replace(/(^|\n)\s*\*[^*\n]+\*\s*(?=\n|$)/g, "\n").trim();

const hasUnbalancedMarkdownMarkers = (text, marker) =>
  (text.split(marker).length - 1) % 2 !== 0;

const assertCharacterReply = ({
  label,
  raw,
  parsed,
  forbiddenMarkers = [],
  forbiddenSecrets = [],
  forbiddenContentFragments = [],
  activeName,
  characterNames,
}) => {
  if (!hasRecognizableReplyStructure(raw)) {
    formatWarnings.push({
      label,
      issue: "raw_reply_structure_not_strict",
      raw,
    });
  }
  assert(parsed.content.trim(), `${label} 解析后公开回复不能为空`, { raw, parsed });
  assert(!/<\/?(?:inner_thought|reply|public_reply|private_thought|thought)[^>]*>/i.test(parsed.content), `${label} 解析后公开回复不应残留格式标签`, {
    raw,
    parsed,
  });
  assert(
    !hasUnbalancedMarkdownMarkers(parsed.content, "*") &&
      !hasUnbalancedMarkdownMarkers(parsed.content, "_"),
    `${label} 解析后公开回复不应残留悬挂 Markdown 标记`,
    {
    raw,
    parsed,
    },
  );
  assert(stripItalicActionBlocks(parsed.content).trim(), `${label} 不应只输出动作标注，必须包含直接对白`, {
    raw,
    parsed,
  });
  assert(!foreignSpeakerLinePattern(activeName, characterNames).test(parsed.content), `${label} 不应包含其他说话人标签`, parsed);
  for (const forbidden of forbiddenMarkers) {
    assert(!parsed.content.includes(forbidden), `${label} 不应复述其他角色 marker`, { forbidden, parsed });
  }
  const normalizedContent = parsed.content.replace(/\s+/g, "");
  for (const fragment of forbiddenContentFragments) {
    const normalizedFragment = fragment.replace(/\s+/g, "").slice(0, 24);
    if (!normalizedFragment) {
      continue;
    }
    assert(!normalizedContent.includes(normalizedFragment), `${label} 不应夹带前序角色回复`, {
      forbiddenFragment: fragment,
      parsed,
    });
  }
  for (const secret of forbiddenSecrets) {
    assert(!raw.includes(secret) && !parsed.content.includes(secret) && !String(parsed.thought ?? "").includes(secret), `${label} 不应泄露其他角色心理`, {
      secret,
      raw,
      parsed,
    });
  }
  for (const otherName of characterNames.filter((name) => name !== activeName)) {
    assert(
      !(new RegExp("(我是|作为|身为)\\\\s*" + otherName).test(raw)),
      `${label} 不应漂移成${otherName}身份`,
      raw,
    );
  }
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
  if (process.env.NOVEL_CLAW_KEEP_TAVERN_LIVE_WORKSPACE !== "1") {
    rmSync(workspacePath, { recursive: true, force: true });
  }
};

try {
  log("checking bridge agents");
  const list = await request({ type: "list_agents", requestId: "list" }, "agent_definitions", 10_000);
  assert(list.agents.some((agent) => agent.id === "pi" && agent.capabilities.includes("agent")), "pi agent 应可用", list);

  const speedResults = [];
  const speedSystemPrompt = "你是 Novel Claw 真实模型测速助手。不要调用工具。";
  for (const modelId of SPEED_MODEL_IDS) {
    const runtimeModel = runtimeModelFor(modelId);
    const sessionRootDir = join(workspacePath, "speed", modelId, "session");
    log(`speed test prepare ${modelId}`);
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

  const selectedSpeed = [...speedResults]
    .filter((item) => item.ok)
    .sort((first, second) => first.doneMs - second.doneMs)[0];
  assert(selectedSpeed, "两个 MiniMax highspeed 模型测速均失败", speedResults);
  log(`selected model ${selectedSpeed.modelId} doneMs=${selectedSpeed.doneMs}`);
  const selectedModel = runtimeModelFor(selectedSpeed.modelId);
  const { room, characters } = helper.createFixture();
  const flowSessionRootDir = join(workspacePath, "flow", "session");
  log("creating tavern flow session");
  await createSession(flowSessionRootDir, helper.bridgeSystemPrompt(room), {
    label: "tavern-flow",
    selectedModelId: selectedModel.modelId,
    runMarker,
  });

  const flowRuns = [];
  const allMessages = [];
  const characterContents = [];
  const privateSecrets = [];
  const characterNameById = new Map(characters.map((character) => [character.id, character.name]));

  const characterNamePattern = characters
    .map((character) => character.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");

  const assertManagedReply = (reply, label) => {
    assert(reply.trim(), `${label} 托管用户回复不能为空`);
    assert(
      !(new RegExp(`(^|\\n)\\s*(?:${characterNamePattern}|旁白|用户|旅人)\\s*[:：]`)).test(reply),
      `${label} 托管用户不应输出角色/旁白标签`,
      reply,
    );
    assert(!/<\/?(?:function_calls?|tool_calls?|invoke|tool|arguments?)[^>]*>/i.test(reply), `${label} 托管用户不应输出工具调用`, reply);
  };

  const runManagedUser = async (roundIndex) => {
    const requestInput = helper.buildManagedUserRequest({
      room,
      characters,
      messages: allMessages,
      currentDraft: roundIndex === 0
        ? "先请贝拉、阿洛、琪拉、莫尔依次各报一句自己的岗位情况；赛恩先照看炉火，可以只给一个动作描写。"
        : "",
    });
    const run = await runAgent({
      label: `tavern-managed-user-${roundIndex + 1}`,
      sessionRootDir: flowSessionRootDir,
      agentRoleId: requestInput.agentRoleId,
      runtimeModel: selectedModel,
      systemPrompt: requestInput.systemPrompt,
      userMessage: requestInput.userMessage,
      requestContext: requestInput.requestContext,
      runtimeInstruction: requestInput.runtimeInstruction,
    });
    const reply = helper.parseManagedReply(run.text, room.userPersonaName);
    assertManagedReply(reply, `round ${roundIndex + 1}`);
    flowRuns.push({
      label: run.label,
      activeName: room.userPersonaName || "旅人",
      kind: "managed_user",
      firstDeltaMs: run.firstDeltaMs,
      firstTextMs: run.firstTextMs,
      doneMs: run.doneMs,
      content: reply,
    });
    return reply;
  };

  const runDirector = async (roundIndex, turnMessages, currentUserText) => {
    const maxSpeakers = Math.min(4, characters.length);
    const requestInput = helper.buildDirectorRequest({
      room,
      characters,
      messages: turnMessages,
      currentUserText,
      maxSpeakers,
    });
    const run = await runAgent({
      label: `tavern-director-${roundIndex + 1}`,
      sessionRootDir: flowSessionRootDir,
      agentRoleId: requestInput.agentRoleId,
      runtimeModel: selectedModel,
      systemPrompt: requestInput.systemPrompt,
      userMessage: requestInput.userMessage,
      requestContext: requestInput.requestContext,
      runtimeInstruction: requestInput.runtimeInstruction,
    });
    const parsedDecision = helper.parseDirectorDecision(run.text, characters, maxSpeakers);
    const decision = parsedDecision.speakerIds.length > 0
      ? parsedDecision
      : {
          ...parsedDecision,
          speakerIds: characters[0]?.id ? [characters[0].id] : [],
          reason: [
            parsedDecision.reason ?? "",
            "导演返回空 speakerIds，按应用侧兜底选择默认角色。",
          ].filter(Boolean).join("；"),
        };
    if (parsedDecision.speakerIds.length === 0) {
      formatWarnings.push({
        label: `tavern-director-${roundIndex + 1}`,
        issue: "director_empty_speaker_ids_fallback",
        raw: run.text,
        fallbackSpeakerIds: decision.speakerIds,
      });
    }
    assert(decision.speakerIds.length > 0, `round ${roundIndex + 1} 应用侧兜底后必须至少有一个合法 speakerId`, {
      raw: run.text,
      decision,
    });
    flowRuns.push({
      label: run.label,
      kind: "director",
      firstDeltaMs: run.firstDeltaMs,
      firstTextMs: run.firstTextMs,
      doneMs: run.doneMs,
      decision,
    });
    return decision;
  };

  const runCharacter = async ({
    activeCharacterId,
    activeName,
    turnMessages,
    currentUserText,
    speakerIndex,
    speakerCount,
    directorReason,
    forbiddenMarkers,
    forbiddenSecrets,
    forbiddenContentFragments,
    label,
  }) => {
    const requestInput = helper.buildCharacterRequest({
      room,
      characters,
      activeCharacterId,
      messages: turnMessages,
      currentUserText,
      speakerIndex,
      speakerCount,
      replyMode: "director",
      isDirectorLikeMode: true,
      isManagedMode: true,
      directorReason,
      promptVariant: PROMPT_VARIANT,
    });
    for (const secret of forbiddenSecrets ?? []) {
      assert(!requestInput.requestContext.includes(secret), `${label} request_context 不应包含其他角色心理`, {
        secret,
        requestContext: requestInput.requestContext,
      });
    }
    const runAttempt = async ({ attemptLabel, runtimeInstruction }) => {
      const run = await runAgent({
        label: attemptLabel,
        sessionRootDir: flowSessionRootDir,
        agentRoleId: requestInput.agentRoleId,
        runtimeModel: selectedModel,
        systemPrompt: requestInput.systemPrompt,
        userMessage: requestInput.userMessage,
        requestContext: requestInput.requestContext,
        runtimeInstruction,
      });
      const parsed = helper.parseCharacterReply({
        text: run.text,
        room,
        characters,
        activeCharacterId,
      });

      return { run, parsed };
    };
    let retryCount = 0;
    let attempt = await runAttempt({
      attemptLabel: label,
      runtimeInstruction: requestInput.runtimeInstruction,
    });
    if (!attempt.parsed.content.trim() || !helper.hasCharacterDialogueText(attempt.parsed.content)) {
      formatWarnings.push({
        label,
        issue: "character_unusable_reply_retry",
        raw: attempt.run.text,
        parsed: attempt.parsed,
      });
      retryCount = 1;
      const retryInstruction = [
        requestInput.runtimeInstruction,
        "",
        "<retry_instruction>",
        "上一次输出的 <reply> 为空或只有动作标注，不能作为公开回复。",
        "请重新输出完整 XML：<inner_thought>当前角色自己的心理短句</inner_thought><reply>一句非空直接对白，可选一个动作。</reply>。",
        "不能只点头、沉默、看向某处或只写动作；如果角色只想确认，也要先说一句短对白。",
        "</retry_instruction>",
      ].filter(Boolean).join("\n");
      attempt = await runAttempt({
        attemptLabel: `${label}-retry`,
        runtimeInstruction: retryInstruction,
      });
    }
    const { run, parsed } = attempt;
    assertCharacterReply({
      label,
      raw: run.text,
      parsed,
      forbiddenMarkers,
      forbiddenSecrets,
      forbiddenContentFragments,
      activeName,
      characterNames: characters.map((character) => character.name),
    });
    flowRuns.push({
      label,
      activeName,
      kind: "character",
      firstDeltaMs: run.firstDeltaMs,
      firstTextMs: run.firstTextMs,
      doneMs: run.doneMs,
      retryCount,
      content: parsed.content,
      thought: parsed.thought ?? "",
    });
    return {
      run,
      parsed,
      requestContext: requestInput.requestContext,
    };
  };

  for (let roundIndex = 0; roundIndex < FLOW_ROUNDS; roundIndex += 1) {
    log(`running managed/director tavern round ${roundIndex + 1}/${FLOW_ROUNDS}`);
    const userText = await runManagedUser(roundIndex);
    const userMessage = {
      id: `u-${roundIndex + 1}`,
      roomId: room.id,
      role: "user",
      content: userText,
      createdAt: Date.now(),
      status: "done",
    };
    allMessages.push(userMessage);
    const turnMessages = [userMessage];

    const decision = await runDirector(roundIndex, turnMessages, userText);
    if (decision.narrator?.trim()) {
      const narratorMessage = {
        id: `n-${roundIndex + 1}`,
        roomId: room.id,
        role: "narrator",
        content: decision.narrator.trim(),
        createdAt: Date.now(),
        status: "done",
      };
      allMessages.push(narratorMessage);
      turnMessages.push(narratorMessage);
    }
    for (const [actionIndex, action] of (decision.ambientActions ?? []).entries()) {
      assert(!decision.speakerIds.includes(action.characterId), `round ${roundIndex + 1} ambientActions 不能包含已发言角色`, {
        decision,
        action,
      });
      assert(characterNameById.has(action.characterId), `round ${roundIndex + 1} ambientActions 必须使用合法角色`, action);
      const actionMessage = {
        id: `a-${roundIndex + 1}-${action.characterId}-${actionIndex}`,
        roomId: room.id,
        role: "narrator",
        characterId: action.characterId,
        content: action.action,
        createdAt: Date.now(),
        status: "done",
      };
      allMessages.push(actionMessage);
      turnMessages.push(actionMessage);
      flowRuns.push({
        label: `tavern-ambient-action-${roundIndex + 1}-${characterNameById.get(action.characterId) ?? action.characterId}`,
        activeName: characterNameById.get(action.characterId) ?? action.characterId,
        kind: "ambient_action",
        content: action.action,
      });
    }

    let speakerQueue = decision.speakerIds;
    let continuationRound = 0;
    let speakerRunIndex = 0;
    let currentContinuationInteractionIds = [];
    const closedInteractionIds = new Set();
    const continuationInstructionBySpeakerId = new Map();

    while (speakerQueue.length > 0) {
      const activeSpeakerIds = speakerQueue;
      speakerQueue = [];
      const activeContinuationInteractionIds = currentContinuationInteractionIds;
      currentContinuationInteractionIds = [];

      for (const [speakerIndex, speakerId] of activeSpeakerIds.entries()) {
        const activeName = characterNameById.get(speakerId) ?? speakerId;
        const continuationInstruction = continuationInstructionBySpeakerId.get(speakerId);
        const otherTurnSecrets = privateSecrets
          .filter((item) => item.characterId !== speakerId && turnMessages.some((message) => message.id === item.messageId))
          .map((item) => item.secret);
        const forbiddenContentFragments = characterContents
          .filter((item) => item.characterId !== speakerId)
          .map((item) => item.content);
        const characterRun = await runCharacter({
          activeCharacterId: speakerId,
          activeName,
          turnMessages,
          currentUserText: userText,
          speakerIndex,
          speakerCount: activeSpeakerIds.length,
          directorReason: [
            decision.reason ?? "",
            continuationInstruction
              ? `自动续调度：${continuationInstruction}`
              : "",
          ].filter(Boolean).join("\n"),
          forbiddenMarkers: [],
          forbiddenSecrets: otherTurnSecrets,
          forbiddenContentFragments,
          label: continuationRound > 0
            ? `tavern-round-${roundIndex + 1}-continuation-${continuationRound}-${activeName}`
            : `tavern-round-${roundIndex + 1}-${activeName}`,
        });
        for (const prior of turnMessages) {
          if (
            prior.role === "character" &&
            prior.characterId !== speakerId &&
            prior.content.trim()
          ) {
            assert(characterRun.requestContext.includes(prior.content), `${activeName} request_context 应包含本轮前序角色公开回复`, {
              prior,
              requestContext: characterRun.requestContext,
            });
          }
        }
        const secret = `${runMarker}_ROUND_${roundIndex + 1}_${speakerId}_PRIVATE_SECRET`;
        const messageId = `c-${roundIndex + 1}-${speakerId}-${speakerRunIndex}`;
        speakerRunIndex += 1;
        const message = {
          id: messageId,
          roomId: room.id,
          role: "character",
          characterId: speakerId,
          content: characterRun.parsed.content,
          thought: [characterRun.parsed.thought ?? "", secret].filter(Boolean).join("\n"),
          respondsToInteractionIds: activeContinuationInteractionIds.length > 0
            ? activeContinuationInteractionIds
            : undefined,
          createdAt: Date.now(),
          status: "done",
        };
        allMessages.push(message);
        turnMessages.push(message);
        characterContents.push({
          characterId: speakerId,
          content: characterRun.parsed.content,
        });
        privateSecrets.push({
          messageId,
          characterId: speakerId,
          secret,
        });
      }

      const latestPendingInteractions = helper.extractPendingInteractions({
        room,
        characters,
        messages: turnMessages,
        turnId: userMessage.id,
      }).filter((interaction) => !closedInteractionIds.has(interaction.id));
      const continuationPlan = room.settings.continuation.enabled
        ? helper.planContinuation({
            room,
            characters,
            pendingInteractions: latestPendingInteractions,
            continuationRound,
          })
        : {
            shouldContinue: false,
            speakerIds: [],
            interactionIds: [],
            reason: "none",
          };

      if (!continuationPlan.shouldContinue) {
        break;
      }

      continuationRound += 1;
      currentContinuationInteractionIds = continuationPlan.interactionIds;
      for (const interactionId of continuationPlan.interactionIds) {
        closedInteractionIds.add(interactionId);
      }
      const interactionText = latestPendingInteractions.find((interaction) =>
        continuationPlan.interactionIds.includes(interaction.id)
      )?.text;
      speakerQueue = continuationPlan.speakerIds.filter((speakerId) =>
        characterNameById.has(speakerId)
      );
      for (const speakerId of speakerQueue) {
        continuationInstructionBySpeakerId.set(
          speakerId,
          interactionText
            ? `回应刚才指向你的待回应事项：「${interactionText}」。`
            : "回应刚才指向你的待回应事项。",
        );
      }
      flowRuns.push({
        label: `tavern-continuation-${roundIndex + 1}-${continuationRound}`,
        kind: "continuation",
        decision: continuationPlan,
        pendingInteractions: latestPendingInteractions,
      });
    }
  }

  console.log(JSON.stringify({
    ok: true,
    selectedModelId: selectedModel.modelId,
    promptVariant: PROMPT_VARIANT,
    rounds: FLOW_ROUNDS,
    speedResults,
    formatWarnings,
    flowRuns,
  }, null, 2));

  await shutdown();
} finally {
  await cleanup();
}
