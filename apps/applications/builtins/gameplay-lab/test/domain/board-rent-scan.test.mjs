import test from "node:test";
import assert from "node:assert/strict";
import { f } from "../helpers/domain.mjs";
import {
  boardPlan,
  completeBoardExperiment,
} from "../helpers/board-experiment.mjs";
const config = { kind: "rent-multiplier", start: 50, end: 200, step: 25 };
const plan = (
  count = 3,
  base = boardPlan(false, count).variants[0],
  scan = config,
) => f.createBoardRentScanPlan(base, scan, 42, count);

test("rent multipliers use exact hundredths and retain the baseline within bounded reachable ranges", () => {
  for (const [text, value] of [
    ["0.29", 29],
    ["1.01", 101],
    ["100", 10000],
    ["0.01", 1],
    [" 2 ", 200],
  ])
    assert.equal(f.parseBoardRentMultiplier(text), value);
  for (const text of [
    "",
    "0",
    "0.001",
    "1.234",
    "100.01",
    "-1",
    "1e2",
    "NaN",
    "Infinity",
  ])
    assert.equal(f.parseBoardRentMultiplier(text), null);
  assert.deepEqual(
    f.boardRentMultipliers(config),
    [50, 75, 100, 125, 150, 175, 200],
  );
  assert.deepEqual(
    f.boardRentMultipliers({ ...config, start: 25, end: 75 }),
    [25, 50, 75, 100],
  );
  for (const scan of [
    { ...config, step: 0 },
    { ...config, step: 0.5 },
    { ...config, start: 201 },
    { ...config, end: 201 },
    { ...config, step: 1 },
    { ...config, extra: undefined },
    { ...config, kind: "cash" },
    { ...config, start: 100, end: 100 },
  ])
    assert.throws(() => f.boardRentMultipliers(scan));
});

test("rent scans freeze only rent changes and round half up without mutating draft or versions", () => {
  const base = boardPlan(false).variants[0],
    original = structuredClone(base);
  const p = plan(3, base),
    points = f.boardRentScanPoints(p);
  assert.equal(p.variants.length, 7);
  assert.deepEqual(
    points.map((point) => point.minRent),
    [15, 23, 30, 38, 45, 53, 60],
  );
  assert.deepEqual(
    p.variants.map((v) => v.id),
    [
      "baseline",
      "rent-50",
      "rent-75",
      "rent-125",
      "rent-150",
      "rent-175",
      "rent-200",
    ],
  );
  for (const variant of p.variants) {
    const restored = structuredClone(variant.model);
    restored.tiles.forEach((tile, i) => (tile.rent = base.model.tiles[i].rent));
    assert.deepEqual(restored, base.model);
  }
  assert.deepEqual(base, original);
  const e = f.newBoardExperiment("p", p);
  p.scan.start = 1;
  p.variants[0].model.tiles[1].rent = 999;
  assert.equal(e.scan.start, 50);
  assert.equal(e.variants[0].model.tiles[1].rent, 30);
});

test("rounded duplicate rents share samples, including an out-of-range baseline", () => {
  const base = boardPlan(false).variants[0];
  base.model.tiles[1].rent = base.model.tiles[2].rent = 1;
  const scan = { ...config, start: 25, end: 200, step: 25 },
    p = plan(120, base, scan);
  assert.equal(p.variants.length, 2);
  assert.equal(f.boardExperimentTotal(p), 240);
  assert.deepEqual(f.boardExperimentIssues(p), []);
  const points = f.boardRentScanPoints(p);
  assert.equal(points.length, 8);
  assert.deepEqual(
    points.map((point) => point.primary),
    [100, 100, 100, 100, 100, 150, 150, 150],
  );
  assert.ok(points.every((point) => point.minRent >= 1));
  const collapsed = plan(240, base, { ...scan, end: 75 });
  assert.equal(collapsed.variants.length, 1);
  assert.equal(f.boardRentScanPoints(collapsed).length, 4);
  assert.deepEqual(f.boardExperimentIssues(collapsed), []);
});

