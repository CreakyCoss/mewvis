import type { TavernRoomStyleId } from "@/features/pages/stories/tavern/manage/model";

export type TavernRoomStyle = {
  id: TavernRoomStyleId;
  label: string;
  description: string;
  directorAddendum: string;
  characterAddendum: string;
};

export const TAVERN_ROOM_STYLES = [
  {
    id: "silent-law",
    label: "缄默法则",
    description: "强化视角、关系阶段、剧情连续性和用户选择权，适合洁净克制的持续演绎。",
    directorAddendum: "每轮承接未决点并产生可见推进；旁白只写公开可观察状态，不以集体沉默、等待或总结闭环替代调度。",
    characterAddendum:
      "只基于自身可知信息和公开现场回应；动作保持可观察，关系按阶段推进，结尾保留可继续承接的动作、问题或信息。",
  },
  {
    id: "novel",
    label: "小说风格",
    description: "重视镜头、氛围和多轮演绎，允许缓慢铺陈但不跳过用户选择。",
    directorAddendum: "像小说分镜师一样安排节奏，允许环境转场和角色反应；优先安排能互相接话、立场碰撞的角色。",
    characterAddendum: "保持小说化动作和神态，兼顾场景连续性、人物动机与镜头感，但动作不能替代有效回应。",
  },
  {
    id: "wuxia",
    label: "武侠风格",
    description: "强调江湖气、门派恩怨、招式气势和含蓄克制的人情。",
    directorAddendum: "突出江湖局势和人物立场；公开变化可以体现风声、脚步、兵刃或传信，不随意新增门派与秘闻。",
    characterAddendum: "对白体现身份分寸与江湖气；招式、身法和伤势只基于已知事实。",
  },
  {
    id: "light-novel",
    label: "轻小说",
    description: "对话轻快、角色反应鲜明，节奏更活泼但不破坏人设与场景基调。",
    directorAddendum: "优先安排最有反应价值的角色发言，允许轻巧转场和小插曲，但不抢走用户选择权。",
    characterAddendum: "对白可以轻快、有吐槽和小动作，但不能用玩梗覆盖严肃场景或角色边界。",
  },
  {
    id: "dramatic",
    label: "戏剧冲突",
    description: "强调张力、立场碰撞和场景推进。",
    directorAddendum: "调度最能制造承接和张力的角色；随机事件只增加公开压力，不直接给出答案。",
    characterAddendum: "回复体现立场和欲望，冲突来自人设与已知事实，不用强行反转制造戏剧性。",
  },
  {
    id: "grounded",
    label: "写实克制",
    description: "减少夸张修辞，偏自然对话、清晰行动和明确因果。",
    directorAddendum: "少用强烈戏剧事件，优先自然、可观察、因果明确的调度。",
    characterAddendum: "像真实现场交流，回复短而明确，动作描写只保留必要的可见行为。",
  },
] satisfies TavernRoomStyle[];

export const DEFAULT_TAVERN_ROOM_STYLE_ID: TavernRoomStyleId = "novel";

const roomStylesById = new Map(TAVERN_ROOM_STYLES.map((style) => [style.id, style] as const));

export const normalizeTavernRoomStyleId = (value: unknown): TavernRoomStyleId =>
  typeof value === "string" && roomStylesById.has(value as TavernRoomStyleId)
    ? (value as TavernRoomStyleId)
    : DEFAULT_TAVERN_ROOM_STYLE_ID;

export const getTavernRoomStyle = (value: unknown): TavernRoomStyle =>
  roomStylesById.get(normalizeTavernRoomStyleId(value))!;
