import assert from "node:assert/strict";
import {
  ACTIVITY_POOL,
  ACTIVITIES,
  CATS,
  chooseNextActivity,
  createCatState,
  favoriteActivities,
  pointFor,
} from "./office-model.ts";
import { advanceOffice, createOffice } from "./office-simulation.ts";

function seeded(seed) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}
assert.equal(ACTIVITY_POOL.length, 20);
assert.ok(!ACTIVITY_POOL.includes("standby"));
for (const cat of CATS) {
  const random = seeded(cat.col + 104),
    counts = Object.fromEntries(ACTIVITY_POOL.map((id) => [id, 0]));
  for (let i = 0; i < 20000; i++) counts[chooseNextActivity(cat, undefined, random)]++;
  assert.ok(
    Object.values(counts).every((count) => count > 0),
    `${cat.id}: a choice is unreachable`,
  );
  const favorite = favoriteActivities(cat)[0];
  for (const id of ACTIVITY_POOL.filter((id) => !cat.preferences[id])) {
    assert.ok(counts[favorite] > counts[id] * 3, `${cat.id}: preference has no practical effect`);
  }
  const current = createCatState(favorite, random);
  for (let i = 0; i < 200; i++) assert.notEqual(chooseNextActivity(cat, current, random), favorite);
}

const random = seeded(9042);
let world = createOffice(random);
const visited = new Set(Object.values(world.states).map((state) => state.activity));
assert.equal(
  advanceOffice(world, 0, () => {
    throw new Error("paused simulation consumed randomness");
  }),
  world,
);
const original = JSON.stringify(world);
advanceOffice(world, 500, random);
assert.equal(JSON.stringify(world), original, "advance mutates an earlier snapshot");
let walks = 0,
  arrivals = 0,
  walkingWorld,
  queuedWorld;
for (let tick = 0; tick < 7200; tick++) {
  const previous = world;
  world = advanceOffice(world, 500, random);
  assert.ok(Object.keys(world.journeys).length <= 1, "two cats enter the shared aisle together");
  if (Object.keys(world.journeys).length) walkingWorld ??= world;
  if (Object.keys(world.pending).length) queuedWorld ??= world;
  for (const cat of CATS) {
    const state = world.states[cat.id],
      definition = ACTIVITIES[state.activity];
    visited.add(state.activity);
    assert.equal(state.mode, definition.mode);
    assert.equal(state.place, definition.place);
    assert.ok(state.elapsedMs >= 0 && state.elapsedMs <= state.durationMs);
    assert.ok(state.recent.length <= 4);
    if (!world.journeys[cat.id]) assert.deepEqual(world.positions[cat.id], pointFor(cat, state));
    if (previous.states[cat.id].activity !== state.activity)
      assert.equal(state.recent[0], previous.states[cat.id].activity);
    if (!previous.journeys[cat.id] && world.journeys[cat.id]) walks++;
    if (previous.journeys[cat.id] && !world.journeys[cat.id]) arrivals++;
    if (previous.pending[cat.id] && world.pending[cat.id])
      assert.equal(world.pending[cat.id], previous.pending[cat.id], "queued activity was rerolled");
  }
}
assert.equal(visited.size, 20, "a simulated hour failed to reach every activity category");
assert.ok(walks > 10 && arrivals > 10, "cats never autonomously leave/return to their seats");
assert.ok(walkingWorld && queuedWorld, "movement and aisle waiting were not exercised");
for (const active of [walkingWorld, queuedWorld]) {
  const reduced = advanceOffice(active, 500, random, true);
  assert.equal(Object.keys(reduced.journeys).length, 0);
  assert.equal(Object.keys(reduced.pending).length, 0);
  for (const cat of CATS) assert.deepEqual(reduced.positions[cat.id], pointFor(cat, reduced.states[cat.id]));
}
console.log(
  `Passed: 20 activities, six distinct preferences, no immediate repeats, autonomous journeys (${walks} departures / ${arrivals} arrivals), pause, immutable snapshots and reduced motion.`,
);
