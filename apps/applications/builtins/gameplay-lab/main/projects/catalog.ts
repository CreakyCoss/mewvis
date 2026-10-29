import type { SimulatorRef } from "../shared/contracts";
export type GameTypeId = "systems" | "card" | "narrative";
export type DirectionId =
  "resource-development" | "card-scoring" | "branching-story";
export const gameTypes = [
  { id: "card", name: "卡牌", description: "设计卡牌、牌池、选牌与计分规则。" },
  {
    id: "systems",
    name: "回合资源经营",
    description: "设计资源、行动、产出、能力与发展目标。",
  },
  {
    id: "narrative",
    name: "文字冒险",
    description: "设计人物、剧情、选择、条件与后果。",
  },
] as const;
export const directions: readonly {
  id: DirectionId;
  gameType: GameTypeId;
  name: string;
  description: string;
  simulator: SimulatorRef;
  scope: string;
  schema: "gameplay-model-v1" | "gameplay-narrative-v1";
}[] = [
  {
    id: "card-scoring",
    schema: "gameplay-model-v1",
    gameType: "card",
    name: "组合计分",
    description: "通过选牌、配对奖励和倍率完成得分目标。",
    simulator: { id: "card-combination", version: 1 },
    scope:
      "支持牌池、手牌、选择、弃置与补牌；尚不支持卡牌战斗、任意触发链或完整构筑商店。",
  },
  {
    id: "resource-development",
    schema: "gameplay-model-v1",
    gameType: "systems",
    name: "回合资源发展",
    description: "通过资源投入、周期产出和能力解锁推进目标。",
    simulator: { id: "resource-turns", version: 1 },
    scope:
      "支持资源支付、固定或按状态产出、能力前置和阈值目标；不包含棋盘移动与资产归属。",
  },
  {
    id: "branching-story",
    schema: "gameplay-narrative-v1",
    gameType: "narrative",
    name: "条件分支叙事",
    description: "通过选项推进剧情，检查条件并记录状态变化。",
    simulator: { id: "branching-narrative", version: 1 },
    scope:
      "支持人物、剧情节点、结局、布尔/数字/文本变量、全部满足的条件与赋值/加减；不包含自由输入对话或生成式人物行为。",
  },
];
export const gameTypeName = (id: GameTypeId) =>
  gameTypes.find((t) => t.id === id)?.name ?? id;
export const directionDefinition = (id: DirectionId | null | undefined) =>
  directions.find((d) => d.id === id);
export const isGameType = (value: unknown): value is GameTypeId =>
  gameTypes.some((t) => t.id === value);
export const isDirection = (value: unknown): value is DirectionId =>
  directions.some((d) => d.id === value);
export function directionForSimulator(
  ref: SimulatorRef | null | undefined,
): DirectionId | null {
  return (
    directions.find(
      (d) => d.simulator.id === ref?.id && d.simulator.version === ref.version,
    )?.id ?? null
  );
}
