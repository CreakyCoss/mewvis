import { contentItem, contentKey } from "../../shared/content";
import { turnContent } from "../turn/content";
import type { CardModel } from "./model";

export function cardContent(model: CardModel) {
  const index = turnContent(model);
  for (const card of model.cards)
    index.items.push(
      contentItem(
        "card",
        card.id,
        card.name,
        `${card.group} · 基础值 ${card.value}${card.description ? ` · ${card.description}` : ""}`,
        "rules",
      ),
    );
  for (const deck of model.decks) {
    index.items.push(
      contentItem(
        "deck",
        deck.id,
        deck.name,
        `${deck.entries.length} 种牌，共 ${deck.entries.reduce((sum, entry) => sum + entry.count, 0)} 张；手牌容量 ${deck.handSize}。`,
        "rules",
      ),
    );
    for (const entry of deck.entries)
      index.references.push({
        from: contentKey("deck", deck.id),
        to: contentKey("card", entry.card),
        label: `牌库构成 · ${entry.count} 张`,
      });
  }
  return index;
}
