export type Kind = "text" | "rect" | "ellipse" | "image";
export interface Layer {
  id: string;
  name: string;
  kind: Kind;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  hidden: boolean;
  locked: boolean;
  fill: string;
  radius: number;
  text: string;
  fontSize: number;
  fontFamily: "sans" | "serif" | "mono";
  fontWeight: number;
  align: "left" | "center" | "right";
  lineHeight: number;
  src: string;
}
export interface Design {
  format: "mewvis-design";
  version: 1;
  title: string;
  width: number;
  height: number;
  background: string;
  layers: Layer[];
}
export const MAX_BYTES = 1024 * 1024;
export const isAssetPath = (value: unknown): value is string =>
  typeof value === "string" &&
  /^assets\/[a-zA-Z0-9-]{1,80}\.(png|webp|jpeg)$/.test(value);
export const families = {
  sans: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif',
  serif: '"Songti SC", "Noto Serif CJK SC", Georgia, serif',
  mono: '"SFMono-Regular", Consolas, monospace',
};
export const sizes = [
  { label: "横版介绍 · 16:9", width: 1920, height: 1080 },
  { label: "社交方图 · 1:1", width: 1200, height: 1200 },
  { label: "竖版海报 · 3:4", width: 1200, height: 1600 },
  { label: "手机封面 · 9:16", width: 1080, height: 1920 },
];
export function layer(kind: Kind, values: Partial<Layer> = {}): Layer {
  return {
    id: crypto.randomUUID(),
    name: { text: "文字", rect: "矩形", ellipse: "圆形", image: "图片" }[kind],
    kind,
    x: 160,
    y: 160,
    width: kind === "text" ? 720 : 320,
    height: kind === "text" ? 150 : 320,
    rotation: 0,
    opacity: 1,
    hidden: false,
    locked: false,
    fill: kind === "text" ? "#202b39" : "#e98a56",
    radius: 20,
    text: "写下你的想法",
    fontSize: 72,
    fontFamily: "sans",
    fontWeight: 700,
    align: "left",
    lineHeight: 1.3,
    src: "",
    ...values,
  };
}
const color = (value: unknown, fallback: string) =>
  typeof value === "string" && /^#[a-f0-9]{6}$/i.test(value) ? value : fallback;
const number = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
const text = (value: unknown, fallback: string, limit: number) =>
  typeof value === "string" ? value.slice(0, limit) : fallback;
