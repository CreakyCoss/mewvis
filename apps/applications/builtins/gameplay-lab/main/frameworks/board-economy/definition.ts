import type { FrameworkDefinition } from "../contracts";
export const boardEconomyDefinition = {
  id: "board-economy",
  gameType: "board",
  name: "环形经济棋盘",
  description:
    "两位玩家掷骰前进，购买地产、支付租金，通过现金流与资产归属展开竞争。",
  simulator: { id: "board-economy", version: 1 },
  schema: "gameplay-board-economy-v1",
  scope:
    "双人环形棋盘、起点收入、购买与跳过、自动收租、现金不足付租时破产、基础自动玩家及冻结回放。",
} satisfies FrameworkDefinition;
