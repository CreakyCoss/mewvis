import type { PokerCard } from "../model";
import type { PokerPattern } from "../rules/patterns";

// Modules extend these interfaces in their own registration files.
export interface DoudizhuModuleCommands {}
export interface DoudizhuModuleEvents {}
export type DoudizhuCommand =
  | { type: "bid"; player: number; value: number }
  | { type: "play"; player: number; cards: string[] }
  | { type: "pass"; player: number }
  | DoudizhuModuleCommands[keyof DoudizhuModuleCommands];
export interface DoudizhuCoreEvent {
  type: "deal" | "bid" | "play" | "pass" | "finished";
  text: string;
  player?: number;
  cards?: PokerCard[];
}
export type DoudizhuEvent =
  DoudizhuCoreEvent | DoudizhuModuleEvents[keyof DoudizhuModuleEvents];
export interface DoudizhuBaseState {
  seed: number;
  deal: number;
  phase: "bidding" | "playing" | "finished";
  actor: number;
  hands: PokerCard[][];
  kitty: PokerCard[];
  landlord: number | null;
  bid: number;
  bidder: number | null;
  bids: number;
  last: { player: number; cards: PokerCard[]; pattern: PokerPattern } | null;
  passes: number;
  multiplier: number;
  steps: number;
  message: string;
  actions: { text: string; cards: PokerCard[] }[];
  outcome: {
    team: "landlord" | "farmers";
    winner: number;
    scores: number[];
  } | null;
}
export interface DoudizhuState extends DoudizhuBaseState {}
export interface DoudizhuView extends Omit<
  DoudizhuBaseState,
  "hands" | "kitty"
> {
  player: number;
  hand: PokerCard[];
  counts: number[];
  kitty: PokerCard[];
}
