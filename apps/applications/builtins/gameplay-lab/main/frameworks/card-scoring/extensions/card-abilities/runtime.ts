import type { CardModel } from "../../../../domains/card/model";
import {
  drawCardItems,
  moveOwnedCards,
} from "../../../../domains/card/primitives";
import { instanceLabel } from "../../../../domains/card/collections";
import {
  current,
  type Run,
  type Entry,
  type State,
} from "../../../../domains/turn/engine";
import { copy } from "../../../../shared/utils";
import {
  activeAbilityCommands,
  resolveActiveAbility,
  type AbilityCommand,
  type AbilityWindow,
} from "../../../composition/abilities";
import type { CardScoringView } from "../../composition/contracts";
import type { CardAbility, CardAbilitiesState } from "./model";

export interface CardAbilityCommand extends AbilityCommand<"card-ability"> {
  cards: string[];
}
export const cardAbilityWindow = (view: CardScoringView): AbilityWindow => ({
  player: view.player,
  actor: view.state.actor,
  timing: view.state.outcome ? null : "before-play",
  counts: view.counts.map((decks) =>
    Object.values(decks).reduce((sum, pile) => sum + pile.hand, 0),
  ),
});
export const cardAbilityCost = (
  ability: CardAbility,
  value: CardAbilitiesState | undefined,
  player: number,
) =>
  ability.cost
    ? Math.max(0, ability.cost.amount - (value?.focus[player]?.discount ?? 0))
    : 0;

export function cardAbilityReason(
  model: CardModel,
  view: CardScoringView,
  ability: CardAbility,
): string {
  const value = view["card-abilities"],
    p = view.state.players[view.player];
  if (
    !value ||
    !activeAbilityCommands(
      { ...ability, timing: "before-play", target: "self" },
      value.used[view.player]?.[ability.id],
      cardAbilityWindow(view),
      "card-ability",
    ).length
  )
    return view.state.outcome
      ? "本局已结束"
      : view.state.actor !== view.player
        ? "等待你的行动阶段"
        : "本局使用次数已用完";
  const cost = cardAbilityCost(ability, value, view.player);
  if (ability.cost && p.values[ability.cost.field] < cost)
    return `${model.fields.find((f) => f.id === ability.cost!.field)?.name ?? "资源"}不足，需要 ${cost}`;
  if (ability.draw || ability.discard) {
    const deck = model.decks.find((d) => d.id === ability.deck),
      pile = p.collections[ability.deck],
      counts = view.counts[view.player][ability.deck];
    if (!deck || !pile || !counts) return "能力引用的牌库不可用";
    if (pile.hand.length < ability.discard)
      return `手牌不足，须弃 ${ability.discard} 张`;
    if (ability.draw) {
      if (pile.hand.length - ability.discard >= deck.handSize)
        return "手牌已达容量上限";
      if (
        !(
          counts.draw +
          (deck.recycle === "shuffle-discard"
            ? counts.discard + ability.discard
            : 0)
        )
      )
        return "抽牌区已空且没有可回收的弃牌";
    }
  }
  if (
    !ability.draw &&
    !ability.discard &&
    ability.focus &&
    value.focus[view.player] &&
    value.focus[view.player]!.discount >= ability.focus.discount &&
    value.focus[view.player]!.turns >= ability.focus.turns
  )
    return "已有相同或更强的专注状态";
  return "";
}
export function cardAbilityCommands(
  model: CardModel,
  view: CardScoringView,
  abilities: CardAbility[],
): CardAbilityCommand[] {
  const commands: CardAbilityCommand[] = [];
  for (const ability of abilities) {
    if (cardAbilityReason(model, view, ability)) continue;
    const hand = [
      ...(view.state.players[view.player].collections[ability.deck]?.hand ??
        []),
    ].sort((a, b) => a.id.localeCompare(b.id));
    function visit(at: number, cards: string[]) {
      if (cards.length === ability.discard) {
        commands.push({
          type: "card-ability",
          player: view.player,
          target: view.player,
          skillId: ability.id,
          cards,
        });
        return;
      }
      for (let i = at; i <= hand.length - (ability.discard - cards.length); i++)
        visit(i + 1, [...cards, hand[i].id]);
    }
    visit(0, []);
  }
  return commands;
}

