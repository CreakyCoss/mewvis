import {
  nextCardRandom,
  shuffleCardItems,
  ownedCardSelection,
  moveOwnedCards,
} from "../card/primitives";
import type { GameComposition } from "../../frameworks/composition/contracts";
import type { SimulatorRef } from "../../shared/contracts";
import { copy } from "../../shared/utils";
import {
  basePolicyNames,
  initialIssues,
  type BasePolicy,
  type InitialPlayer,
} from "../../validation/playtest/config";
import {
  cardsForDeck,
  collectionsOf,
  instanceLabel,
} from "../card/collections";
import { cardSimulator } from "../card/model";
import {
  isNumber,
  validateModel,
  type Action,
  type Card,
  type Effect,
  type Model,
} from "./model";

export type Policy = BasePolicy;
export const policyNames = basePolicyNames;
export interface Pile {
  draw: Card[];
  hand: Card[];
  discard: Card[];
}
export interface PlayerState {
  id: string;
  name: string;
  values: Record<string, number>;
  capabilities: string[];
  collections: Record<string, Pile>;
}
export interface Outcome {
  kind: "won" | "limit";
  winners: { player: string; goal: string }[];
  reason: string;
}
export interface State {
  players: PlayerState[];
  actor: number;
  round: number;
  remaining: number;
  random: number;
  outcome: Outcome | null;
}
export interface Choice {
  action: string;
  cards?: string[];
  command?: { type: string; player: number };
}
export interface Entry {
  moduleStates?: Record<string, unknown>;
  choice: Choice | null;
  actor: string;
  title: string;
  notes: string[];
  state: State;
}
export interface Run {
  composition?: GameComposition;
  simulator: SimulatorRef;
  model: Model;
  seed: number;
  entries: Entry[];
  initial?: InitialPlayer[];
}
export const current = (run: Run) => run.entries[run.entries.length - 1].state;
export const actor = (state: State) => state.players[state.actor];

