import type { TavernTabooRule } from "../types";

export const slowBuildupTabooRule: TavernTabooRule = {
  id: "slow-buildup",
  label: "慢热拖沓",
  description: "避免连续铺垫、背景说明和无效寒暄拖慢反馈。",
  bridgeAddendum: "雷点规则：慢热拖沓。摘要优先保留能推进下一轮的信息，不沉淀无效铺垫。",
  directorAddendum: "慢热拖沓：避免连续环境描写、长篇背景说明和无效寒暄；用短场景切换保持推进。",
  characterAddendum: "慢热拖沓：不要绕太久才回应问题；动作和心理描写必须服务冲突、信息或关系变化。",
};
