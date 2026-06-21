import type { RuntimeModelInput } from "@/agent-client/protocol";
import {
  TAVERN_PROMPT_STYLE_PRESETS,
  normalizeTavernPromptStyleId,
} from "../prompt-styles";
import type {
  TavernGeneratedPresetJson,
  TavernPromptStyleId,
  TavernRoomSettings,
} from "../types";
import { parseTavernGeneratedPresetJsonText } from "../storage";
import { runTavernOneShotAgent } from "./one-shot";

export type TavernGeneratedPresetAgentDraft = {
  title?: string;
  promptStyleId?: TavernPromptStyleId;
  userPersonaName?: string;
  premise?: string;
  background?: string;
  worldInfo?: string;
  storyGoal?: string;
  characterSeeds?: Array<{
    name?: string;
    role?: string;
    description?: string;
    speakingStyle?: string;
    writingStyle?: string;
  }>;
  advanced?: {
    characterCount?: number;
    enableStatusTracking?: boolean;
    enableRandomEvents?: boolean;
    randomEventProbability?: number;
    enableIllustrationHints?: boolean;
    settings?: Partial<TavernRoomSettings>;
  };
};

export type RunTavernGeneratedPresetAgentInput = {
  workspacePath: string;
  agentId?: string | null;
  runtimeModel?: RuntimeModelInput | null;
  draft: TavernGeneratedPresetAgentDraft;
  onTextDelta?: (delta: string) => void;
  onThinkingDelta?: (delta: string) => void;
};

const GENERATED_PRESET_AGENT_ROLE_ID = "tavern-one-shot-preset-builder";
const promptStyleIdsSchema = TAVERN_PROMPT_STYLE_PRESETS.map((preset) => preset.id).join(" | ");

const generatedPresetSchema = `{
  "version": 1,
  "label": "给用户看的短名称",
  "description": "一句话说明玩法",
  "room": {
    "title": "酒馆标题",
    "promptStyleId": "${promptStyleIdsSchema}",
    "storyOutline": "背景故事摘要",
    "storyGoal": "场景长期目标",
    "scene": "第一幕公开环境",
    "sceneGoal": "当前幕目标",
    "plot": "当前幕冲突和推进线索",
    "storyDirection": "导演后续调度方向",
    "memory": "已知前情，初始可为空",
    "userPersonaName": "用户称呼",
    "settings": {
      "directorMaxSpeakers": 3,
      "directorScheduling": {
        "targetedReplyPolicy": "director | prefer | include | exclusive",
        "maxExtraSpeakersOnTargetedReply": 2,
        "allowDirectorOnly": false,
        "directorOnlyPhaseStatusId": "",
        "directorOnlyPhaseValues": [],
        "speakerMotivation": {
          "enabled": true,
          "maxMotivatedSpeakers": 2,
          "rules": [
            {
              "id": "short-rule-id",
              "label": "规则名",
              "when": "什么上下文会提高或降低说话欲望",
              "priority": 60,
              "instruction": "导演如何根据这个规则决定发言/动作/沉默"
            }
          ]
        },
        "profile": {
          "version": 1,
          "source": "generated",
          "globalGoals": ["全局调度目标"],
          "globalRules": ["稳定玩法调度规则"],
          "characterProfiles": {
            "stable-short-id": {
              "characterId": "stable-short-id",
              "temperament": "稳定性格调度摘要",
              "speechBias": "very_low | low | balanced | high | very_high",
              "nonverbalBias": "very_low | low | balanced | high | very_high",
              "interestTags": ["感兴趣内容"],
              "goalTags": ["个人局内目标关键词"],
              "knowledgeTags": ["常掌握或关注的知识/线索"],
              "conflictStyle": "冲突处理方式",
              "socialStrategy": "社交/竞争策略",
              "speechTriggers": ["什么情况更想说话"],
              "silenceTriggers": ["什么情况更倾向沉默或动作回应"],
              "notes": "导演调度时的稳定补充"
            }
          }
        },
        "fixedOrder": { "enabled": false, "phaseStatusId": "", "phaseValues": [], "stopAfterRound": false, "includeUser": false, "userPosition": "first | last" },
        "autoContinuation": "enabled | disabled | disabledForFixedOrder",
        "instruction": "阶段制/点名/固定顺序等调度规则"
      },
      "replyOptions": { "enabled": true, "count": 3 },
      "statusTracking": { "enabled": true, "visibleToUser": true },
      "randomEvents": { "enabled": false, "probability": 0.15 },
      "illustrationHints": { "enabled": false },
      "informationPolicy": {
        "mode": "open | mystery | social_deduction | custom",
        "uiDefaultView": "public | reveal | director",
        "hideCharacterThoughts": false,
        "revealThoughts": "manual | sceneOutcome | never",
        "hiddenFacts": { "enabled": false, "defaultVisibility": "director", "reveal": "manual | sceneOutcome | never" },
        "roleAssignment": {
          "enabled": false,
          "strategy": "manual | director_random",
          "includeUser": true,
          "revealToAssignedCharacter": true,
          "revealFactionMembers": true,
          "opening": {
            "autoStart": false,
            "publicEventType": "",
            "publicEventValue": "",
            "globalStatusPatches": []
          },
          "rolePool": [
            { "id": "wolf", "label": "狼人", "description": "夜间同阵营行动", "factionId": "wolves", "factionLabel": "狼人阵营", "count": 1 }
          ]
        }
      }
    },
    "lorebookEntries": [
      { "title": "世界书条目", "content": "只写稳定设定", "keywords": ["关键词"], "alwaysOn": false }
    ],
    "factEvents": [
      {
        "type": "role_assignment | clue_found | hidden_truth",
        "target": { "type": "character", "characterId": "stable-short-id" },
        "evidence": "结构化事实内容",
        "confidence": 1,
        "visibility": "public | private | director | hidden",
        "visibleToUser": false,
        "visibleToCharacterIds": ["stable-short-id"],
        "visibleToFactionIds": ["wolves"],
        "revealWhen": "manual | sceneOutcome | never"
      }
    ],
    "statusDefinitions": [],
    "statusRules": [],
    "progressViews": [],
    "taskDefinitions": [],
    "sceneOutcomes": []
  },
  "characters": [
    {
      "id": "stable-short-id",
      "name": "角色名",
      "avatar": "",
      "description": "人设、动机、边界",
      "speakingStyle": "对白风格",
      "writingStyle": "叙事动作和神态风格",
      "replyStylePrompt": "该角色每轮回复的额外约束",
      "goals": "角色目标",
      "relationships": [
        {
          "id": "relationship-short-id",
          "target": { "type": "user" },
          "label": "与用户的稳定基础关系",
          "attitude": "稳定态度",
          "publicNote": "公开可见的关系说明",
          "privateNote": "角色私下判断，可省略",
          "tags": ["关系关键词"],
          "updatedAt": 0
        }
      ],
      "memory": "该角色初始已知信息",
      "publicStatus": {},
      "privateStatus": {}
    }
  ],
  "messages": [
    { "role": "narrator", "content": "开场旁白" }
  ]
}`;

