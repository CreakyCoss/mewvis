import type { KnowledgeSearchHit } from "@mewvis/knowledge-sdk";

/** Fuse rank positions rather than incomparable BM25 and cosine values. */
export function reciprocalRankFusion(
  keyword: readonly KnowledgeSearchHit[],
  vector: readonly KnowledgeSearchHit[],
): KnowledgeSearchHit[] {
  const merged = new Map<string, { hit: KnowledgeSearchHit; score: number }>();
  for (const ranking of [keyword, vector])
    ranking.forEach((hit, index) => {
      const item = merged.get(hit.id) ?? { hit, score: 0 };
      item.score += 1 / (60 + index + 1);
      merged.set(hit.id, item);
    });
  return [...merged.values()]
    .sort((a, b) => b.score - a.score || a.hit.id.localeCompare(b.hit.id))
    .map(({ hit, score }) => ({
      ...hit,
      score: { value: score, kind: "rank", higherIsBetter: true },
    }));
}
