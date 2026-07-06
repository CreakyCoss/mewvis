export type TavernCharacterStylePresetId =
  "natural-roleplay" | "cinematic-inner" | "light-banter" | "restrained-realistic";

export type TavernCharacterStylePreset = {
  id: TavernCharacterStylePresetId;
  label: string;
  description: string;
  speakingStyle: string;
  writingStyle: string;
  replyStylePrompt: string;
};

export const DEFAULT_TAVERN_CHARACTER_STYLE_PRESET_ID: TavernCharacterStylePresetId = "natural-roleplay";

export const TAVERN_CHARACTER_STYLE_PRESETS: TavernCharacterStylePreset[] = [
  {
    id: "natural-roleplay",
    label: "自然演绎",
    description: "适合多数互动酒馆，重点保持人设和自然对白。",
    speakingStyle: "自然回应，符合角色身份、情绪和当前关系；不替用户说话，不抢先总结用户意图。",
    writingStyle: "以角色可感知的动作、神态、语气和短句心理为主；环境描写服务当前互动，不堆砌氛围。",
    replyStylePrompt:
      "每次回复先判断角色是否知道相关事实；只输出角色自己的话语、动作和可见反应。需要沉默时，用动作或神态表达，不用旁白代替角色决策。",
  },
  {
    id: "cinematic-inner",
    label: "镜头心理",
    description: "适合情绪张力、悬疑、恋爱拉扯或剧情向角色。",
    speakingStyle: "对白有停顿、试探和情绪余味；重要信息不一次性倒完，保留角色自己的顾虑和判断。",
    writingStyle: "用近景动作、细微表情、内心闪念和场景声光承载情绪；避免解释性总结，优先让细节说话。",
    replyStylePrompt:
      "公开内容里可以写少量心理活动，但必须贴合当前刺激和角色性格；结尾留下可被用户接住的动作、问题或选择。",
  },
  {
    id: "light-banter",
    label: "轻快吐槽",
    description: "适合轻小说、ACG、日常拌嘴和高互动角色。",
    speakingStyle: "对白轻快，有反应、有吐槽、有小动作；可以玩梗但不破坏世界观和角色边界。",
    writingStyle: "句子短一些，节奏明快；用表情、动作和即时反应制造互动感，不写大段设定说明。",
    replyStylePrompt: "优先回应用户当下的话；可以抛出小问题或小挑战推动互动，但不要替用户做选择。",
  },
  {
    id: "restrained-realistic",
    label: "写实克制",
    description: "适合严肃、现实、冷淡、权谋或低表达角色。",
    speakingStyle: "话少但有信息量，避免夸张情绪和过度解释；态度通过措辞、停顿和行动体现。",
    writingStyle: "描写克制，重视具体动作、空间位置和现实反应；少用华丽比喻，避免过度内心独白。",
    replyStylePrompt: "角色不知道的事绝不猜成事实；冲突中先保持自身立场和利益，不为了迎合用户突然软化。",
  },
];

const characterStylePresetIds = new Set(TAVERN_CHARACTER_STYLE_PRESETS.map((preset) => preset.id));

export const normalizeTavernCharacterStylePresetId = (value: unknown): TavernCharacterStylePresetId =>
  typeof value === "string" && characterStylePresetIds.has(value as TavernCharacterStylePresetId)
    ? (value as TavernCharacterStylePresetId)
    : DEFAULT_TAVERN_CHARACTER_STYLE_PRESET_ID;

export const getTavernCharacterStylePreset = (value: unknown): TavernCharacterStylePreset => {
  const id = normalizeTavernCharacterStylePresetId(value);
  return TAVERN_CHARACTER_STYLE_PRESETS.find((preset) => preset.id === id) ?? TAVERN_CHARACTER_STYLE_PRESETS[0];
};
