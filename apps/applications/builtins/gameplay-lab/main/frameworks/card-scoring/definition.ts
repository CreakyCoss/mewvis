import type { FrameworkDefinition } from "../contracts";
export const cardScoringDefinition = {
  id: "card-scoring",
  gameType: "card",
  name: "组合计分",
  description: "在牌桌上选择手牌、组合得分并完成目标。",
  simulator: {
    id: "card-combination",
    version: 2,
  },
  schema: "gameplay-card-v1",
  scope:
    "提供卡牌与牌库结构、选牌计分、回合推进、独立牌桌和回放；可调整牌值、数量、配对奖励、倍率、目标与抽补牌规则。",
} satisfies FrameworkDefinition;
