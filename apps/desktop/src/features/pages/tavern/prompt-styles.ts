import type {
  TavernPromptStyleId,
  TavernPromptStylePreset,
} from "./types";

export const DEFAULT_TAVERN_PROMPT_STYLE_ID: TavernPromptStyleId = "novel";

export const TAVERN_PROMPT_STYLE_PRESETS: TavernPromptStylePreset[] = [
  {
    id: "novel",
    label: "小说风格",
    description: "重视镜头、氛围和多轮演绎，导演可以缓慢铺陈但不跳过用户选择。",
    bridgeSystemAddendum: "整体以小说化多 agent 演绎为主，保留场景连续性、人物动机和镜头感。",
    directorAddendum: "导演应像小说分镜师一样安排节奏：允许多轮铺陈、环境转场和角色反应，但不要直接替用户解决冲突或跳到结局。",
    characterAddendum: "角色回复可以有克制的小说化动作和神态，但公开对白必须清楚，动作不能替代回应。",
  },
  {
    id: "wuxia",
    label: "武侠风格",
    description: "强调江湖气、门派恩怨、招式气势和含蓄克制的人情。",
    bridgeSystemAddendum: "整体采用武侠叙事质感，重视江湖规矩、名声、恩怨、招式与气势，但不得随意新增门派或秘闻。",
    directorAddendum: "导演调度要突出江湖局势和人物立场，随机事件可体现风声、脚步、兵刃、传信等公开可见变化。",
    characterAddendum: "角色说话带有江湖气和个人身份分寸；招式、身法、伤势描写必须源于已知事实，不乱补神功设定。",
  },
  {
    id: "light-novel",
    label: "轻小说",
    description: "对话轻快，角色反应鲜明，节奏更活泼但不破坏人设。",
    bridgeSystemAddendum: "整体采用轻小说叙事质感，重视角色差异、轻快互动和清晰节奏。",
    directorAddendum: "导演应优先安排最有反应价值的角色发言，允许轻巧转场和小插曲，但不抢走用户选择权。",
    characterAddendum: "角色回复可更有个性和即时反应，语言自然鲜明；不要用夸张吐槽覆盖严肃场景。",
  },
  {
    id: "dramatic",
    label: "戏剧冲突",
    description: "更强调张力、立场碰撞和场景推进。",
    bridgeSystemAddendum: "整体采用戏剧冲突叙事，重视公开矛盾、选择压力和关系变化。",
    directorAddendum: "导演应调度最能制造承接和张力的角色，随机事件只增加公开压力，不直接给出答案。",
    characterAddendum: "角色回复要体现立场和欲望，冲突来自人设和已知事实，不用强行反转制造戏剧性。",
  },
  {
    id: "grounded",
    label: "写实克制",
    description: "减少夸张修辞，偏自然对话和清晰行动。",
    bridgeSystemAddendum: "整体采用写实克制叙事，减少华丽修辞，优先保持行为动机、因果和信息清晰。",
    directorAddendum: "导演应少用强烈戏剧化事件，优先选择自然、可观察、因果明确的调度。",
    characterAddendum: "角色回复应像真实现场对话，短而明确；动作描写只保留必要可见行为。",
  },
];

const promptStyleIds = new Set(TAVERN_PROMPT_STYLE_PRESETS.map((preset) => preset.id));

export const normalizeTavernPromptStyleId = (value: unknown): TavernPromptStyleId =>
  typeof value === "string" && promptStyleIds.has(value as TavernPromptStyleId)
    ? value as TavernPromptStyleId
    : DEFAULT_TAVERN_PROMPT_STYLE_ID;

export const getTavernPromptStylePreset = (
  value: unknown,
): TavernPromptStylePreset => {
  const id = normalizeTavernPromptStyleId(value);
  return TAVERN_PROMPT_STYLE_PRESETS.find((preset) => preset.id === id) ??
    TAVERN_PROMPT_STYLE_PRESETS[0];
};
