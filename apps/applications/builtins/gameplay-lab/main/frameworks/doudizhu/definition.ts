import type { FrameworkDefinition } from "../contracts";
export const doudizhuDefinition = {
  id: "doudizhu",
  gameType: "card",
  name: "斗地主",
  description: "三人叫分、地主与农民对抗，按自定义牌型跟牌并争先出完手牌。",
  simulator: { id: "doudizhu", version: 1 },
  schema: "gameplay-doudizhu-v1",
  scope:
    "54 张牌、三人叫分、跟牌与过牌、阵营胜负；可调整牌型、倍率与基础分，选配英雄洞察技能。当前不含春天及抢地主变体。",
} satisfies FrameworkDefinition;