function random(state: State) {
  state.random = nextCardRandom(state.random);
  return state.random / 4294967296;
}
function shuffle<T>(items: T[], state: State) {
  return shuffleCardItems(items, () => random(state));
}
function refill(
  pile: Pile,
  size: number,
  state: State,
  recycle = true,
  notes?: string[],
  label = "牌库",
) {
  const drawn: Card[] = [];
  while (pile.hand.length < size) {
    if (!pile.draw.length) {
      if (!recycle || !pile.discard.length) break;
      pile.draw = shuffle(pile.discard, state);
      pile.discard = [];
      notes?.push(`${label}：将 ${pile.draw.length} 张弃牌洗回抽牌区。`);
    }
    const card = pile.draw.pop();
    if (!card) break;
    pile.hand.push(card);
    drawn.push(card);
  }
  if (drawn.length)
    notes?.push(
      `${label}：抽取 ${drawn.map(instanceLabel).join("、")}，手牌 ${pile.hand.length} 张。`,
    );
  else if (notes && pile.hand.length < size)
    notes.push(`${label}：抽牌区已空，当前无法补牌。`);
}
function checkGoals(model: Model, state: State) {
  const winners = state.players.flatMap((p) =>
    model.goals
      .filter((g) => p.values[g.field] >= g.threshold)
      .map((g) => ({ player: p.id, goal: g.id })),
  );
  if (winners.length)
    state.outcome = {
      kind: "won",
      winners,
      reason: "已达到目标。相同检查点同时达成时记录共同结果。",
    };
}
export function startRun(
  input: Model,
  seed = 42,
  playerCount = 1,
  initial?: InitialPlayer[],
): Run {
  const issues = validateModel(input);
  if (issues.length) throw new Error(issues.map((i) => i.message).join(" "));
  if (
    !Number.isSafeInteger(seed) ||
    seed < 0 ||
    seed > 0xffffffff ||
    ![1, 2].includes(playerCount)
  )
    throw new Error("种子或参与者数量无效。");
  const model = copy(input);
  if (
    initial &&
    (initial.length !== playerCount || initialIssues(initial, model).length)
  )
    throw new Error("参与者的初始配置与规则不匹配。");
  const state: State = {
    players: [],
    actor: 0,
    round: 1,
    remaining: model.flow.actionsPerTurn,
    random: seed >>> 0,
    outcome: null,
  };
  const openingNotes: string[] = [];
  for (let i = 0; i < playerCount; i++) {
    const player: PlayerState = {
      id: `player-${i}`,
      name: `玩家 ${String.fromCharCode(65 + i)}`,
      values: Object.fromEntries(model.fields.map((f) => [f.id, f.initial])),
      capabilities: model.capabilities
        .filter((c) => c.initial)
        .map((c) => c.id),
      collections: {},
    };
    if (initial) {
      player.name = initial[i].name;
      Object.assign(player.values, initial[i].values);
      player.capabilities = model.capabilities
        .filter((c) =>
          Object.hasOwn(initial[i].capabilities, c.id)
            ? initial[i].capabilities[c.id]
            : c.initial,
        )
        .map((c) => c.id);
    }
    for (const c of model.format === "gameplay-card-v1" ? model.decks : []) {
      const pile: Pile = {
        draw: shuffle(
          model.format === "gameplay-card-v1"
            ? cardsForDeck(
                model,
                model.decks.find((deck) => deck.id === c.id)!,
                player.id,
              )
            : [],
          state,
        ),
        hand: [],
        discard: [],
      };
      refill(
        pile,
        c.initialDraw,
        state,
        c.recycle === "shuffle-discard",
        openingNotes,
        `${player.name} · ${c.name}`,
      );
      player.collections[c.id] = pile;
    }
    state.players.push(player);
  }
  checkGoals(model, state);
  return {
    model,
    seed,
    simulator:
      model.format === "gameplay-card-v1"
        ? copy(cardSimulator)
        : { id: "resource-turns", version: 1 },
    ...(initial ? { initial: copy(initial) } : {}),
    entries: [
      {
        choice: null,
        actor: "系统",
        title: "已加载场景",
        notes: [
          `${playerCount} 位参与者 · 随机种子 ${seed} · 行动后检查目标`,
          ...openingNotes,
        ],
        state,
      },
    ],
  };
}
function costsOf(action: Action) {
  const totals = new Map<string, number>();
  for (const cost of action.costs)
    totals.set(cost.field, (totals.get(cost.field) ?? 0) + cost.value);
  return totals;
}
export function actionReason(model: Model, state: State, action: Action) {
  if (state.outcome) return "本局已经结束";
  const p = actor(state);
  const missing = action.requires.filter((id) => !p.capabilities.includes(id));
  if (missing.length)
    return `需要${missing.map((id) => model.capabilities.find((c) => c.id === id)?.name ?? id).join("、")}`;
  for (const [id, amount] of costsOf(action))
    if (p.values[id] < amount)
      return `${model.fields.find((f) => f.id === id)?.name ?? id}不足，需要 ${amount}`;
  if (model.format === "gameplay-card-v1")
    for (const effect of action.effects)
      if (effect.type === "combination") {
        const deck = model.decks.find((deck) => deck.id === effect.collection);
        if (
          !deck ||
          (p.collections[deck.id]?.hand.length ?? 0) < deck.minSelect
        )
          return `手牌不足，${deck?.name ?? "牌库"}至少需要 ${deck?.minSelect ?? 1} 张牌`;
      }
  return "";
}
export function combinationScore(
  cards: Card[],
  multiplier: number,
  pairBonus = 15,
) {
  const counts = new Map<string, number>();
  for (const card of cards)
    counts.set(card.group, (counts.get(card.group) ?? 0) + 1);
  const base = cards.reduce((sum, c) => sum + c.value, 0);
  const pairs = [...counts.values()].reduce(
    (sum, n) => sum + Math.floor(n / 2),
    0,
  );
  return {
    base,
    bonus: pairs * pairBonus,
    score: (base + pairs * pairBonus) * multiplier,
  };
}
export function effectMultiplier(
  effect: Extract<Effect, { type: "combination" }>,
  player: PlayerState,
) {
  return effect.multiplier !== undefined
    ? player.values[effect.multiplier]
    : (effect.multiplierValue ?? 1);
}
function change(
  player: PlayerState,
  field: string,
  delta: number,
  model: Model,
  notes: string[],
) {
  const before = player.values[field],
    next = before + delta;
  if (!isNumber(next) || next < 0)
    throw new Error("结算超出允许的数值范围，本次行动未提交。");
  player.values[field] = next;
  notes.push(
    `${model.fields.find((f) => f.id === field)?.name}: ${before} → ${next}`,
  );
}
function applyEffect(
  effect: Effect,
  model: Model,
  state: State,
  player: PlayerState,
  notes: string[],
  choice?: Choice,
) {
  if (effect.type === "add")
    change(
      player,
      effect.field,
      effect.value * (effect.from ? player.values[effect.from] : 1),
      model,
      notes,
    );
  if (
    effect.type === "grant" &&
    !player.capabilities.includes(effect.capability)
  ) {
    player.capabilities.push(effect.capability);
    notes.push(
      `获得${model.capabilities.find((c) => c.id === effect.capability)?.name}`,
    );
  }
  if (effect.type === "combination") {
    const definition = collectionsOf(model).find(
      (c) => c.id === effect.collection,
    )!;
    const pile = player.collections[effect.collection];
    const ids = choice?.cards ?? [];
    if (
      ids.length < definition.minSelect ||
      ids.length > definition.maxSelect ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !pile.hand.some((c) => c.id === id))
    )
      throw new Error(
        `请选择当前集合内 ${definition.minSelect}–${definition.maxSelect} 个不同对象。`,
      );
    const selected = ownedCardSelection(pile.hand, ids)!;
    const result = combinationScore(
      selected,
      effectMultiplier(effect, player),
      effect.pairBonus,
    );
    notes.push(
      `组合：${selected.map((card) => instanceLabel(card)).join("、")}；（基础 ${result.base} + 同类奖励 ${result.bonus}）× 倍率 ${effectMultiplier(effect, player)} = ${result.score}`,
    );
    change(player, effect.field, result.score, model, notes);
    const moved = moveOwnedCards(pile.hand, pile.discard, ids);
    pile.hand = moved.source;
    pile.discard = moved.destination;
    notes.push(
      `${definition.name}：${selected.map(instanceLabel).join("、")}从手牌进入弃牌区。`,
    );
    if (definition.refill === "after-play")
      refill(
        pile,
        definition.handSize,
        state,
        definition.recycle === "shuffle-discard",
        notes,
        definition.name,
      );
  }
}
export function step(run: Run, choice: Choice): Run {
  if (choice.command !== undefined)
    throw new Error("基础执行器不支持模块命令。");
  const previous = current(run);
  if (previous.outcome) throw new Error("本局已经结束，请创建新一局。");
  const state = copy(previous),
    p = actor(state),
    notes: string[] = [];
  const action = run.model.actions.find((a) => a.id === choice.action);
  if (!action && choice.action !== "__end_turn")
    throw new Error("行动不存在。");
  if (action) {
    const reason = actionReason(run.model, state, action);
    if (reason) throw new Error(reason);
    for (const [field, value] of costsOf(action))
      change(p, field, -value, run.model, notes);
    for (const e of action.effects)
      applyEffect(e, run.model, state, p, notes, choice);
    state.remaining -= 1;
  } else {
    state.remaining = 0;
    notes.push("结束当前玩家的行动阶段。");
  }
  checkGoals(run.model, state);
  if (!state.outcome && state.remaining === 0) {
    state.actor = (state.actor + 1) % state.players.length;
    state.remaining = run.model.flow.actionsPerTurn;
    if (state.actor === 0) {
      for (const player of state.players)
        for (const e of run.model.flow.income)
          applyEffect(e, run.model, state, player, notes);
      checkGoals(run.model, state);
      if (!state.outcome && state.round >= run.model.flow.maxRounds)
        state.outcome = {
          kind: "limit",
          winners: [],
          reason: "达到轮数上限，未判定为胜利或平局。",
        };
      else if (!state.outcome) state.round += 1;
      notes.push("周期结算完成。");
    }
    if (!state.outcome && run.model.format === "gameplay-card-v1")
      for (const deck of run.model.decks)
        if (deck.refill === "turn-start")
          refill(
            actor(state).collections[deck.id],
            deck.handSize,
            state,
            deck.recycle === "shuffle-discard",
            notes,
            `${actor(state).name} · ${deck.name}`,
          );
  }
  if (!state.outcome && run.entries.length >= 200)
    state.outcome = {
      kind: "limit",
      winners: [],
      reason: "达到 200 步计算预算。",
    };
  return {
    ...run,
    entries: [
      ...run.entries,
      {
        choice: copy(choice),
        actor: p.name,
        title: action?.name ?? "结束行动",
        notes,
        state,
      },
    ],
  };
}

