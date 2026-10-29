import type { Choice, Run, State } from "../../../domains/turn/engine";
export interface CardActionCommand {
  type: "action";
  player: number;
  choice: Choice;
}
export interface CardScoringModuleCommands {}
export type CardScoringCommand =
  | CardActionCommand
  | CardScoringModuleCommands[keyof CardScoringModuleCommands];
export interface CardScoringView {
  player: number;
  step: number;
  state: State;
  counts: Record<string, { draw: number; hand: number; discard: number }>[];
}
export type CardScoringRun = Run;
