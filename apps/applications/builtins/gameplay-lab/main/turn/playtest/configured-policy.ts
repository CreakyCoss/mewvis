import { collectionsOf } from "../../card/collections";
import {
  actionReason,
  actor,
  bestCards,
  choose,
  current,
  effectMultiplier,
  type Choice,
  type Run,
} from "../engine";
import { type Condition, type Strategy } from "./config";
export function conditionMatches(c: Condition, value: number) {
  return c.op === "gte"
    ? value >= c.value
    : c.op === "lte"
      ? value <= c.value
      : c.op === "lt"
        ? value < c.value
        : c.op === "gt"
          ? value > c.value
          : value === c.value;
}
function roll(run: Run, salt = 0) {
  let n =
    current(run).random ^ Math.imul(run.entries.length + salt, 0x9e3779b9);
  n ^= n >>> 16;
  n = Math.imul(n, 0x7feb352d);
  n ^= n >>> 15;
  n = Math.imul(n, 0x846ca68b);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}
export function chooseConfigured(run: Run, strategy: Strategy): Choice {
  const state = current(run),
    player = actor(state);
  const available = run.model.actions.filter((a) => {
    if (actionReason(run.model, state, a)) return false;
    for (const reserve of strategy.reserves) {
      const cost = a.costs
        .filter((c) => c.field === reserve.field)
        .reduce((sum, c) => sum + c.value, 0);
      if (cost > 0 && player.values[reserve.field] - cost < reserve.value)
        return false;
    }
    const rule = strategy.rules.find((r) => r.action === a.id);
    return (
      !rule ||
      (rule.priority > 0 &&
        rule.conditions.every((c) =>
          conditionMatches(c, player.values[c.field]),
        ))
    );
  });
  const matched = strategy.rules.filter((r) =>
    available.some((a) => a.id === r.action),
  );
  let choice: Choice;
  if (matched.length) {
    let rule = matched[0];
    if (strategy.selection === "weighted") {
      let weight = roll(run) * matched.reduce((sum, r) => sum + r.priority, 0);
      for (const r of matched) {
        weight -= r.priority;
        if (weight < 0) {
          rule = r;
          break;
        }
      }
    } else rule = [...matched].sort((a, b) => b.priority - a.priority)[0];
    choice = { action: rule.action };
  } else
    choice =
      strategy.fallback === "end"
        ? { action: "__end_turn" }
        : choose(
            { ...run, model: { ...run.model, actions: available } },
            strategy.base,
          );
  const effect = run.model.actions
    .find((a) => a.id === choice.action)
    ?.effects.find((e) => e.type === "combination");
  if (effect?.type === "combination") {
    const definition = collectionsOf(run.model).find(
      (c) => c.id === effect.collection,
    )!;
    const cards = player.collections[definition.id].hand;
    const ordered =
      strategy.cards === "random"
        ? cards
            .map((card, i) => ({ card, key: roll(run, i + 1) }))
            .sort((a, b) => a.key - b.key)
            .map((v) => v.card)
        : [...cards].sort((a, b) => b.value - a.value);
    choice.cards =
      strategy.cards === "best"
        ? bestCards(
            cards,
            definition.maxSelect,
            effectMultiplier(effect, player),
            effect.pairBonus,
            definition.minSelect,
          )
        : ordered.slice(0, definition.maxSelect).map((c) => c.id);
  }
  return choice;
}
