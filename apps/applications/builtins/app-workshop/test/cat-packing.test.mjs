import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { loadBuiltins } from "../scripts/builtins.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const bundle = await build({
  stdin: {
    contents:
      "export * from './mini-apps/cat-packing/source/src/engine.ts'; export * from './mini-apps/cat-packing/source/src/levels.ts'; export * from './mini-apps/cat-packing/source/src/progress.ts';",
    resolveDir: root,
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
});
const {
  LEVELS,
  SHAPES,
  shape,
  bounds,
  canPlace,
  place,
  isSolved,
  solve,
  hint,
  freshProgress,
  restoreProgress,
  updateBoard,
  unlocked,
} = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64")
);

test("all eight handcrafted levels tile their board completely using rotations only", () => {
  assert.equal(LEVELS.length, 8);
  for (const level of LEVELS) {
    assert.equal(
      level.pieces.reduce((n, p) => n + SHAPES[p.kind].length, 0),
      level.cols * level.rows,
    );
    const result = solve(level);
    assert.equal(result.status, "solved", level.name);
    assert.ok(isSolved(level, result.placements), level.name);
    assert.equal(
      new Set(level.pieces.map((p) => p.id)).size,
      level.pieces.length,
    );
    for (const piece of level.pieces)
      assert.deepEqual(shape(piece.kind, 4), shape(piece.kind, 0));
  }
});

test("placement rejects overlaps, edges, unknown pieces and invalid rotations without mutating the board", () => {
  const level = LEVELS[0],
    original = {};
  const first = place(level, original, "cat-0", { x: 0, y: 0, rotation: 0 });
  assert.ok(first);
  assert.deepEqual(original, {});
  for (const [id, pose] of [
    ["cat-1", { x: 1, y: 0, rotation: 0 }],
    ["cat-1", { x: 3, y: 0, rotation: 0 }],
    ["cat-1", { x: -1, y: 0, rotation: 0 }],
    ["cat-1", { x: 2, y: 1, rotation: 1 }],
    ["cat-1", { x: 2, y: 0, rotation: 0.5 }],
    ["cat-1", { x: 2, y: 0, rotation: 4 }],
    ["unknown", { x: 2, y: 0, rotation: 0 }],
  ])
    assert.equal(place(level, first, id, pose), null);
  assert.ok(
    canPlace(level, first, "cat-0", { x: 1, y: 0, rotation: 0 }),
    "a piece may overlap its own previous cells when moved",
  );
  assert.equal(isSolved(level, first), false);
});

test("hints preserve a solvable partial arrangement and lead to completion for every level", () => {
  for (const level of LEVELS) {
    let board = {};
    for (let n = 0; n < level.pieces.length; n++) {
      const old = structuredClone(board),
        next = hint(level, board);
      assert.equal(next.kind, "place", level.name);
      board = place(level, board, next.id, next.pose);
      assert.ok(board);
      for (const [id, pose] of Object.entries(old))
        assert.deepEqual(board[id], pose);
    }
    assert.ok(isSolved(level, board));
    assert.equal(hint(level, board).kind, "done");
  }
});

test("a legal but unsolvable placement receives a repair hint, not an impossible drop target", () => {
  let sample;
  outer: for (const level of LEVELS)
    for (const p of level.pieces)
      for (let rotation = 0; rotation < 4; rotation++) {
        const size = bounds(shape(p.kind, rotation));
        for (let y = 0; y <= level.rows - size.height; y++)
          for (let x = 0; x <= level.cols - size.width; x++) {
            const board = { [p.id]: { x, y, rotation } };
            if (solve(level, board).status === "impossible") {
              sample = { level, board };
              break outer;
            }
          }
      }
  assert.ok(sample, "fixture must cover a real dead end");
  const repair = hint(sample.level, sample.board);
  assert.equal(repair.kind, "remove");
  const board = { ...sample.board };
  delete board[repair.id];
  assert.equal(solve(sample.level, board).status, "solved");
});

test("chapter progress unlocks sequentially, survives replays, and restores unfinished boards", () => {
  let progress = freshProgress();
  assert.ok(unlocked(progress, 1));
  assert.equal(unlocked(progress, 2), false);
  for (const level of LEVELS) {
    const solution = solve(level).placements;
    progress = updateBoard(progress, level.id, solution);
    assert.ok(progress.completed.includes(level.id));
    if (level.id < 8) assert.ok(unlocked(progress, level.id + 1));
  }
  assert.equal(
    unlocked(progress, 9),
    false,
    "unbuilt chapters are never unlocked",
  );
  progress = updateBoard(progress, 3, {
    "cat-0": solve(LEVELS[2]).placements["cat-0"],
  });
  const restored = restoreProgress(JSON.parse(JSON.stringify(progress)));
  assert.deepEqual(restored, progress);
  assert.equal(restored.completed.length, 8, "replaying preserves completion");
});

test("corrupt and outdated storage cannot inject invalid board positions or skip locked levels", () => {
  for (const bad of [
    null,
    "bad",
    [],
    { version: 2 },
    { version: 1, current: 999, boards: null },
  ])
    assert.deepEqual(restoreProgress(bad), freshProgress());
  const result = restoreProgress({
    version: 1,
    current: 6,
    completed: [3, 8],
    boards: {
      1: {
        "cat-0": { x: -1, y: 0, rotation: 0 },
        "cat-1": { x: 0, y: 0, rotation: 0 },
        "cat-2": { x: 0, y: 0, rotation: 0 },
        evil: {},
      },
    },
  });
  assert.equal(result.current, 1);
  assert.deepEqual(result.completed, []);
  assert.deepEqual(Object.keys(result.boards[1]), ["cat-1"]);
});

test("registered cat mini-app compiles within the production sandbox and source limits", async () => {
  const definitions = await loadBuiltins();
  const cat = definitions.find((item) => item.id === "cat-packing");
  assert.ok(cat);
  assert.equal(cat.name, "猫猫收纳所");
  const sizes = Object.values(cat.files).map((value) =>
    Buffer.byteLength(value),
  );
  assert.ok(sizes.every((size) => size <= 128 * 1024));
  assert.ok(sizes.reduce((a, b) => a + b, 0) <= 1024 * 1024);
  assert.ok(
    Object.values(cat.files).some((value) =>
      value.includes("data:image/webp;base64,"),
    ),
  );
});
