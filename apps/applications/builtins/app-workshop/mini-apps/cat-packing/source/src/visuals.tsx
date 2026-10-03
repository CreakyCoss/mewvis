import type { CSSProperties, ReactNode } from "react";
import { art } from "./art";
import { icons } from "./icons";
import {
  bounds,
  shape,
  type Cell,
  type Kind,
  type Level,
  type Placements,
} from "./engine";

export function Icon({
  name,
  className = "",
}: {
  name: keyof typeof icons;
  className?: string;
}) {
  return (
    <img
      className={"icon " + className}
      src={icons[name]}
      alt=""
      draggable={false}
    />
  );
}
// A polyomino's interactive hit area follows its occupied cells, including empty L corners.
export function silhouette(cells: Cell[]) {
  const { width, height } = bounds(cells);
  const filled = new Set(cells.map(([x, y]) => x + "," + y));
  const edges = new Map<string, Cell>();
  for (const [x, y] of cells) {
    if (!filled.has(x + "," + (y - 1))) edges.set(x + "," + y, [x + 1, y]);
    if (!filled.has(x + 1 + "," + y))
      edges.set(x + 1 + "," + y, [x + 1, y + 1]);
    if (!filled.has(x + "," + (y + 1)))
      edges.set(x + 1 + "," + (y + 1), [x, y + 1]);
    if (!filled.has(x - 1 + "," + y)) edges.set(x + "," + (y + 1), [x, y]);
  }
  const start = edges.keys().next().value!;
  let key = start;
  const points: string[] = [];
  do {
    const [x, y] = key.split(",").map(Number);
    points.push((x / width) * 100 + "% " + (y / height) * 100 + "%");
    const next = edges.get(key)!;
    key = next[0] + "," + next[1];
  } while (key !== start && points.length <= 40);
  return "polygon(" + points.join(",") + ")";
}
export function CatArt({
  kind,
  rotation = 0,
}: {
  kind: Kind;
  rotation?: number;
}) {
  const base = bounds(shape(kind)),
    turned = bounds(shape(kind, rotation));
  return (
    <img
      className="cat-art"
      src={art[kind]}
      alt=""
      draggable={false}
      style={{
        width: (base.width / turned.width) * 100 + "%",
        height: (base.height / turned.height) * 100 + "%",
        transform: "translate(-50%, -50%) rotate(" + rotation * 90 + "deg)",
      }}
    />
  );
}
export function Paper({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={"paper " + className}
      style={{ ...style, borderImageSource: "url(" + art.box + ")" }}
    >
      {children}
    </div>
  );
}
export function Thumbnail({
  level,
  placements,
  locked = false,
}: {
  level: Level;
  placements: Placements;
  locked?: boolean;
}) {
  if (locked)
    return (
      <div className="locked-box">
        <img src={art.closedBox} alt="" />
        <Icon name="LockKeyhole" />
      </div>
    );
  return (
    <Paper
      className="thumbnail"
      style={{
        ...({ "--thumb-rows": level.rows } as CSSProperties),
        width:
          "calc(var(--thumb-unit) * " +
          level.cols +
          " + var(--thumb-border) * 2)",
      }}
    >
      <div
        className="thumb-grid"
        style={{ aspectRatio: level.cols + " / " + level.rows }}
      >
        {Array.from({ length: level.cols * level.rows }, (_, i) => (
          <span
            className="thumb-cell"
            key={i}
            style={{
              width: 100 / level.cols + "%",
              height: 100 / level.rows + "%",
              left: ((i % level.cols) / level.cols) * 100 + "%",
              top: (Math.floor(i / level.cols) / level.rows) * 100 + "%",
            }}
          />
        ))}
        {level.pieces.map((p) => {
          const pose = placements[p.id];
          if (!pose) return null;
          const size = bounds(shape(p.kind, pose.rotation));
          return (
            <div
              key={p.id}
              className="thumb-cat"
              style={{
                left: (pose.x / level.cols) * 100 + "%",
                top: (pose.y / level.rows) * 100 + "%",
                width: (size.width / level.cols) * 100 + "%",
                height: (size.height / level.rows) * 100 + "%",
                clipPath: silhouette(shape(p.kind, pose.rotation)),
              }}
            >
              <CatArt kind={p.kind} rotation={pose.rotation} />
            </div>
          );
        })}
      </div>
    </Paper>
  );
}
