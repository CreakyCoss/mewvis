import type { BoardExperiment, BoardSample } from "./model";
export const boardRate = (count: number, total: number) =>
  total ? (count / total) * 100 : 0;
export function boardExperimentRows(experiment: BoardExperiment) {
  return experiment.variants.map((variant) => {
    const all = experiment.samples.filter((s) => s.variant === variant.id),
      successful = all.filter((s) => !s.error);
    const wins = [0, 1].map(
      (seat) =>
        successful.filter(
          (s) =>
            s.final.outcome?.kind === "won" && s.final.outcome.winner === seat,
        ).length,
    );
    const bankrupt = successful.filter(
        (s) => s.final.outcome?.kind === "won",
      ).length,
      limited = successful.filter(
        (s) => s.final.outcome?.kind === "limit",
      ).length;
    return {
      id: variant.id,
      name: variant.name,
      planned: experiment.seedCount,
      finished: successful.length,
      errors: all.length - successful.length,
      wins,
      winRates: wins.map((w) => boardRate(w, successful.length)),
      bankrupt,
      bankruptRate: boardRate(bankrupt, successful.length),
      limited,
      limitRate: boardRate(limited, successful.length),
      averageTurns: successful.length
        ? successful.reduce((n, s) => n + s.final.turn, 0) / successful.length
        : null,
    };
  });
}
export function boardPairedComparison(experiment: BoardExperiment) {
  if (experiment.variants.length !== 2) return null;
  const pairs = Array.from({ length: experiment.seedCount }, (_, index) => {
    const a = experiment.samples.find(
        (s) => s.index === index && s.variant === "baseline",
      ),
      b = experiment.samples.find(
        (s) => s.index === index && s.variant === "candidate",
      );
    return a && b && !a.error && !b.error ? { a, b } : null;
  }).filter((pair) => pair !== null);
  const firstWin = (s: BoardSample) =>
    s.final.outcome?.kind === "won" && s.final.outcome.winner === 0 ? 1 : 0;
  return {
    count: pairs.length,
    averageTurnChange: pairs.length
      ? pairs.reduce((n, { a, b }) => n + b.final.turn - a.final.turn, 0) /
        pairs.length
      : null,
    firstWinRateChange: pairs.length
      ? (pairs.reduce((n, { a, b }) => n + firstWin(b) - firstWin(a), 0) /
          pairs.length) *
        100
      : null,
  };
}
