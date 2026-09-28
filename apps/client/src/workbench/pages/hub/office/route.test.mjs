import assert from "node:assert/strict";
import { CATS, deskPoint, loungePoint, routeFor, stepToward } from "./office-model.ts";

// Measured tabletop footprints in the scene's 1440 × 672 coordinate space.
const tables = [560, 827, 1117].flatMap((x) => [
  { left: x, right: x + 225, top: 130, bottom: 264 },
  { left: x, right: x + 225, top: 378, bottom: 514 },
]);
function crosses(a, b, rect) {
  if (a.x === b.x)
    return a.x > rect.left && a.x < rect.right && Math.max(a.y, b.y) > rect.top && Math.min(a.y, b.y) < rect.bottom;
  return a.y > rect.top && a.y < rect.bottom && Math.max(a.x, b.x) > rect.left && Math.min(a.x, b.x) < rect.right;
}
for (const cat of CATS) {
  const desk = { mode: "leisure", activity: "cartoon", place: "desk" };
  const lounge = { mode: "idle", activity: "standby", place: "lounge" };
  const outbound = routeFor(cat, desk, lounge);
  assert.deepEqual(outbound[0], deskPoint(cat));
  assert.deepEqual(outbound.at(-1), loungePoint(cat));
  assert.deepEqual(routeFor(cat, lounge, desk), [...outbound].reverse());
  assert.deepEqual(routeFor(cat, desk, { ...desk, activity: "movie" }), []);
  for (let i = 1; i < outbound.length; i++) {
    const a = outbound[i - 1],
      b = outbound[i];
    assert.ok(a.x === b.x || a.y === b.y, `${cat.id}: diagonal segment`);
    for (const table of tables) assert.ok(!crosses(a, b, table), `${cat.id}: route crosses a desk`);
  }
}
const start = { x: 0, y: 0 },
  end = { x: 100, y: 0 };
assert.deepEqual(stepToward(start, end, 0), { point: start, arrived: false });
assert.deepEqual(stepToward(start, end, 25), { point: { x: 25, y: 0 }, arrived: false });
assert.deepEqual(stepToward(start, end, 150), { point: end, arrived: true });
console.log("Passed: all six routes avoid desktops; reverse routes, same-place changes and paused/overshoot movement.");
