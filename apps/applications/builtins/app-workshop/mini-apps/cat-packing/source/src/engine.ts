export type Cell = readonly [number, number];
export const SHAPES = {
  ginger: [
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 0],
  ],
  cream: [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ],
  slate: [
    [0, 0],
    [0, 1],
    [0, 2],
    [1, 2],
    [2, 2],
  ],
  lilac: [
    [0, 0],
    [1, 0],
  ],
  peach: [
    [0, 0],
    [0, 1],
    [1, 1],
  ],
  gray: [
    [0, 0],
    [1, 0],
  ],
} satisfies Record<string, Cell[]>;
export type Kind = keyof typeof SHAPES;
export type Piece = { id: string; kind: Kind; name: string };
export type Pose = { x: number; y: number; rotation: number };
export type Placements = Record<string, Pose>;
export type Level = {
  id: number;
  name: string;
  cols: number;
  rows: number;
  pieces: Piece[];
  blocked?: Cell[];
  note: string;
};

export function shape(kind: Kind, rotation = 0): Cell[] {
  let cells: Cell[] = SHAPES[kind];
  for (let i = 0; i < ((rotation % 4) + 4) % 4; i++) {
    const height = Math.max(...cells.map((c) => c[1])) + 1;
    cells = cells.map(([x, y]) => [height - 1 - y, x]);
  }
  return cells;
}
export function bounds(cells: Cell[]) {
  return {
    width: Math.max(...cells.map((c) => c[0])) + 1,
    height: Math.max(...cells.map((c) => c[1])) + 1,
  };
}
export function occupied(
  level: Level,
  placements: Placements,
  except?: string,
): Set<string> {
  const cells = new Set((level.blocked ?? []).map(([x, y]) => x + "," + y));
  for (const piece of level.pieces) {
    const pose = placements[piece.id];
    if (pose && piece.id !== except)
      for (const [x, y] of shape(piece.kind, pose.rotation))
        cells.add(x + pose.x + "," + (y + pose.y));
  }
  return cells;
}
export function canPlace(
  level: Level,
  placements: Placements,
  id: string,
  pose: Pose,
): boolean {
  const piece = level.pieces.find((p) => p.id === id);
  if (
    !piece ||
    !Number.isInteger(pose.x) ||
    !Number.isInteger(pose.y) ||
    !Number.isInteger(pose.rotation) ||
    pose.rotation < 0 ||
    pose.rotation > 3
  )
    return false;
  const taken = occupied(level, placements, id);
  return shape(piece.kind, pose.rotation).every(([dx, dy]) => {
    const x = pose.x + dx,
      y = pose.y + dy;
    return (
      x >= 0 &&
      y >= 0 &&
      x < level.cols &&
      y < level.rows &&
      !taken.has(x + "," + y)
    );
  });
}
export function place(
  level: Level,
  placements: Placements,
  id: string,
  pose: Pose,
): Placements | null {
  return canPlace(level, placements, id, pose)
    ? { ...placements, [id]: { ...pose } }
    : null;
}
export function isSolved(level: Level, placements: Placements): boolean {
  if (Object.keys(placements).length !== level.pieces.length) return false;
  return (
    level.pieces.every(
      (p) =>
        placements[p.id] && canPlace(level, placements, p.id, placements[p.id]),
    ) && occupied(level, placements).size === level.cols * level.rows
  );
}

type Candidate = { id: string; pose: Pose; mask: bigint };
type Search =
  | { status: "solved"; placements: Placements; visited: number }
  | { status: "impossible" | "limit"; visited: number };
