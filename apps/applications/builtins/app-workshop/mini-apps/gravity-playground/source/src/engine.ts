export const WIDTH = 980,
  HEIGHT = 700;
export const CX = WIDTH / 2,
  CY = HEIGHT / 2;
export const MAX_BODIES = 32;
export const COLORS = [
  "#73e8ff",
  "#b9a0ff",
  "#ffba7b",
  "#ff88bd",
  "#92efc1",
  "#8faaff",
];
export type Point = [number, number];
export type Settings = {
  binary: boolean;
  gravity: number;
  speed: number;
  trails: boolean;
};
export type Body = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: string;
  name: string;
  trail: Point[];
};
export type World = {
  bodies: Body[];
  paused: boolean;
  settings: Settings;
  serial: number;
};
export type Aim = { start: Point; end: Point };
const MU = 260000;
export const defaultSettings = (): Settings => ({
  binary: false,
  gravity: 1,
  speed: 1,
  trails: true,
});
export function restoreSettings(value: unknown): Settings {
  const fallback = defaultSettings();
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fallback;
  const s = value as Record<string, unknown>;
  const number = (
    v: unknown,
    min: number,
    max: number,
    step: number,
    initial: number,
  ) =>
    typeof v === "number" && Number.isFinite(v) && v >= min && v <= max
      ? Math.round(v / step) * step
      : initial;
  return {
    binary: typeof s.binary === "boolean" ? s.binary : fallback.binary,
    trails: typeof s.trails === "boolean" ? s.trails : fallback.trails,
    gravity: number(s.gravity, 0.3, 2, 0.1, 1),
    speed: number(s.speed, 0.2, 3, 0.2, 1),
  };
}
export function orbit(
  radius: number,
  angle: number,
  color: string,
  name: string,
  size: number,
): Body {
  return {
    x: CX + Math.cos(angle) * radius,
    y: CY + Math.sin(angle) * radius,
    vx: -Math.sin(angle) * Math.sqrt(MU / radius),
    vy: Math.cos(angle) * Math.sqrt(MU / radius),
    r: size,
    color,
    name,
    trail: Array.from({ length: 120 }, (_, i) => {
      const a = angle - (119 - i) * 0.015;
      return [CX + Math.cos(a) * radius, CY + Math.sin(a) * radius];
    }),
  };
}
export function createWorld(settings = defaultSettings()): World {
  return {
    bodies: [
      orbit(116, -1, COLORS[0], "薄荷", 6),
      orbit(191, 2.7, COLORS[1], "鸢尾", 8),
      orbit(274, -0.3, COLORS[2], "橘子", 10),
      orbit(310, 1.65, COLORS[3], "莓果", 7),
    ],
    paused: false,
    settings: { ...settings },
    serial: 4,
  };
}
// Stars are fixed attractors. This is a playful 2D model, not an astronomy simulator.
export const suns = (binary: boolean) =>
  binary
    ? [
        { x: CX - 40, y: CY, m: 0.6, r: 19, color: "#ffca70" },
        { x: CX + 45, y: CY, m: 0.4, r: 14, color: "#91beff" },
      ]
    : [{ x: CX, y: CY, m: 1, r: 25, color: "#ffd684" }];
export function addOrbiter(world: World): boolean {
  if (world.bodies.length >= MAX_BODIES) return false;
  const s = ++world.serial;
  world.bodies.push(
    orbit(
      150 + (s % 4) * 43,
      s * 1.8,
      COLORS[s % COLORS.length],
      `旅人 ${s - 3}`,
      5 + (s % 4),
    ),
  );
  return true;
}
export function launch(world: World, start: Point, end: Point): boolean {
  if (
    world.bodies.length >= MAX_BODIES ||
    ![...start, ...end].every(Number.isFinite)
  )
    return false;
  if (start[0] < 0 || start[0] > WIDTH || start[1] < 0 || start[1] > HEIGHT)
    return false;
  const s = ++world.serial,
    dx = (end[0] - start[0]) * 0.65,
    dy = (end[1] - start[1]) * 0.65;
  const scale = Math.min(1, 300 / Math.max(1, Math.hypot(dx, dy)));
  world.bodies.push({
    x: start[0],
    y: start[1],
    vx: dx * scale,
    vy: dy * scale,
    r: 6,
    color: COLORS[s % COLORS.length],
    name: `旅人 ${s - 3}`,
    trail: [],
  });
  return true;
}
export function advance(world: World, elapsed: number): void {
  if (world.paused || !Number.isFinite(elapsed) || elapsed <= 0) return;
  // Ignore time spent in a background tab and substep fast motion near stars.
  const time = Math.min(elapsed, 0.05) * world.settings.speed,
    steps = Math.ceil(time / (1 / 120)),
    dt = time / steps;
  const stars = suns(world.settings.binary);
  for (let step = 0; step < steps; step++)
    for (let i = world.bodies.length - 1; i >= 0; i--) {
      const b = world.bodies[i];
      let consumed = false;
      for (const s of stars) {
        const dx = s.x - b.x,
          dy = s.y - b.y,
          d = Math.hypot(dx, dy);
        if (d < s.r + b.r * 0.5) {
          consumed = true;
          break;
        }
        const a =
          (MU * world.settings.gravity * s.m) / Math.max(d * d * d, 1200);
        b.vx += dx * a * dt;
        b.vy += dy * a * dt;
      }
      if (consumed) {
        world.bodies.splice(i, 1);
        continue;
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (
        Math.abs(b.x - CX) > 1400 ||
        Math.abs(b.y - CY) > 1200 ||
        ![b.x, b.y, b.vx, b.vy].every(Number.isFinite)
      )
        world.bodies.splice(i, 1);
    }
  for (const b of world.bodies) {
    b.trail.push([b.x, b.y]);
    if (b.trail.length > 230) b.trail.shift();
  }
}