export function restore(value: unknown): Design {
  if (!value || typeof value !== "object")
    throw new Error("设计文件内容无效。");
  const data = value as Partial<Design>;
  if (
    data.format !== "mewvis-design" ||
    data.version !== 1 ||
    !Array.isArray(data.layers) ||
    data.layers.length > 50
  )
    throw new Error("不支持的设计文件，最多包含 50 个图层。");
  const ids = new Set<string>();
  const layers = data.layers.map((item): Layer => {
    if (!item || !["text", "rect", "ellipse", "image"].includes(item.kind))
      throw new Error("图层类型无效。");
    if (
      typeof item.id !== "string" ||
      !/^[a-zA-Z0-9-]{1,64}$/.test(item.id) ||
      ids.has(item.id)
    )
      throw new Error("图层标识重复或无效。");
    ids.add(item.id);
    const src = item.src;
    if (item.kind === "image" && !isAssetPath(src))
      throw new Error("图片必须引用当前工作区 assets 目录中的素材文件。");
    return layer(item.kind, {
      id: item.id,
      name: text(item.name, "图层", 80),
      x: number(item.x, 0, -4800, 4800),
      y: number(item.y, 0, -4800, 4800),
      width: number(item.width, 320, 1, 4800),
      height: number(item.height, 160, 1, 4800),
      rotation: number(item.rotation, 0, -360, 360),
      opacity: number(item.opacity, 1, 0, 1),
      hidden: item.hidden === true,
      locked: item.locked === true,
      fill: color(item.fill, "#202b39"),
      radius: number(item.radius, 0, 0, 2400),
      text: text(item.text, "", 3000),
      fontSize: number(item.fontSize, 72, 8, 400),
      fontFamily: ["sans", "serif", "mono"].includes(item.fontFamily)
        ? item.fontFamily
        : "sans",
      fontWeight: item.fontWeight === 400 ? 400 : 700,
      align: ["left", "center", "right"].includes(item.align)
        ? item.align
        : "left",
      lineHeight: number(item.lineHeight, 1.3, 0.8, 3),
      src: item.kind === "image" ? src : "",
    });
  });
  const design: Design = {
    format: "mewvis-design",
    version: 1,
    title: text(data.title, "未命名设计", 80),
    width: number(data.width, 1920, 320, 2400),
    height: number(data.height, 1080, 320, 2400),
    background: color(data.background, "#faf8f4"),
    layers,
  };
  if (new TextEncoder().encode(JSON.stringify(design)).length > MAX_BYTES)
    throw new Error("设计内容超过 1 MiB，请减少文字或图层后重试。");
  return design;
}
export function hitTest(
  design: Design,
  x: number,
  y: number,
): Layer | undefined {
  return [...design.layers].reverse().find((item) => {
    if (item.hidden || item.locked) return false;
    const angle = (-item.rotation * Math.PI) / 180;
    const dx = x - item.x - item.width / 2,
      dy = y - item.y - item.height / 2;
    return (
      Math.abs(dx * Math.cos(angle) - dy * Math.sin(angle)) <= item.width / 2 &&
      Math.abs(dx * Math.sin(angle) + dy * Math.cos(angle)) <= item.height / 2
    );
  });
}
export function fitSize(width: number, height: number, longEdge = 3840) {
  const ratio = longEdge / Math.max(width, height);
  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
  };
}
export function template(
  kind: "blank" | "intro" | "event" | "mewvis",
  art = "",
): Design {
  const design: Design = {
    format: "mewvis-design",
    version: 1,
    title: "未命名设计",
    width: 1920,
    height: 1080,
    background: "#faf8f4",
    layers: [],
  };
  if (kind === "blank") return design;
  if (kind === "event")
    return {
      ...design,
      title: "活动海报",
      width: 1200,
      height: 1600,
      background: "#223a34",
      layers: [
        layer("ellipse", {
          x: 610,
          y: -120,
          width: 850,
          height: 850,
          fill: "#c6dc8a",
          name: "装饰圆",
        }),
        layer("text", {
          x: 100,
          y: 150,
          width: 900,
          height: 80,
          fontSize: 30,
          fill: "#c6dc8a",
          text: "CREATE SOMETHING TOGETHER",
          name: "活动标签",
        }),
        layer("text", {
          x: 100,
          y: 700,
          width: 1000,
          height: 390,
          fontSize: 138,
          fill: "#faf8ed",
          text: "灵感碰面\n好事发生",
          fontFamily: "serif",
          name: "活动标题",
        }),
        layer("rect", {
          x: 100,
          y: 1220,
          width: 1000,
          height: 2,
          fill: "#8da99a",
          radius: 0,
        }),
        layer("text", {
          x: 100,
          y: 1280,
          width: 900,
          height: 180,
          fontSize: 36,
          fontWeight: 400,
          fill: "#e1e9dd",
          text: "写下活动时间与地点\n为你的下一次相聚设计一张海报。",
          name: "活动信息",
        }),
      ],
    };
  if (kind === "mewvis")
    return {
      ...design,
      title: "Mewvis 项目介绍",
      layers: [
        layer("text", {
          x: 130,
          y: 100,
          width: 900,
          height: 100,
          fontSize: 42,
          text: "喵维斯 Mewvis",
          name: "项目名称",
        }),
        layer("text", {
          x: 130,
          y: 300,
          width: 960,
          height: 260,
          fontSize: 92,
          fontFamily: "serif",
          text: "基础已就绪。\n应用，由你定义。",
          name: "主标题",
        }),
        layer("text", {
          x: 130,
          y: 610,
          width: 750,
          height: 130,
          fontSize: 32,
          fontWeight: 400,
          text: "开源 AI 应用开发与运行平台\n复用模型、Agent、会话与数据能力。",
          name: "项目说明",
        }),
        ...(art
          ? [
              layer("image", {
                x: 860,
                y: 260,
                width: 1020,
                height: 510,
                src: art,
                name: "猫咪基座插画",
              }),
            ]
          : []),
        layer("rect", {
          x: 130,
          y: 850,
          width: 1660,
          height: 2,
          radius: 0,
          fill: "#c6cecd",
        }),
        layer("text", {
          x: 130,
          y: 900,
          width: 1650,
          height: 120,
          fontSize: 28,
          fontWeight: 400,
          text: "应用 SDK · 设计界面与业务流程     插件 SDK · 扩展共用能力\n源码示例供参考与改造；AI 功能需配置模型服务。",
          name: "SDK 说明",
        }),
      ],
    };
  return {
    ...design,
    title: "我的第一张设计",
    layers: [
      layer("ellipse", {
        x: 1190,
        y: 130,
        width: 850,
        height: 850,
        fill: "#e9926b",
        name: "暖橙圆形",
      }),
      layer("rect", {
        x: 1320,
        y: 440,
        width: 360,
        height: 360,
        fill: "#f5d6a6",
        rotation: -14,
        radius: 36,
        name: "奶油色块",
      }),
      layer("text", {
        x: 130,
        y: 130,
        width: 900,
        height: 90,
        fontSize: 30,
        text: "一个想法，值得被看见。",
        name: "引言",
      }),
      layer("text", {
        x: 125,
        y: 330,
        width: 1150,
        height: 300,
        fontSize: 116,
        fontFamily: "serif",
        text: "把想法，\n变成画面。",
        name: "主标题",
      }),
      layer("text", {
        x: 135,
        y: 755,
        width: 900,
        height: 160,
        fontSize: 34,
        fontWeight: 400,
        text: "从文字、形状和图片开始。\n自由排版，做出属于你的设计。",
        name: "说明",
      }),
    ],
  };
}