const promptStyleOptionsText = () =>
  TAVERN_PROMPT_STYLE_PRESETS
    .map((preset) => `- ${preset.id}: ${preset.label}。${preset.description}`)
    .join("\n");

export const buildTavernGeneratedPresetAgentSystemPrompt = () => [
  "你是酒馆预设生成 agent，负责把用户的简短想法整理成应用可直接导入的标准 JSON。",
  "必须只输出一个 JSON 对象，不要输出 markdown、解释、注释或额外文本。",
  "所有角色都是 agent 角色，不是 chat 角色；不要设计让角色替用户说话或行动的规则。",
  "角色只根据自己视角和已知信息反应；可写小说化动作、神态、环境描写，但必须属于当前角色或公开环境。",
  "人设优先，不能随意补设定导致漂移；世界书只写稳定设定，不写本轮临时动作。",
  "必须尊重 request_context 中已填的 title、premise、background、worldInfo、storyGoal、characterSeeds 和 promptStyleId，不要覆盖用户明确设定。",
  "如果 request_context.advanced.characterCount 存在，characters 数量应尽量等于该数；如果用户给了角色线索，优先保留这些角色。",
  "room.settings.replyOptions 默认启用，count 默认为 3；候选回复内容由运行时生成，预设 JSON 不要提前写死候选回复。",
  "如果 request_context.advanced.enableStatusTracking 为 false，room.settings.statusTracking.enabled 必须为 false，statusDefinitions/statusRules/progressViews 可以为空数组。",
  "如果 request_context.advanced.enableStatusTracking 为 true，可以生成少量通用状态面板，但每个可变数值状态都必须有明确事件驱动的 statusRules。",
  "如果 request_context.advanced.enableIllustrationHints 为 false，room.settings.illustrationHints.enabled 必须为 false；为 true 时只开启配置，不要生成与当前公开场景矛盾的插图内容。",
  "如果 request_context.advanced.enableRandomEvents 为 false，room.settings.randomEvents.enabled 必须为 false；为 true 时使用 request_context.advanced.randomEventProbability，随机事件仍只由导演运行时决定。",
  "狼人杀、推理悬疑或阵营剧本必须设置 room.settings.informationPolicy：公共聊天只显示 public，用户私密情报用 visibleToUser 事实表达，角色/阵营私密事实用 visibleToCharacterIds/visibleToFactionIds 表达；需要每局随机身份时，填写 roleAssignment.rolePool，由导演运行时生成本局身份事实；若进入房间就应开局，设置 roleAssignment.opening.autoStart，并用 opening.publicEventType/publicEventValue/globalStatusPatches 声明分配后要产生的公开事件和状态变化。",
  "狼人杀、辩论投票、回合制推理等阶段制剧本应设置 room.settings.directorScheduling：夜晚/投票/结算阶段可 allowDirectorOnly，白天发言阶段用 fixedOrder 绑定全局阶段状态并禁用自动续调度，避免被点名角色同轮插队；若用户也在固定座次中，设置 fixedOrder.includeUser 和 userPosition。",
  "普通互动剧本的 targetedReplyPolicy 优先使用 prefer：被点名者应被导演优先考虑；如果需要回应但不适合开口，应进入 nonverbalReplyIds，由角色 Agent 输出心理和动作，直接对白可为空。只有完全无需近景反应时才用 ambientActions/旁白处理；只有确实要求目标必须开口时才用 include/exclusive。",
  "room.settings.directorScheduling.profile 是稳定调度画像，不写本轮临时状态；为每个角色填写 speechBias、interestTags、goalTags、speechTriggers、silenceTriggers 等，让导演后续每轮结合动态状态和事实计算发言动机。",
  "profile 只描述低频稳定特征，例如沉默寡言、对化学知识感兴趣、目标是获得用户信任；不要把当前血量、当前好感、刚发生的动作写进 profile，这些应由状态栏、任务、事实和每轮调度信号处理。",
  "仅部分人可知的事实不能写进开场旁白或公开消息；只能写入 factEvents/status 初始数据或角色私有记忆，并设置可见性。",
  "随机事件只由导演触发，必须是公开可观察事件，不能直接解决主线，不能覆盖用户选择。",
  "状态栏、任务和结局可为空数组；如果设计数值状态，必须同时给出可由明确事件驱动的 statusRules。",
  "可选状态应优先使用 health、san、favorability、hostility、scene_phase、threat_level 这类通用字段。",
  "可选任务应明确 owner、visibility、completeCondition/failCondition，个人任务和团队任务都要与状态或事实事件一致。",
  "",
  "<prompt_style_options>",
  promptStyleOptionsText(),
  "</prompt_style_options>",
  "",
  "<json_schema>",
  generatedPresetSchema,
  "</json_schema>",
].join("\n");

