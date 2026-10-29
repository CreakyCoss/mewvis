import type { Card, Model } from "../turn/model";
import type { CardModel, DeckDefinition } from "./model";

export interface CardInstance extends Card {
  definitionId: string;
}
export const instanceLabel = (card: Card) =>
  "definitionId" in card
    ? `${card.name} · 副本 ${card.id.split(":").at(-1)}`
    : card.name;
export type CollectionRules = Omit<DeckDefinition, "entries">;
/** Read-only adapter for shared scoring and policy code; never persisted. */
export function collectionsOf(model: Model): CollectionRules[] {
  return model.format === "gameplay-card-v1" ? model.decks : [];
}
export function cardsForDeck(
  model: CardModel,
  deck: DeckDefinition,
  owner: string,
): CardInstance[] {
  return deck.entries.flatMap((entry) => {
    const definition = model.cards.find((card) => card.id === entry.card);
    if (!definition) throw new Error(`牌库「${deck.name}」引用的卡牌不存在。`);
    return Array.from({ length: entry.count }, (_, index) => ({
      id: `${owner}:${deck.id}:${definition.id}:${index + 1}`,
      definitionId: definition.id,
      name: definition.name,
      group: definition.group,
      value: definition.value,
    }));
  });
}
