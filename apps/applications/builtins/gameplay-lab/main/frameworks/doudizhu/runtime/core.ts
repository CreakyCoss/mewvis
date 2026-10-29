import {
  nextCardRandom,
  shuffleCardItems,
  ownedCardSelection,
} from "../../../domains/card/primitives";
import { copy } from "../../../shared/utils";
import {
  pokerDeck,
  sortPoker,
  type DoudizhuModel,
  type PokerCard,
} from "../model";
import { beatsPoker, recognizePoker } from "../rules/patterns";
import { validateDoudizhuCore } from "../validation-core";
import type {
  DoudizhuBaseState,
  DoudizhuCommand,
  DoudizhuEvent,
  DoudizhuState,
  DoudizhuView,
} from "./contracts";
function dealPoker(seed: number, deal: number): DoudizhuState {
  let random = (seed + Math.imul(deal + 1, 2654435761)) >>> 0;
  const cards = shuffleCardItems(pokerDeck(), () => {
    random = nextCardRandom(random);
    return random / 4294967296;
  });
  return {
    seed,
    deal,
    phase: "bidding",
    actor: deal % 3,
    hands: [0, 1, 2].map((i) => sortPoker(cards.slice(i * 17, i * 17 + 17))),
    kitty: cards.slice(51),
    landlord: null,
    bid: 0,
    bidder: null,
    bids: 0,
    last: null,
    passes: 0,
    multiplier: 1,
    steps: 0,
    message: deal
      ? "无人叫分，已重新发牌。"
      : "请依次叫分，最高叫分者成为地主。",
    actions: [0, 1, 2].map(() => ({ text: "等待叫分", cards: [] })),
    outcome: null,
  };
}
export function startDoudizhuCore(
  model: DoudizhuModel,
  seed = 42,
): DoudizhuState {
  const errors = validateDoudizhuCore(model);
  if (errors.length) throw new Error(errors.map((e) => e.message).join(" "));
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
    throw new Error("随机种子无效。");
  return dealPoker(seed, 0);
}
export function observeDoudizhuCore(
  _model: DoudizhuModel,
  state: DoudizhuState,
  player: number,
): DoudizhuView {
  if (![0, 1, 2].includes(player)) throw new Error("玩家视角无效。");
  const { hands, kitty, ...publicState }: DoudizhuBaseState = copy(state);
  return {
    ...publicState,
    player,
    hand: hands[player],
    counts: hands.map((h) => h.length),
    kitty: state.phase === "bidding" ? [] : kitty,
  };
}
export function advanceDoudizhuCore(
  model: DoudizhuModel,
  state: DoudizhuState,
  command: DoudizhuCommand,
) {
  if (!command || command.player !== state.actor || state.phase === "finished")
    throw new Error("当前不能执行该玩家的操作。");
  if (state.steps >= 1000) throw new Error("本局超过 1000 步，请新开一局。");
  let next = copy(state);
  const events: DoudizhuEvent[] = [],
    player = command.player;
  if (next.phase === "bidding") {
    if (
      command.type !== "bid" ||
      !Number.isInteger(command.value) ||
      command.value < 0 ||
      command.value > 3 ||
      (command.value !== 0 && command.value <= next.bid)
    )
      throw new Error("只能不叫，或叫高于当前分数的 1–3 分。");
    next.bids++;
    next.actions[player] = {
      text: command.value ? "叫 " + command.value + " 分" : "不叫",
      cards: [],
    };
    if (command.value) {
      next.bid = command.value;
      next.bidder = player;
    }
    events.push({
      type: "bid",
      player,
      text: "玩家 " + (player + 1) + " · " + next.actions[player].text,
    });
    if (next.bid === 3 || next.bids === 3) {
      if (next.bidder === null) {
        next = { ...dealPoker(next.seed, next.deal + 1), steps: state.steps };
        events.push({ type: "deal", text: next.message });
      } else {
        next.landlord = next.bidder;
        next.actor = next.bidder;
        next.phase = "playing";
        next.hands[next.actor] = sortPoker([
          ...next.hands[next.actor],
          ...next.kitty,
        ]);
        next.actions = [0, 1, 2].map(() => ({ text: "等待出牌", cards: [] }));
        events.push({
          type: "deal",
          text: "玩家 " + (next.actor + 1) + " 成为地主，获得三张底牌。",
          cards: next.kitty,
        });
      }
    } else next.actor = (player + 1) % 3;
  } else if (command.type === "pass") {
    if (!next.last || next.last.player === player)
      throw new Error("领出时不能过牌。");
    next.actions[player] = { text: "过牌", cards: [] };
    next.passes++;
    events.push({
      type: "pass",
      player,
      text: "玩家 " + (player + 1) + " 过牌。",
    });
    if (next.passes === 2) {
      next.actor = next.last.player;
      next.last = null;
      next.passes = 0;
      next.actions = [0, 1, 2].map(() => ({ text: "等待出牌", cards: [] }));
    } else next.actor = (player + 1) % 3;
  } else if (command.type === "play") {
    if (
      !Array.isArray(command.cards) ||
      !command.cards.length ||
      command.cards.length > 20 ||
      new Set(command.cards).size !== command.cards.length
    )
      throw new Error("请选择不同的手牌。");
    const hand = next.hands[player],
      cards = ownedCardSelection(hand, command.cards);
    if (!cards) throw new Error("出牌中包含不属于当前玩家的牌。");
    const played = cards,
      pattern = recognizePoker(model, played);
    if (!pattern || !beatsPoker(pattern, next.last?.pattern ?? null))
      throw new Error("牌型未启用、组合无效或不能压过当前出牌。");
    next.hands[player] = hand.filter(
      (card) => !command.cards.includes(card.id),
    );
    next.last = { player, cards: sortPoker(played), pattern };
    next.passes = 0;
    next.actions[player] = { text: "已出牌", cards: sortPoker(played) };
    if (pattern.kind === "bomb" || pattern.kind === "rocket")
      next.multiplier *= model.rules.bombFactor;
    events.push({
      type: "play",
      player,
      text:
        "玩家 " +
        (player + 1) +
        " 出牌，剩余 " +
        next.hands[player].length +
        " 张。",
      cards: sortPoker(played),
    });
    if (!next.hands[player].length) {
      const landlordWon = player === next.landlord,
        stake = model.rules.baseScore * next.bid * next.multiplier;
      next.phase = "finished";
      next.outcome = {
        team: landlordWon ? "landlord" : "farmers",
        winner: player,
        scores: [0, 1, 2].map(
          (i) =>
            (i === next.landlord ? 2 : -1) * stake * (landlordWon ? 1 : -1),
        ),
      };
      events.push({
        type: "finished",
        player,
        text: landlordWon ? "地主获胜。" : "农民获胜。",
      });
    } else next.actor = (player + 1) % 3;
  } else throw new Error("操作未启用或当前阶段不支持该操作。");
  next.steps++;
  next.message = events.map((e) => e.text).join(" ");
  return { state: next, events };
}
