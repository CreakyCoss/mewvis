import type { NarrativeModel } from "./model";
export function narrativeAnalysis(m: NarrativeModel) {
  const reachable = new Set<string>(),
    pending = [m.startNode];
  while (pending.length) {
    const id = pending.pop()!;
    if (reachable.has(id)) continue;
    const n = m.nodes.find((n) => n.id === id);
    if (!n) continue;
    reachable.add(id);
    if (!n.ending) pending.push(...n.choices.map((c) => c.target));
  }
  return {
    reachable: reachable.size,
    unreachable: m.nodes.filter((n) => !reachable.has(n.id)),
    endings: m.nodes.filter((n) => n.ending && reachable.has(n.id)).length,
  };
}
