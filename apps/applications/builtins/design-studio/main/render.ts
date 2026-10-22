import type { Design } from "./model";

// Self-contained so an exported HTML uses this exact renderer without a CDN.
export async function renderDesign(
  canvas: HTMLCanvasElement,
  design: Design,
  width = design.width,
  height = design.height,
  sources: Record<string, string> = {},
) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("当前环境不能绘制画布。");
  ctx.scale(width / design.width, height / design.height);
  ctx.fillStyle = design.background;
  ctx.fillRect(0, 0, design.width, design.height);
  const fonts = {
    sans: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif',
    serif: '"Songti SC", "Noto Serif CJK SC", Georgia, serif',
    mono: '"SFMono-Regular", Consolas, monospace',
  };
  for (const item of design.layers) {
    if (item.hidden) continue;
    ctx.save();
    try {
      ctx.globalAlpha = item.opacity;
      ctx.translate(item.x + item.width / 2, item.y + item.height / 2);
      ctx.rotate((item.rotation * Math.PI) / 180);
      ctx.translate(-item.width / 2, -item.height / 2);
      ctx.fillStyle = item.fill;
      if (item.kind === "rect") {
        ctx.beginPath();
        ctx.roundRect(
          0,
          0,
          item.width,
          item.height,
          Math.min(item.radius, item.width / 2, item.height / 2),
        );
        ctx.fill();
      } else if (item.kind === "ellipse") {
        ctx.beginPath();
        ctx.ellipse(
          item.width / 2,
          item.height / 2,
          item.width / 2,
          item.height / 2,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      } else if (item.kind === "image") {
        const image = new Image();
        const src = sources[item.src];
        if (!src) throw new Error(`图片素材无法载入：${item.name}`);
        image.src = src;
        await image.decode();
        const scale = Math.min(
          item.width / image.width,
          item.height / image.height,
        );
        const w = image.width * scale,
          h = image.height * scale;
        ctx.drawImage(image, (item.width - w) / 2, (item.height - h) / 2, w, h);
      } else {
        ctx.beginPath();
        ctx.rect(0, 0, item.width, item.height);
        ctx.clip();
        ctx.font = `${item.fontWeight} ${item.fontSize}px ${fonts[item.fontFamily]}`;
        ctx.textBaseline = "top";
        ctx.textAlign = item.align;
        const lines: string[] = [];
        for (const paragraph of item.text.split("\n")) {
          let line = "";
          for (const char of paragraph) {
            if (line && ctx.measureText(line + char).width > item.width) {
              lines.push(line);
              line = char;
            } else line += char;
          }
          lines.push(line);
        }
        const x =
          item.align === "left"
            ? 0
            : item.align === "center"
              ? item.width / 2
              : item.width;
        lines.forEach((line, index) =>
          ctx.fillText(line, x, index * item.fontSize * item.lineHeight),
        );
      }
    } finally {
      ctx.restore();
    }
  }
}

export function htmlDocument(
  design: Design,
  sources: Record<string, string> = {},
) {
  const title = design.title.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
  const json = JSON.stringify({ design, sources }).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{margin:0;background:#ecece8;min-height:100vh;display:grid;place-items:center}canvas{display:block;max-width:100vw;max-height:100vh;object-fit:contain}</style></head><body><canvas aria-label="${title}"></canvas><script id="design-data" type="application/json">${json}</script><script>const render=${renderDesign.toString()};const {design,sources}=JSON.parse(document.getElementById('design-data').textContent);render(document.querySelector('canvas'),design,design.width,design.height,sources).catch(error=>{document.body.textContent=error.message});</script></body></html>`;
}
