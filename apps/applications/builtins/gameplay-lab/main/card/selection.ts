import type { State } from "../turn/engine";
import type { Action } from "../turn/model";

/** Each scoring action consumes selections from its own deck only. */
export function selectionForAction(
  state: State,
  action: Action | undefined,
  selected: string[],
) {
  const effect = action?.effects.find(
    (effect) => effect.type === "combination",
  );
  if (!effect || effect.type !== "combination") return [];
  const hand =
    state.players[state.actor].collections[effect.collection]?.hand ?? [];
  return selected.filter((id) => hand.some((card) => card.id === id));
}
