/** The same integer generator and Fisher–Yates order are used by both card skeletons. */
export const nextCardRandom = (seed: number) =>
  (Math.imul(seed, 1664525) + 1013904223) >>> 0;
export function shuffleCardItems<T>(
  items: readonly T[],
  next: () => number,
): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function ownedCardSelection<T extends { id: string }>(
  hand: readonly T[],
  ids: readonly string[],
): T[] | null {
  if (new Set(ids).size !== ids.length) return null;
  const cards = new Map(hand.map((card) => [card.id, card]));
  const selected = ids.map((id) => cards.get(id));
  return selected.every((card): card is T => card !== undefined)
    ? selected
    : null;
}

/** Validate the whole selection before changing either zone. Neither input is mutated. */
export function moveOwnedCards<T extends { id: string }>(
  source: readonly T[],
  destination: readonly T[],
  ids: readonly string[],
) {
  const cards = ownedCardSelection(source, ids);
  if (!cards) throw new Error("选牌重复或包含不属于当前牌区的牌。");
  if (cards.some((card) => destination.some((c) => c.id === card.id)))
    throw new Error("目标牌区已包含该实体牌。");
  const selected = new Set(ids);
  return {
    source: source.filter((card) => !selected.has(card.id)),
    destination: [...destination, ...cards],
    cards,
  };
}

export function visibleCardZone<T>(
  cards: readonly T[],
  visibility: "public" | "owner" | "hidden",
  owner: number,
  viewer: number,
): T[] {
  return visibility === "public" || (visibility === "owner" && owner === viewer)
    ? structuredClone([...cards])
    : [];
}

export const queryHandCards = <T>(
  zones: readonly { hand: readonly T[] }[],
): T[] => structuredClone(zones.flatMap((zone) => [...zone.hand]));

/** Draw up to count without exceeding capacity; only recycling advances the random stream. */
export function drawCardItems<T>(
  input: { draw: T[]; hand: T[]; discard: T[] },
  count: number,
  capacity: number,
  recycle: boolean,
  seed: number,
) {
  if (
    !Number.isInteger(count) ||
    count < 0 ||
    count > 10 ||
    !Number.isInteger(capacity) ||
    capacity < 1 ||
    capacity > 10
  )
    throw new Error("抽牌数量或手牌容量无效。");
  const pile = structuredClone(input),
    cards: T[] = [];
  let random = seed >>> 0,
    recycled = 0;
  while (cards.length < count && pile.hand.length < capacity) {
    if (!pile.draw.length) {
      if (!recycle || !pile.discard.length) break;
      recycled += pile.discard.length;
      pile.draw = shuffleCardItems(pile.discard, () => {
        random = nextCardRandom(random);
        return random / 4294967296;
      });
      pile.discard = [];
    }
    const card = pile.draw.pop()!;
    pile.hand.push(card);
    cards.push(card);
  }
  return { pile, cards, random, recycled };
}
