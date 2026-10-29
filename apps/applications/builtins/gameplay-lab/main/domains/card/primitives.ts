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
