import type { DoudizhuModel, PatternKind, PokerCard } from "../model";
export interface PokerPattern {
  kind: PatternKind;
  rank: number;
  size: number;
  length: number;
}
const consecutive = (ranks: number[]) =>
  ranks.length > 0 &&
  ranks.at(-1)! <= 14 &&
  ranks.every((r, i) => i === 0 || r === ranks[i - 1] + 1);
export function recognizePoker(
  model: DoudizhuModel,
  cards: PokerCard[],
): PokerPattern | null {
  if (!cards.length || new Set(cards.map((c) => c.id)).size !== cards.length)
    return null;
  const counts = new Map<number, number>();
  for (const c of cards) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
  const ranks = [...counts.keys()].sort((a, b) => a - b),
    values = [...counts.values()],
    n = cards.length;
  const result = (
    kind: PatternKind,
    rank: number,
    length = 1,
  ): PokerPattern | null =>
    model.rules.enabled.includes(kind) ? { kind, rank, size: n, length } : null;
  if (n === 2 && ranks.join() === "16,17") return result("rocket", 17);
  if (ranks.length === 1) {
    const kind = ({ 1: "single", 2: "pair", 3: "triple", 4: "bomb" } as const)[
      n
    ];
    if (kind) return result(kind, ranks[0]);
  }
  const triple = ranks.find((r) => counts.get(r) === 3);
  if (n === 4 && triple) return result("tripleSingle", triple);
  if (n === 5 && triple && values.includes(2))
    return result("triplePair", triple);
  if (
    values.every((v) => v === 1) &&
    n >= model.rules.straightMin &&
    consecutive(ranks)
  )
    return result("straight", ranks.at(-1)!, ranks.length);
  if (
    values.every((v) => v === 2) &&
    ranks.length >= model.rules.pairChainMin &&
    consecutive(ranks)
  )
    return result("pairChain", ranks.at(-1)!, ranks.length);
  if (
    values.every((v) => v === 3) &&
    ranks.length >= model.rules.tripleChainMin &&
    consecutive(ranks)
  )
    return result("tripleChain", ranks.at(-1)!, ranks.length);
  for (const [kind, unit, wing] of [
    ["planeSingle", 4, 1],
    ["planePair", 5, 2],
  ] as const) {
    const length = n / unit;
    if (
      !Number.isInteger(length) ||
      length < model.rules.tripleChainMin ||
      !model.rules.enabled.includes(kind)
    )
      continue;
    for (let start = 3; start + length - 1 <= 14; start++) {
      const body = Array.from({ length }, (_, i) => start + i);
      if (!body.every((r) => counts.get(r) === 3)) continue;
      const rest = ranks.filter((r) => !body.includes(r));
      if (rest.includes(16) && rest.includes(17)) continue;
      if (
        wing === 2
          ? rest.length === length && rest.every((r) => counts.get(r) === 2)
          : rest.every(
              (r) => counts.get(r)! <= (model.rules.distinctSingles ? 1 : 2),
            )
      )
        return result(kind, start + length - 1, length);
    }
  }
  const four = ranks.find((r) => counts.get(r) === 4),
    rest = ranks.filter((r) => r !== four);
  if (four && !(rest.includes(16) && rest.includes(17))) {
    if (
      n === 6 &&
      rest.every((r) => counts.get(r)! <= (model.rules.distinctSingles ? 1 : 2))
    )
      return result("fourSingle", four);
    if (n === 8 && rest.length === 2 && rest.every((r) => counts.get(r) === 2))
      return result("fourPair", four);
  }
  return null;
}
export function beatsPoker(
  next: PokerPattern,
  previous: PokerPattern | null,
): boolean {
  if (!previous) return true;
  if (previous.kind === "rocket") return false;
  if (next.kind === "rocket") return true;
  if (next.kind === "bomb" && previous.kind !== "bomb") return true;
  return (
    next.kind === previous.kind &&
    next.size === previous.size &&
    next.length === previous.length &&
    next.rank > previous.rank
  );
}
/** Generate rank-equivalent candidates, without enumerating all suit permutations. */
export function pokerCandidates(
  model: DoudizhuModel,
  hand: PokerCard[],
  previous: PokerPattern | null,
): PokerCard[][] {
  const groups = new Map<number, PokerCard[]>();
  for (const c of hand) groups.set(c.rank, [...(groups.get(c.rank) ?? []), c]);
  const output: PokerCard[][] = [],
    seen = new Set<string>();
  const add = (cards: PokerCard[]) => {
    const pattern = recognizePoker(model, cards),
      key = cards
        .map((c) => c.id)
        .sort()
        .join();
    if (pattern && beatsPoker(pattern, previous) && !seen.has(key)) {
      seen.add(key);
      output.push(cards);
    }
  };
  const attach = (body: PokerCard[], count: number, pairs: boolean) => {
    const excluded = new Set(body.map((c) => c.rank)),
      ranks = [...groups.keys()].filter((r) => !excluded.has(r));
    function visit(index: number, needed: number, wings: PokerCard[]) {
      if (!needed) {
        add([...body, ...wings]);
        return;
      }
      if (index === ranks.length) return;
      const group = groups.get(ranks[index])!,
        max = pairs
          ? Math.min(1, Math.floor(group.length / 2))
          : Math.min(model.rules.distinctSingles ? 1 : 2, group.length);
      for (let take = 0; take <= Math.min(max, needed); take++)
        visit(index + 1, needed - take, [
          ...wings,
          ...group.slice(0, take * (pairs ? 2 : 1)),
        ]);
    }
    visit(0, count, []);
  };
  for (const group of groups.values()) {
    for (let size = 1; size <= Math.min(group.length, 4); size++)
      add(group.slice(0, size));
    if (group.length >= 3) {
      attach(group.slice(0, 3), 1, false);
      attach(group.slice(0, 3), 1, true);
    }
    if (group.length === 4) {
      attach(group, 2, false);
      attach(group, 2, true);
    }
  }
  if (groups.has(16) && groups.has(17))
    add([...groups.get(16)!, ...groups.get(17)!]);
  for (const [copies, minimum] of [
    [1, model.rules.straightMin],
    [2, model.rules.pairChainMin],
    [3, model.rules.tripleChainMin],
  ])
    for (let start = 3; start <= 14; start++) {
      const body: PokerCard[] = [];
      for (
        let end = start;
        end <= 14 && (groups.get(end)?.length ?? 0) >= copies;
        end++
      ) {
        body.push(...groups.get(end)!.slice(0, copies));
        const length = end - start + 1;
        if (length < minimum) continue;
        add([...body]);
        if (copies === 3) {
          attach(body, length, false);
          attach(body, length, true);
        }
      }
    }
  return output.sort(
    (a, b) =>
      b.length - a.length ||
      recognizePoker(model, a)!.rank - recognizePoker(model, b)!.rank,
  );
}
