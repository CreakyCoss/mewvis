import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const bundle = await build({
  entryPoints: [
    fileURLToPath(
      new URL(
        "../mini-apps/gravity-playground/source/src/engine.ts",
        import.meta.url,
      ),
    ),
  ],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
});
const {
  advance,
  createWorld,
  launch,
  addOrbiter,
  restoreSettings,
  defaultSettings,
  MAX_BODIES,
  CX,
  CY,
} = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64")
);

test("a circular single-star orbit stays bounded and finite for a simulated minute", () => {
  const world = createWorld();
  const radii = world.bodies.map((b) => Math.hypot(b.x - CX, b.y - CY));
  for (let i = 0; i < 3600; i++) advance(world, 1 / 60);
  assert.equal(world.bodies.length, 4);
  for (const [i, b] of world.bodies.entries()) {
    assert.ok(
      Math.abs(Math.hypot(b.x - CX, b.y - CY) - radii[i]) < radii[i] * 0.01,
    );
    assert.ok([b.x, b.y, b.vx, b.vy].every(Number.isFinite));
    assert.ok(b.trail.length <= 230);
  }
});

test("pause freezes motion, speed scales integration, and background-tab gaps are bounded", () => {
  const paused = createWorld();
  paused.paused = true;
  const before = structuredClone(paused);
  advance(paused, 10);
  assert.deepEqual(paused, before);
  const fast = createWorld({ ...defaultSettings(), speed: 2 }),
    normal = createWorld();
  advance(fast, 0.01);
  advance(normal, 0.02);
  assert.deepEqual(fast.bodies, normal.bodies);
  const resumed = createWorld(),
    capped = createWorld();
  advance(resumed, 60);
  advance(capped, 0.05);
  assert.deepEqual(resumed.bodies, capped.bodies);
});

test("launch follows the drag vector, limits speed and population, and rejects invalid coordinates", () => {
  const world = createWorld();
  assert.equal(launch(world, [200, 250], [240, 230]), true);
  const b = world.bodies.at(-1);
  assert.equal(b.x, 200);
  assert.equal(b.y, 250);
  assert.equal(b.vx, 26);
  assert.equal(b.vy, -13);
  assert.equal(launch(world, [100, 100], [1e9, 1e9]), true);
  assert.ok(
    Math.hypot(world.bodies.at(-1).vx, world.bodies.at(-1).vy) <= 300.000001,
  );
  for (const [start, end] of [
    [
      [NaN, 1],
      [1, 1],
    ],
    [
      [1, 1],
      [Infinity, 1],
    ],
    [
      [-1, 0],
      [1, 1],
    ],
  ])
    assert.equal(launch(world, start, end), false);
  while (addOrbiter(world));
  assert.equal(world.bodies.length, MAX_BODIES);
  assert.equal(launch(world, [100, 100], [140, 100]), false);
});

test("collisions and escaping bodies are removed safely in either star system", () => {
  for (const binary of [false, true]) {
    const world = createWorld({ ...defaultSettings(), binary });
    world.bodies[0].x = binary ? CX - 40 : CX;
    world.bodies[0].y = CY;
    world.bodies[1].x = CX + 2000;
    advance(world, 1 / 60);
    assert.equal(world.bodies.length, 2);
    for (let i = 0; i < 600; i++) advance(world, 1 / 60);
    assert.ok(
      world.bodies.every((b) => [b.x, b.y, b.vx, b.vy].every(Number.isFinite)),
    );
  }
});

test("restoring settings validates stored data and does not share defaults between universes", () => {
  for (const input of [
    null,
    [],
    42,
    { gravity: NaN, speed: Infinity, binary: 1, trails: "no" },
    { gravity: 100, speed: -1 },
  ])
    assert.deepEqual(restoreSettings(input), defaultSettings());
  const restored = restoreSettings({
    binary: true,
    gravity: 1.2,
    speed: 2.4,
    trails: false,
  });
  assert.equal(restored.binary, true);
  assert.equal(restored.trails, false);
  assert.ok(Math.abs(restored.gravity - 1.2) < 1e-10);
  assert.ok(Math.abs(restored.speed - 2.4) < 1e-10);
  const a = createWorld(),
    b = createWorld();
  a.bodies[0].trail.push([0, 0]);
  a.settings.gravity = 2;
  assert.equal(b.bodies[0].trail.length, 120);
  assert.equal(b.settings.gravity, 1);
});
