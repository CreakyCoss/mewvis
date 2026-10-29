import type { CardModel } from "../../../domains/card/model";
import {
  actionReason,
  actor,
  combinationScore,
  effectMultiplier,
  type State,
} from "../../../domains/turn/engine";
import { scoringRules } from "../structure";

/** The game scene previews the same immutable rules used by manual and automated execution. */
export function scoringPreview(
  model: CardModel,
  state: State,
  actionId: string,
  selected: string[],
) {
  const rule = scoringRules(model).find((rule) => rule.action.id === actionId);
  if (!rule || !rule.deck) return null;
  const player = actor(state),
    pile = player.collections[rule.deck.id];
  const chosen = (pile?.hand ?? []).filter((card) =>
    selected.includes(card.id),
  );
  const multiplier = effectMultiplier(rule.effect, player);
  const result = combinationScore(chosen, multiplier, rule.effect.pairBonus);
  const selectedInHand = selected.filter((id) =>
    pile?.hand.some((card) => card.id === id),
  );
  const reason =
    actionReason(model, state, rule.action) ||
    (new Set(selectedInHand).size !== selectedInHand.length
      ? "请选择不同的实体牌。"
      : "") ||
    (chosen.length < rule.deck.minSelect || chosen.length > rule.deck.maxSelect
      ? `请选择 ${rule.deck.minSelect}–${rule.deck.maxSelect} 张手牌。`
      : "");
  return { rule, player, pile, chosen, multiplier, result, reason };
}