export function bestCards(
  cards: Card[],
  limit: number,
  multiplier: number,
  pairBonus = 15,
  minimum = 1,
): string[] {
  let best: string[] = [],
    score = -1;
  const visit = (at: number, chosen: Card[]) => {
    if (chosen.length >= minimum) {
      const value = combinationScore(chosen, multiplier, pairBonus).score;
      if (value > score) {
        best = chosen.map((c) => c.id);
        score = value;
      }
    }
    if (chosen.length === limit) return;
    for (let i = at; i < cards.length; i++) visit(i + 1, [...chosen, cards[i]]);
  };
  visit(0, []);
  return best;
}
export function choose(run: Run, policy: Policy): Choice {
  const state = current(run),
    p = actor(state),
    m = run.model;
  const available = m.actions.filter((a) => !actionReason(m, state, a));
  if (!available.length) return { action: "__end_turn" };
  let action: Action;
  if (policy === "random") {
    let roll = state.random ^ Math.imul(run.entries.length, 0x9e3779b9);
    roll ^= roll << 13;
    roll ^= roll >>> 17;
    roll ^= roll << 5;
    action = available[(roll >>> 0) % available.length];
  } else {
    const score = (a: Action) =>
      a.effects.reduce((sum, e) => {
        if (e.type === "grant")
          return (
            sum +
            (policy === "growth" && !p.capabilities.includes(e.capability)
              ? 30
              : 0)
          );
        if (e.type === "combination") return sum + 20;
        const f = m.fields.find((f) => f.id === e.field)!;
        if (
          policy === "growth" &&
          f.role === "rate" &&
          p.values[f.id] < f.initial + 4
        )
          return sum + 40;
        return sum + (f.role === "progress" ? 20 : f.role === "stock" ? 1 : 0);
      }, 0);
    action = [...available].sort((a, b) => score(b) - score(a))[0];
  }
  const e = action.effects.find((e) => e.type === "combination");
  if (e?.type === "combination") {
    const c = collectionsOf(m).find((c) => c.id === e.collection)!;
    return {
      action: action.id,
      cards: bestCards(
        p.collections[c.id].hand,
        c.maxSelect,
        effectMultiplier(e, p),
        e.pairBonus,
        c.minSelect,
      ),
    };
  }
  return { action: action.id };
}
export function replay(run: Run, choices: Choice[]): Run {
  const initial = startRun(
    run.model,
    run.seed,
    run.entries[0].state.players.length,
    run.initial,
  );
  initial.simulator = copy(run.simulator);
  return choices.reduce(step, initial);
}
export function simulate(
  model: Model,
  seed: number,
  policy: Policy,
  players = 1,
): Run {
  let run = startRun(model, seed, players);
  while (!current(run).outcome) run = step(run, choose(run, policy));
  return run;
}