const candidateCache = new WeakMap<Level, Candidate[]>();
function candidates(level: Level): Candidate[] {
  const cached = candidateCache.get(level);
  if (cached) return cached;
  const all: Candidate[] = [];
  for (const p of level.pieces) {
    const seen = new Set<string>();
    for (let rotation = 0; rotation < 4; rotation++) {
      const cells = shape(p.kind, rotation);
      const key = cells
        .map(([x, y]) => x + "," + y)
        .sort()
        .join(";");
      if (seen.has(key)) continue;
      seen.add(key);
      const { width, height } = bounds(cells);
      for (let y = 0; y <= level.rows - height; y++)
        for (let x = 0; x <= level.cols - width; x++) {
          const pose = { x, y, rotation };
          if (!canPlace(level, {}, p.id, pose)) continue;
          let mask = 0n;
          for (const [dx, dy] of cells)
            mask |= 1n << BigInt((y + dy) * level.cols + x + dx);
          all.push({ id: p.id, pose, mask });
        }
    }
  }
  candidateCache.set(level, all);
  return all;
}

// Exact cover: choose the most-constrained empty square, with memoized dead ends.
// BigInt masks allow later chapters to exceed 32 cells without changing the rules.
export function solve(
  level: Level,
  placements: Placements = {},
  budget = 120000,
): Search {
  if (
    Object.keys(placements).some(
      (id) => !level.pieces.some((p) => p.id === id),
    ) ||
    Object.entries(placements).some(
      ([id, pose]) => !canPlace(level, placements, id, pose),
    )
  )
    return { status: "impossible", visited: 0 };
  let initial = 0n;
  for (const cell of occupied(level, placements)) {
    const [x, y] = cell.split(",").map(Number);
    initial |= 1n << BigInt(y * level.cols + x);
  }
  const full = (1n << BigInt(level.cols * level.rows)) - 1n;
  const all = candidates(level),
    dead = new Set<string>();
  let visited = 0,
    limited = false;
  function search(
    mask: bigint,
    remaining: string[],
    result: Placements,
  ): Placements | null {
    if (++visited > budget) {
      limited = true;
      return null;
    }
    if (!remaining.length) return mask === full ? result : null;
    const key = mask.toString(36) + ":" + remaining.join(",");
    if (dead.has(key)) return null;
    const available = all.filter(
      (c) => remaining.includes(c.id) && !(mask & c.mask),
    );
    let best: Candidate[] | undefined;
    for (let i = 0; i < level.cols * level.rows; i++) {
      const bit = 1n << BigInt(i);
      if (mask & bit) continue;
      const choices = available.filter((c) => c.mask & bit);
      if (!choices.length) {
        dead.add(key);
        return null;
      }
      if (!best || choices.length < best.length) best = choices;
    }
    for (const c of best ?? []) {
      const found = search(
        mask | c.mask,
        remaining.filter((id) => id !== c.id),
        { ...result, [c.id]: c.pose },
      );
      if (found) return found;
      if (limited) return null;
    }
    dead.add(key);
    return null;
  }
  const solution = search(
    initial,
    level.pieces.filter((p) => !placements[p.id]).map((p) => p.id),
    { ...placements },
  );
  return solution
    ? { status: "solved", placements: solution, visited }
    : { status: limited ? "limit" : "impossible", visited };
}
export type Hint =
  | { kind: "place"; id: string; pose: Pose }
  | { kind: "remove"; id: string }
  | { kind: "done" | "busy" };
export function hint(
  level: Level,
  placements: Placements,
  preferred?: string,
): Hint {
  if (isSolved(level, placements)) return { kind: "done" };
  const result = solve(level, placements);
  if (result.status === "limit") return { kind: "busy" };
  if (result.status === "solved") {
    const id =
      (preferred && !placements[preferred] ? preferred : null) ??
      level.pieces.find((p) => !placements[p.id])!.id;
    return { kind: "place", id, pose: result.placements[id] };
  }
  // Prefer a single repair to clearing a player's whole board.
  for (const id of Object.keys(placements).reverse()) {
    const rest = { ...placements };
    delete rest[id];
    if (solve(level, rest, 16000).status === "solved")
      return { kind: "remove", id };
  }
  const baseline = solve(level);
  if (baseline.status !== "solved") return { kind: "busy" };
  const id = Object.keys(placements).find((id) => {
    const a = placements[id],
      b = baseline.placements[id];
    return a.x !== b.x || a.y !== b.y || a.rotation !== b.rotation;
  });
  return id ? { kind: "remove", id } : { kind: "busy" };
}
