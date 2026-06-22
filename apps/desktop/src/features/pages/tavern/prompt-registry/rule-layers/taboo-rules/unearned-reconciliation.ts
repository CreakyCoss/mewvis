import type { TavernTabooRule } from "../types";

export const unearnedReconciliationTabooRule: TavernTabooRule = {
  id: "unearned-reconciliation",
  label: "无铺垫和解",
  description: "避免情绪债未偿还时突然翻盘、和解或治愈。",
  bridgeAddendum: "雷点规则：无铺垫和解。摘要保留未偿还情绪债、证据缺口和关系裂痕。",
  directorAddendum: "无铺垫和解：爽点或治愈点应建立在前文情绪债之上，避免无铺垫突然和解或突然翻盘。",
  characterAddendum: "无铺垫和解：角色不应在缺少证据、道歉、代价或选择的情况下突然原谅、信任或崩溃。",
};
