import { copy } from "../../../shared/utils";
import type { BoardModel } from "../model";
import type { BoardCommand, BoardEvent, BoardState } from "../runtime";

export interface BoardCashChange {
  player: number;
  amount: number;
  label: string;
}
export interface BoardPresentationFrame {
  phase: "dice" | "move" | "settle";
  state: BoardState;
  player: number;
  die: number | null;
  from: number;
  destination: number;
  step: number;
  duration: number;
  cashChanges: BoardCashChange[];
}

// These are receipts for already committed events, never a second cash ledger.
export function boardCashChanges(events: BoardEvent[]): BoardCashChange[] {
  return events.flatMap((event): BoardCashChange[] => {
    if (event.player === undefined || event.amount === undefined) return [];
    if (event.type === "salary")
      return [
        { player: event.player, amount: event.amount, label: "起点收入" },
      ];
    if (event.type === "buy")
      return [
        { player: event.player, amount: -event.amount, label: "购买地产" },
      ];
    if (event.type === "rent" && event.other !== undefined)
      return [
        { player: event.player, amount: -event.amount, label: "支付租金" },
        { player: event.other, amount: event.amount, label: "收到租金" },
      ];
    return [];
  });
}

export function boardPresentationFrames(
  model: BoardModel,
  before: BoardState,
  after: BoardState,
  command: BoardCommand,
): BoardPresentationFrame[] {
  if (command.type === "skip") return [];
  const frames: BoardPresentationFrame[] = [],
    state = copy(before),
    actor = command.player,
    move = command.type === "roll" ? after.lastMove : null;
  let changes: BoardCashChange[] = [];
  const append = (
    phase: BoardPresentationFrame["phase"],
    step: number,
    duration: number,
  ) => {
    frames.push({
      phase,
      state: copy(state),
      player: actor,
      die: move?.die ?? null,
      from: move?.from ?? before.players[actor].position,
      destination: move?.to ?? after.players[actor].position,
      step,
      duration,
      cashChanges: copy(changes),
    });
  };
  if (move) {
    state.random = after.random;
    // The saved executor determines the die and path, including repeated laps.
    append("dice", 0, 240);
    for (let step = 1; step <= move.die; step++) {
      const position = (move.from + step) % model.tiles.length;
      state.players[actor].position = position;
      state.lastMove = { ...move, to: position };
      if (position === 0 && model.rules.salary) {
        state.players[actor].cash += model.rules.salary;
        const income = changes.find((c) => c.label === "起点收入");
        if (income) income.amount += model.rules.salary;
        else
          changes.push({
            player: actor,
            amount: model.rules.salary,
            label: "起点收入",
          });
      }
      append("move", step, position === 0 && model.rules.salary ? 320 : 160);
    }
  }
  const receipts = boardCashChanges(after.events);
  if (receipts.length) {
    // Cash and ownership come from the saved result. Keep the acting turn visible
    // until its settlement feedback finishes, then reveal the next turn/outcome.
    state.players = copy(after.players);
    state.owners = copy(after.owners);
    state.lastMove = copy(after.lastMove);
    changes = receipts;
    append("settle", move?.die ?? 0, 700);
  }
  return frames;
}
