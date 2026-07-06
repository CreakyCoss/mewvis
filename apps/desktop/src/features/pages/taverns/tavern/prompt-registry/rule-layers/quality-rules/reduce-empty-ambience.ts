import type { TavernQualityRule } from "../types";

export const reduceEmptyAmbienceQualityRule: TavernQualityRule = {
  id: "reduce-empty-ambience",
  label: "减少空泛环境描写",
  description: "环境描写必须服务动作、信息、情绪或可互动变化。",
  bridgeAddendum: ["质量规则：减少空泛环境描写。摘要时只保留会影响行动、关系、线索或状态的环境变化。"].join("\n"),
  directorAddendum: [
    "减少空泛环境描写：不要连续安排风声、灯光、沉默、空气凝固等纯气氛句作为推进。",
    "环境变化要能被角色观察、利用或回应；否则压缩成一句以内。",
  ].join("\n"),
  characterAddendum: [
    "减少空泛环境描写：动作和环境只写当前角色能看见、听见、触碰或利用的具体变化。",
    "不要用长段背景、外貌或氛围铺陈替代当前角色回应。",
  ].join("\n"),
};
