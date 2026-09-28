import {
  CATS,
  chooseNextActivity,
  createCatState,
  pointFor,
  routeFor,
  stepToward,
  type CatState,
  type Activity,
  type ActivityContext,
  type Journey,
  type Point,
} from "./office-model.ts";

export type OfficeWorld = {
  states: Record<string, CatState>;
  positions: Record<string, Point>;
  journeys: Record<string, Journey>;
  pending: Record<string, CatState>;
  directions: Record<string, boolean>;
  revision: number;
};

function occupiedChoices(
  states: Record<string, CatState>,
  journeys: Record<string, Journey>,
  pending: Record<string, CatState>,
  except: string,
): ActivityContext {
  const occupiedActivities = new Set<Activity>();
  for (const [id, state] of Object.entries(states)) {
    if (id === except) continue;
    const journey = journeys[id],
      queued = pending[id];
    if (state.place === "desk") occupiedActivities.add(state.activity);
    if (journey?.destination.place === "desk") occupiedActivities.add(journey.destination.activity);
    if (queued?.place === "desk") occupiedActivities.add(queued.activity);
  }
  return { occupiedActivities };
}

export function createOffice(random = Math.random): OfficeWorld {
  const states: Record<string, CatState> = {};
  for (const cat of CATS) {
    const state = createCatState(
      chooseNextActivity(cat, undefined, random, occupiedChoices(states, {}, {}, cat.id)),
      random,
    );
    state.elapsedMs = state.durationMs * random() * 0.55;
    states[cat.id] = state;
  }
  return {
    states,
    positions: Object.fromEntries(CATS.map((cat) => [cat.id, pointFor(cat, states[cat.id])])),
    journeys: {},
    pending: {},
    directions: {},
    revision: 0,
  };
}

// Activity choices are made once, then queued. A shared aisle carries one cat
// at a time; waiting for the aisle must not repeatedly reroll a cat's choice.
export function advanceOffice(
  world: OfficeWorld,
  deltaMs: number,
  random = Math.random,
  reducedMotion = false,
): OfficeWorld {
  if (deltaMs <= 0) return world;
  const states = { ...world.states },
    positions = { ...world.positions },
    journeys = { ...world.journeys },
    pending = { ...world.pending },
    directions = { ...world.directions };
  let revision = world.revision;
  const moved = new Set(Object.keys(journeys));
  for (const [id, original] of Object.entries(journeys)) {
    if (reducedMotion) {
      states[id] = original.destination;
      positions[id] = original.points[original.points.length - 1];
      delete journeys[id];
      revision++;
      continue;
    }
    let journey = { ...original },
      distance = (deltaMs / 1000) * 135;
    while (distance > 0) {
      const from = positions[id],
        target = journey.points[journey.index];
      if (target.x !== from.x) directions[id] = target.x < from.x;
      const segment = Math.hypot(target.x - from.x, target.y - from.y);
      const step = stepToward(from, target, distance);
      positions[id] = step.point;
      if (!step.arrived) break;
      distance -= segment;
      if (journey.index + 1 === journey.points.length) {
        states[id] = journey.destination;
        delete journeys[id];
        revision++;
        break;
      }
      journey.index++;
    }
    if (journeys[id]) journeys[id] = journey;
  }
  for (const cat of CATS) {
    const id = cat.id;
    if (moved.has(id) || pending[id]) continue;
    const current = states[id];
    states[id] = { ...current, elapsedMs: Math.min(current.durationMs, current.elapsedMs + deltaMs) };
    if (states[id].elapsedMs < current.durationMs) continue;
    const next = createCatState(
      chooseNextActivity(cat, current, random, occupiedChoices(states, journeys, pending, id)),
      random,
      [current.activity, ...current.recent].slice(0, 4),
    );
    if (next.place === current.place || reducedMotion) {
      states[id] = next;
      positions[id] = pointFor(cat, next);
      revision++;
    } else pending[id] = next;
  }
  if (reducedMotion) {
    for (const [id, destination] of Object.entries(pending)) {
      states[id] = destination;
      positions[id] = pointFor(
        CATS.find((cat) => cat.id === id)!,
        destination,
      );
      delete pending[id];
      revision++;
    }
  } else if (!Object.keys(journeys).length) {
    const id = Object.keys(pending)[0];
    if (id) {
      const cat = CATS.find((cat) => cat.id === id)!,
        destination = pending[id];
      journeys[id] = { points: routeFor(cat, states[id], destination), index: 1, destination };
      delete pending[id];
      revision++;
    }
  }
  return { states, positions, journeys, pending, directions, revision };
}
