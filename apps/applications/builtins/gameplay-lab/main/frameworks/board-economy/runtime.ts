import { nextRandomSeed } from "../../shared/random";
import { copy } from "../../shared/utils";
import { sameJson } from "../composition/resolve";
import type { GameRuntime } from "../runtime-contracts";
import type { BoardModel } from "./model";
import { validateBoard } from "./validation";
export interface BoardCommand {
  type: "roll" | "buy" | "skip";
  player: number;
}
export interface BoardPlayer {
  name: string;
  cash: number;
  position: number;
  bankrupt: boolean;
}
export interface BoardEvent {
  type:
    | "start"
    | "roll"
    | "salary"
    | "buy"
    | "skip"
    | "rent"
    | "bankrupt"
    | "limit";
  text: string;
  player?: number;
  other?: number;
  tile?: string;
  amount?: number;
}
export interface BoardState {
  random: number;
  turn: number;
  actor: number;
  phase: "roll" | "purchase" | "finished";
  players: BoardPlayer[];
  owners: Record<string, number | null>;
  pending: string | null;
  lastMove: {
    player: number;
    from: number;
    to: number;
    die: number;
    laps: number;
  } | null;
  events: BoardEvent[];
  outcome:
    | { kind: "won"; winner: number; bankrupt: number; reason: string }
    | { kind: "limit"; reason: string }
    | null;
}
export interface BoardView extends BoardState {
  player: number;
}
export function startBoard(model: BoardModel, seed = 42): BoardState {
  const issues = validateBoard(model);
  if (issues.length) throw new Error(issues.map((i) => i.message).join(" "));
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff)
    throw new Error("随机种子须为 0–4,294,967,295 的整数。");
  return {
    random: seed >>> 0,
    turn: 1,
    actor: 0,
    phase: "roll",
    players: model.rules.players.map((name) => ({
      name,
      cash: model.rules.initialCash,
      position: 0,
      bankrupt: false,
    })),
    owners: Object.fromEntries(model.tiles.map((t) => [t.id, null])),
    pending: null,
    lastMove: null,
    events: [
      {
        type: "start",
        text: `两位玩家从起点出发，初始资金各 ${model.rules.initialCash}，种子 ${seed}。`,
      },
    ],
    outcome: null,
  };
}
export function observeBoard(
  _model: BoardModel,
  state: BoardState,
  player: number,
): BoardView {
  if (!Number.isInteger(player) || !state.players[player])
    throw new Error("玩家视角无效。");
  return { ...copy(state), player };
}
export function boardCommands(
  model: BoardModel,
  view: BoardView,
): BoardCommand[] {
  if (view.outcome || view.phase === "finished" || view.player !== view.actor)
    return [];
  if (view.phase === "roll") return [{ type: "roll", player: view.player }];
  const tile = model.tiles[view.players[view.player].position];
  if (
    !tile ||
    tile.id !== view.pending ||
    tile.type !== "property" ||
    view.owners[tile.id] !== null
  )
    return [];
  return [
    ...(view.players[view.player].cash >= tile.price
      ? [{ type: "buy" as const, player: view.player }]
      : []),
    { type: "skip", player: view.player },
  ];
}
function finishTurn(model: BoardModel, state: BoardState) {
  state.pending = null;
  if (state.turn >= model.rules.maxTurns) {
    state.phase = "finished";
    state.outcome = {
      kind: "limit",
      reason: `达到 ${model.rules.maxTurns} 回合上限，未判胜负。`,
    };
    state.events.push({ type: "limit", text: state.outcome.reason });
  } else {
    state.turn++;
    state.actor = 1 - state.actor;
    state.phase = "roll";
  }
}
function money(player: BoardPlayer, delta: number) {
  const next = player.cash + delta;
  if (!Number.isSafeInteger(next) || next < 0 || next > 1_000_000_000)
    throw new Error("资金结算越界，本次操作未提交。");
  player.cash = next;
}
export function advanceBoard(
  model: BoardModel,
  state: BoardState,
  command: BoardCommand,
): { state: BoardState; events: BoardEvent[] } {
  if (
    !command ||
    typeof command !== "object" ||
    Array.isArray(command) ||
    Object.keys(command).some((k) => !["type", "player"].includes(k)) ||
    !boardCommands(model, observeBoard(model, state, state.actor)).some((c) =>
      sameJson(c, command),
    )
  )
    throw new Error("当前玩家、操作时机或购买条件无效。");
  const next = copy(state),
    player = command.player,
    p = next.players[player];
  next.events = [];
  if (command.type === "buy" || command.type === "skip") {
    const tile = model.tiles[p.position];
    if (command.type === "buy") {
      money(p, -tile.price);
      next.owners[tile.id] = player;
      next.events.push({
        type: "buy",
        player,
        tile: tile.id,
        amount: tile.price,
        text: `${p.name} 花费 ${tile.price} 购买「${tile.name}」，剩余 ${p.cash}。`,
      });
    } else
      next.events.push({
        type: "skip",
        player,
        tile: tile.id,
        text: `${p.name} 跳过购买「${tile.name}」。`,
      });
    finishTurn(model, next);
  } else {
    next.random = nextRandomSeed(next.random);
    const die =
        1 + Math.floor((next.random / 4294967296) * model.rules.diceSides),
      from = p.position,
      total = from + die,
      laps = Math.floor(total / model.tiles.length);
    p.position = total % model.tiles.length;
    const tile = model.tiles[p.position];
    next.lastMove = { player, from, to: p.position, die, laps };
    next.events.push({
      type: "roll",
      player,
      tile: tile.id,
      amount: die,
      text: `${p.name} 掷出 ${die}，从「${model.tiles[from].name}」前进到「${tile.name}」。`,
    });
    if (laps && model.rules.salary) {
      const income = laps * model.rules.salary;
      money(p, income);
      next.events.push({
        type: "salary",
        player,
        amount: income,
        text: `经过起点 ${laps} 次，领取收入 ${income}，资金 ${p.cash}。`,
      });
    }
    const owner = next.owners[tile.id];
    if (tile.type === "property" && owner !== null && owner !== player) {
      if (!next.players[owner]) throw new Error("地产归属无效。");
      const bankrupt = p.cash < tile.rent,
        payment = Math.min(p.cash, tile.rent);
      money(p, -payment);
      money(next.players[owner], payment);
      next.events.push({
        type: "rent",
        player,
        other: owner,
        tile: tile.id,
        amount: payment,
        text: `${p.name} 向 ${next.players[owner].name} 支付「${tile.name}」租金 ${payment}（应付 ${tile.rent}）。`,
      });
      if (bankrupt) {
        p.bankrupt = true;
        for (const id of Object.keys(next.owners))
          if (next.owners[id] === player) next.owners[id] = owner;
        next.outcome = {
          kind: "won",
          winner: owner,
          bankrupt: player,
          reason: `${p.name} 现金不足支付租金，支付余额并移交地产；${next.players[owner].name} 获胜。`,
        };
        next.phase = "finished";
        next.pending = null;
        next.events.push({
          type: "bankrupt",
          player,
          other: owner,
          text: next.outcome.reason,
        });
      } else finishTurn(model, next);
    } else if (
      tile.type === "property" &&
      owner === null &&
      p.cash >= tile.price
    ) {
      next.phase = "purchase";
      next.pending = tile.id;
    } else {
      if (tile.type === "property" && owner === null)
        next.events.push({
          type: "skip",
          player,
          tile: tile.id,
          text: `${p.name} 现金不足购买「${tile.name}」，本回合结束。`,
        });
      finishTurn(model, next);
    }
  }
  return { state: next, events: copy(next.events) };
}
export function chooseBoard(model: BoardModel, view: BoardView): BoardCommand {
  const legal = boardCommands(model, view);
  if (!legal.length) throw new Error("当前玩家没有可执行的操作。");
  const buy = legal.find((c) => c.type === "buy");
  // Reserve one salary payment when possible; forced risky purchases remain a manual choice.
  if (buy) {
    const tile = model.tiles[view.players[view.player].position];
    if (view.players[view.player].cash - tile.price >= model.rules.salary)
      return buy;
  }
  return legal.find((c) => c.type === "roll" || c.type === "skip") ?? legal[0];
}
export const boardRuntime: GameRuntime<
  BoardModel,
  BoardState,
  BoardCommand,
  BoardEvent,
  BoardView
> = {
  validate: validateBoard,
  initialize: startBoard,
  advance: advanceBoard,
  observe: observeBoard,
  commands: boardCommands,
  choose: chooseBoard,
};
