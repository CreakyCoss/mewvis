import type { TavernTabooRule } from "../types";

export const femaleValuesDriftTabooRule: TavernTabooRule = {
  id: "female-values-drift",
  label: "女频三观漂移",
  description: "避免无理由渣、傻白甜降智、强行追妻和价值观突然漂移。",
  bridgeAddendum: "雷点规则：女频三观漂移。摘要保留角色三观、人设边界、成长承诺和关系底线。",
  directorAddendum: [
    "女频三观漂移：避免女主傻白甜、男主无理由渣、强行追妻、无回报虐点或角色价值观突然漂移。",
    "角色可以犯错，但错误要能被人设、关系阶段和处境解释。",
  ].join("\n"),
  characterAddendum: "女频三观漂移：不要为制造情绪让角色无故降智、反复横跳或突破已建立底线。",
};