const buildTavernGeneratedPresetRequestContext = (
  draft: TavernGeneratedPresetAgentDraft,
) => {
  const promptStyleId = normalizeTavernPromptStyleId(draft.promptStyleId);
  return JSON.stringify({
    ...draft,
    promptStyleId,
    promptStyle: TAVERN_PROMPT_STYLE_PRESETS.find((preset) => preset.id === promptStyleId),
  }, null, 2);
};

export const runTavernGeneratedPresetAgent = async ({
  workspacePath,
  agentId,
  runtimeModel,
  draft,
  onTextDelta,
  onThinkingDelta,
}: RunTavernGeneratedPresetAgentInput): Promise<{
  text: string;
  preset: TavernGeneratedPresetJson;
}> => {
  const result = await runTavernOneShotAgent({
    agentId,
    workspacePath,
    agentRoleId: GENERATED_PRESET_AGENT_ROLE_ID,
    runtimeModel,
    systemPrompt: buildTavernGeneratedPresetAgentSystemPrompt(),
    requestContext: buildTavernGeneratedPresetRequestContext(draft),
    runtimeInstruction: "生成可直接导入的酒馆标准 JSON。只输出 JSON。",
    userMessage: "根据 request_context 中的草稿生成酒馆预设 JSON。",
    allowedTools: [],
    enabledSkills: [],
    onTextDelta,
    onThinkingDelta,
  });

  return {
    text: result.text,
    preset: parseTavernGeneratedPresetJsonText(result.text),
  };
};
