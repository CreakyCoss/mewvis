import { uid } from "../../shared/utils";
import type { GameComposition } from "../composition/contracts";
import { applyDoudizhuPreset } from "./composition/presets";
export interface DoudizhuModuleConfigs {}
export const patternNames = {
  single: "单张",
  pair: "对子",
  triple: "三张",
  tripleSingle: "三带一",
  triplePair: "三带二",
  straight: "顺子",
  pairChain: "连对",
  tripleChain: "飞机不带",
  planeSingle: "飞机带单",
  planePair: "飞机带对",
  fourSingle: "四带两张",
  fourPair: "四带两对",
  bomb: "炸弹",
  rocket: "王炸",
} as const;
export type PatternKind = keyof typeof patternNames;
export interface DoudizhuModel {
  format: "gameplay-doudizhu-v1";
  id: string;
  name: string;
  description: string;
  rules: {
    enabled: PatternKind[];
    straightMin: number;
    pairChainMin: number;
    tripleChainMin: number;
    distinctSingles: boolean;
    bombFactor: number;
    baseScore: number;
  };
  composition?: GameComposition;
  extensions: Partial<DoudizhuModuleConfigs> & Record<string, unknown>;
}
export function createDoudizhuModel(
  name: string,
  presetId = "classic-doudizhu",
): DoudizhuModel {
  const model: DoudizhuModel = {
    format: "gameplay-doudizhu-v1",
    id: uid("model"),
    name,
    description: "",
    rules: {
      enabled: Object.keys(patternNames) as PatternKind[],
      straightMin: 5,
      pairChainMin: 3,
      tripleChainMin: 2,
      distinctSingles: true,
      bombFactor: 2,
      baseScore: 1,
    },
    extensions: {},
  };
  applyDoudizhuPreset(model, presetId);
  return model;
}
export interface PokerCard {
  id: string;
  rank: number;
  suit: string;
}
export const rankLabel = (rank: number) =>
  ({ 11: "J", 12: "Q", 13: "K", 14: "A", 15: "2", 16: "小王", 17: "大王" })[
    rank
  ] ?? String(rank);
export function pokerDeck(): PokerCard[] {
  const cards: PokerCard[] = [];
  for (let rank = 3; rank <= 15; rank++)
    for (const suit of ["♠", "♥", "♣", "♦"])
      cards.push({ id: String(rank) + suit, rank, suit });
  return [
    ...cards,
    { id: "joker-small", rank: 16, suit: "" },
    { id: "joker-big", rank: 17, suit: "" },
  ];
}
export const sortPoker = (cards: PokerCard[]) =>
  [...cards].sort((a, b) => b.rank - a.rank || a.id.localeCompare(b.id));