test("scan budgets use unique rules and reject overflow, invalid sources and forged generated models", () => {
  const many = plan(21, undefined, { ...config, end: 150, step: 10 });
  assert.equal(many.variants.length, 11);
  assert.deepEqual(f.boardExperimentIssues(many), []);
  assert.ok(f.boardExperimentIssues({ ...many, seedCount: 22 }).length);
  assert.ok(
    f.boardExperimentIssues({ ...many, seedStart: 0xffffffff, seedCount: 2 })
      .length,
  );
  const high = boardPlan(false).variants[0];
  high.model.tiles[1].rent = 1_000_000;
  assert.throws(() => plan(1, high), /超过/);
  for (const mutate of [
    (p) => p.variants[1].model.rules.initialCash++,
    (p) => p.variants[1].model.tiles[1].price++,
    (p) => p.variants[1].model.tiles[1].rent++,
    (p) => p.variants[1].source.percent++,
    (p) => (p.variants[1].name = "forged"),
    (p) => p.variants.reverse(),
    (p) => delete p.scan,
    (p) => (p.scan = undefined),
  ]) {
    const bad = plan();
    mutate(bad);
    assert.throws(() => f.newBoardExperiment("p", bad));
  }
});

test("scan scheduling alternates every rule per seed and resumes a partial seed without duplicates", async () => {
  const e = f.newBoardExperiment("p", plan()),
    saved = [];
  let cancelled = false;
  const stopped = await f.runBoardExperimentBatch(e, {
    persist: async (next) => {
      saved.push(structuredClone(next));
      if (next.samples.length === 3) cancelled = true;
    },
    changed: () => {},
    cancelled: () => cancelled,
    yieldTask: async () => {},
  });
  assert.equal(stopped.status, "cancelled");
  assert.deepEqual(
    stopped.samples.map((s) => [s.index, s.variant]),
    [
      [0, "baseline"],
      [0, "rent-50"],
      [0, "rent-75"],
    ],
  );
  const loaded = f.parseBoardExperiment(
    JSON.parse(JSON.stringify(stopped)),
    "p",
  );
  const resumed = await f.runBoardExperimentBatch(
    { ...loaded, status: "running" },
    {
      persist: async () => {},
      changed: () => {},
      cancelled: () => false,
      yieldTask: async () => {},
    },
  );
  assert.equal(resumed.status, "completed");
  assert.equal(resumed.samples.length, 21);
  assert.equal(
    new Set(resumed.samples.map((s) => `${s.index}:${s.variant}`)).size,
    21,
  );
  assert.deepEqual(resumed.samples.slice(0, 3), stopped.samples);
  assert.deepEqual(f.parseBoardExperiment(resumed, "p"), resumed);
});

test("scan records recompute provenance and invalidate cached samples when frozen rules change", () => {
  const e = completeBoardExperiment(f.newBoardExperiment("p", plan())),
    parser = f.createBoardExperimentParser();
  assert.deepEqual(parser(e, "p"), e);
  for (const mutate of [
    (x) => (x.scan.start = 25),
    (x) => (x.variants[1].source.percent = 75),
    (x) => (x.samples[1].variant = "rent-999"),
    (x) => x.samples.push(structuredClone(x.samples[0])),
    (x) => x.variants.forEach((v) => v.model.rules.initialCash++),
    (x) => x.samples[0].final.players[0].cash++,
  ]) {
    const bad = structuredClone(e);
    mutate(bad);
    assert.throws(() => parser(bad, "p"));
    assert.deepEqual(parser(e, "p"), e);
  }
  const sample = e.samples.find((s) => s.variant === "rent-50");
  const r = f.boardSampleRecord(e, sample);
  assert.deepEqual(f.parseBoardRecord(r, "p"), r);
  assert.equal(r.model.tiles[1].rent, 15);
  assert.deepEqual(f.boardReplay(r), sample.final);
});

test("scan statistics exclude errors and use only successful matching seeds for every baseline difference", () => {
  let e = f.newBoardExperiment("p", plan());
  e = f.appendBoardSample(e, f.nextBoardSample(e));
  e = f.appendBoardSample(e, {
    variant: "rent-50",
    index: 0,
    seed: 42,
    decisions: [],
    final: f.startBoard(e.variants[1].model, 42),
    error: "injected",
  });
  e = completeBoardExperiment(e);
  const point = f.boardRentScanResults(e).find((p) => p.percent === 50);
  assert.equal(point.row.finished, 2);
  assert.equal(point.row.errors, 1);
  assert.equal(point.paired.count, 2);
  assert.equal(point.row.limitRate + point.row.bankruptRate, 100);
  assert.equal(f.boardPairedComparison(e), null);
  assert.deepEqual(f.parseBoardExperiment(e, "p"), e);
  const empty = f.boardRentScanResults(f.newBoardExperiment("p", plan()));
  assert.ok(
    empty.every((p) => p.row.finished === 0 && p.row.averageTurns === null),
  );
});
