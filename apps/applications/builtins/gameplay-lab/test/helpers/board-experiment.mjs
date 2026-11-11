import { f } from "./domain.mjs";
import { boardGame } from "./board-game.mjs";
export function boardPlan(comparison = true, seedCount = 4) {
  const baseline = {
    id: "baseline",
    name: "原租金",
    source: { kind: "version", id: "original" },
    model: boardGame(),
  };
  const candidate = {
    id: "candidate",
    name: "低租金",
    source: { kind: "draft" },
    model: structuredClone(baseline.model),
  };
  candidate.model.tiles[1].rent = candidate.model.tiles[2].rent = 1;
  return {
    variants: comparison ? [baseline, candidate] : [baseline],
    seedStart: 42,
    seedCount,
  };
}
export function completeBoardExperiment(e) {
  while (e.status === "running")
    e = f.appendBoardSample(e, f.nextBoardSample(e));
  return e;
}
