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

const generatedPresetSchema = `{
  "version": 1,
  "label": "给用户看的短名称",
  "description": "一句话说明玩法",
  "room": {
    "title": "酒馆标题",
    "promptStyleId": "novel | wuxia | light-novel | dramatic | grounded",
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
      "replyOptions": { "enabled": true, "count": 3 },
      "statusTracking": { "enabled": true, "visibleToUser": true },
      "randomEvents": { "enabled": false, "probability": 0.15 },
      "illustrationHints": { "enabled": false }
    },
    "lorebookEntries": [
      { "title": "世界书条目", "content": "只写稳定设定", "keywords": ["关键词"], "alwaysOn": false }
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
      "relationships": "与用户和其他角色的关系",
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
