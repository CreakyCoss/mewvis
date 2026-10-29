import type { SimulatorRef } from "../shared/contracts";
import { uid } from "../shared/utils";
import type { NumericModel } from "../turn/model";

export interface CardDefinition {
  id: string;
  name: string;
  description: string;
  group: string;
  value: number;
}
export interface DeckEntry {
  card: string;
  count: number;
}
export interface DeckDefinition {
  id: string;
  name: string;
  entries: DeckEntry[];
  handSize: number;
  initialDraw: number;
  minSelect: number;
  maxSelect: number;
  refill: "after-play" | "turn-start" | "none";
  recycle: "shuffle-discard" | "stop";
}
/** Shared numerical rules are building blocks; card content has its own schema. */
export interface CardModel extends Omit<
  NumericModel,
  "format" | "collections"
> {
  format: "gameplay-card-v1";
  cards: CardDefinition[];
  decks: DeckDefinition[];
}
export const cardSimulator: SimulatorRef = {
  id: "card-combination",
  version: 2,
};
export const MAX_CARD_DEFINITIONS = 100;
export const MAX_DECKS = 20;
export const MAX_DECK_SIZE = 500;

export function blankCardModel(name: string): CardModel {
  return {
    format: "gameplay-card-v1",
    id: uid("model"),
    name,
    description: "",
    fields: [],
    capabilities: [],
    actions: [],
    goals: [],
    cards: [],
    decks: [],
    flow: { actionsPerTurn: 2, maxRounds: 15, income: [] },
  };
}
export function newDeck(): DeckDefinition {
  return {
    id: uid("deck"),
    name: "新牌库",
    entries: [],
    handSize: 5,
    initialDraw: 5,
    minSelect: 1,
    maxSelect: 3,
    refill: "after-play",
    recycle: "shuffle-discard",
  };
}
