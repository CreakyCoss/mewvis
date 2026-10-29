import type { SimulatorRef } from "../shared/contracts";
import { branchingStoryDefinition } from "./branching-story/definition";
import { cardScoringDefinition } from "./card-scoring/definition";
import type { FrameworkDefinition, FrameworkId, GameTypeId } from "./contracts";
import { doudizhuDefinition } from "./doudizhu/definition";
import { resourceDevelopmentDefinition } from "./resource-development/definition";
export type { FrameworkId, GameTypeId } from "./contracts";
export const gameTypes = [
  { id: "card", name: "卡牌", description: "用卡牌与牌库设计自己的玩法方案。" },
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
export const frameworks: readonly FrameworkDefinition[] = [
  cardScoringDefinition,
  doudizhuDefinition,
  resourceDevelopmentDefinition,
  branchingStoryDefinition,
];
export const gameTypeName = (id: GameTypeId) =>
  gameTypes.find((type) => type.id === id)?.name ?? id;
export const frameworkDefinition = (id: FrameworkId | null | undefined) =>
  frameworks.find((framework) => framework.id === id);
export const isGameType = (value: unknown): value is GameTypeId =>
  gameTypes.some((type) => type.id === value);
export const isFramework = (value: unknown): value is FrameworkId =>
  frameworks.some((framework) => framework.id === value);
export const frameworkForSimulator = (
  ref: SimulatorRef | null | undefined,
): FrameworkId | null =>
  frameworks.find(
    (framework) =>
      framework.simulator.id === ref?.id &&
      framework.simulator.version === ref?.version,
  )?.id ?? null;
export const defaultFramework = (type: GameTypeId) =>
  frameworks.find((framework) => framework.gameType === type)!;