export function executeCardAbility(
  model: CardModel,
  run: Run,
  value: CardAbilitiesState,
  ability: CardAbility,
  command: CardAbilityCommand,
) {
  const state = copy(current(run)),
    modules = copy(value),
    window: AbilityWindow = {
      player: command.player,
      actor: state.actor,
      timing: state.outcome ? null : "before-play",
      counts: state.players.map(() => 0),
    };
  const resolved = resolveActiveAbility(
    { ...ability, timing: "before-play", target: "self" },
    modules.used[command.player][ability.id],
    window,
    {
      type: command.type,
      player: command.player,
      target: command.target,
      skillId: command.skillId,
    },
    () => {
      const player = state.players[command.player],
        notes: string[] = [];
      const cost = cardAbilityCost(ability, modules, command.player);
      if (ability.cost) {
        const before = player.values[ability.cost.field];
        if (!Number.isFinite(before) || before < cost)
          throw new Error("费用资源不足，操作未提交。");
        player.values[ability.cost.field] -= cost;
        notes.push(
          `${model.fields.find((f) => f.id === ability.cost!.field)!.name}费用 ${cost}：${before} → ${player.values[ability.cost.field]}。`,
        );
      }
      if (command.cards.length !== ability.discard)
        throw new Error(`须选择 ${ability.discard} 张自己的手牌。`);
      if (ability.draw || ability.discard) {
        const deck = model.decks.find((d) => d.id === ability.deck)!;
        const pile = player.collections[deck.id];
        const moved = moveOwnedCards(pile.hand, pile.discard, command.cards);
        pile.hand = moved.source;
        pile.discard = moved.destination;
        if (moved.cards.length)
          notes.push(
            `${deck.name}：弃置 ${moved.cards.map(instanceLabel).join("、")}。`,
          );
        const drawn = drawCardItems(
          pile,
          ability.draw,
          deck.handSize,
          deck.recycle === "shuffle-discard",
          state.random,
        );
        if (ability.draw && !drawn.cards.length)
          throw new Error("当前不能抽牌，操作未提交。");
        player.collections[deck.id] = drawn.pile;
        state.random = drawn.random;
        if (drawn.recycled)
          notes.push(`${deck.name}：将 ${drawn.recycled} 张弃牌洗回抽牌区。`);
        if (ability.draw)
          notes.push(
            `${deck.name}：抽取 ${drawn.cards.length} 张牌，手牌 ${drawn.pile.hand.length} / ${deck.handSize} 张。`,
          );
      }
      if (ability.focus) {
        modules.focus[command.player] = copy(ability.focus);
        notes.push(
          `获得专注：卡牌能力费用减免 ${ability.focus.discount}，持续 ${ability.focus.turns} 个自己的行动阶段（含当前阶段）；重新施加时覆盖。`,
        );
      }
      return notes;
    },
  );
  modules.used[command.player][ability.id] = resolved.used;
  const entry: Entry = {
    choice: { action: "__module", command: copy(command) },
    actor: state.players[command.player].name,
    title: ability.name,
    notes: resolved.result,
    state,
  };
  return { state: run, value: modules, events: [entry] };
}

export function expireCardFocus(
  before: State,
  after: State,
  value: CardAbilitiesState,
  endsTurn: boolean,
) {
  if (!endsTurn && before.actor === after.actor && before.round === after.round)
    return { value, text: "" };
  const focus = value.focus[before.actor];
  if (!focus) return { value, text: "" };
  focus.turns--;
  if (!focus.turns) value.focus[before.actor] = null;
  return {
    value,
    text: focus.turns
      ? `${before.players[before.actor].name}的专注剩余 ${focus.turns} 个自己的行动阶段。`
      : `${before.players[before.actor].name}的专注已结束。`,
  };
}
