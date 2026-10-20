import {
  WIDTH as W,
  HEIGHT as H,
  CX,
  CY,
  suns as attractors,
  type World,
  type Aim,
} from "./engine";
const stars = Array.from({ length: 170 }, (_, i) => ({
  x: ((((Math.sin(i * 97.41) * 43758.5453) % 1) + 1) % 1) * W,
  y: ((((Math.cos(i * 43.17) * 15648.371) % 1) + 1) % 1) * H,
  r: i % 11 === 0 ? 1.5 : 0.65,
}));

export function render(
  ctx: CanvasRenderingContext2D,
  world: World,
  aim: Aim | null,
) {
  const suns = attractors(world.settings.binary);
  ctx.clearRect(0, 0, W, H);
  const bg = ctx.createRadialGradient(CX, CY, 0, CX, CY, 550);
  bg.addColorStop(0, "#18243f");
  bg.addColorStop(1, "#0b1223");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  for (const s of stars) {
    ctx.fillStyle = `rgba(211,225,255,${s.r > 1 ? 0.68 : 0.35})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = "#b5cbff13";
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 8]);
  for (const r of [116, 191, 274, 310]) {
    ctx.beginPath();
    ctx.arc(CX, CY, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  for (const b of world.bodies) {
    if (world.settings.trails && b.trail.length > 1) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = b.color + "80";
      ctx.beginPath();
      b.trail.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }
    const glow = ctx.createRadialGradient(b.x, b.y, 1, b.x, b.y, b.r * 4);
    glow.addColorStop(0, b.color + "65");
    glow.addColorStop(1, b.color + "00");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r * 4, 0, 7);
    ctx.fill();
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, 7);
    ctx.fill();
    ctx.fillStyle = "#f5f7ffb0";
    ctx.font = "15px system-ui";
    ctx.fillText(b.name, b.x + b.r + 9, b.y + 5);
  }
  for (const s of suns) {
    const glow = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 100);
    glow.addColorStop(0, s.color + "55");
    glow.addColorStop(1, s.color + "00");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 100, 0, 7);
    ctx.fill();
    const light = ctx.createRadialGradient(s.x - 7, s.y - 7, 1, s.x, s.y, s.r);
    light.addColorStop(0, "#fff7d7");
    light.addColorStop(1, s.color);
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, 7);
    ctx.fill();
  }
  if (aim) {
    ctx.strokeStyle = "#f0f4ff";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(...aim.start);
    ctx.lineTo(...aim.end);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(...aim.start, 5, 0, 7);
    ctx.fill();
  }
}
