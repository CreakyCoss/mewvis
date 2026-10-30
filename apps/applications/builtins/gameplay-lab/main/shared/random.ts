/** Stable 32-bit stream shared by deterministic game runtimes. */
export const nextRandomSeed = (seed: number) =>
  (Math.imul(seed, 1664525) + 1013904223) >>> 0;
