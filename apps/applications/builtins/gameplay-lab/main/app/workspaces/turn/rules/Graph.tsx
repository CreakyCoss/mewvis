import {
  Circle,
  Diamond,
  Flag,
  Maximize,
  Minus,
  Play,
  Plus,
} from "lucide-react";
import { useState } from "react";
import {
  edgesOf,
  nodesOf,
  type Model,
  type NodeKind,
} from "../../../../domains/turn/model";

export const kindNames: Record<NodeKind, string> = {
  state: "状态",
  capability: "能力",
  action: "行动",
  goal: "目标",
};
export const KindIcon = ({
  kind,
  size = 16,
}: {
  kind: NodeKind;
  size?: number;
}) => {
  const Icon = { state: Circle, capability: Diamond, action: Play, goal: Flag }[
    kind
  ];
  return <Icon size={size} aria-hidden="true" />;
};

export function Graph({
  model,
  selected,
  select,
  list,
}: {
  model: Model;
  selected: string;
  select(id: string): void;
  list: boolean;
}) {
  const [zoom, setZoom] = useState(1);
  const nodes = nodesOf(model),
    edges = edgesOf(model);
  return (
    <>
      <div className="lab-legend">
        {(Object.keys(kindNames) as NodeKind[]).map((kind) => (
          <span className={`kind-${kind}`} key={kind}>
            <KindIcon kind={kind} size={16} />
            {kindNames[kind]}
          </span>
        ))}
      </div>
      {list ? (
        <div className="lab-definition-list">
          {nodes.map((n) => (
            <button
              key={n.id}
              className={selected === n.id ? "selected" : ""}
              onClick={() => select(n.id)}
            >
              <span className={`node-icon kind-${n.kind}`}>
                <KindIcon kind={n.kind} />
              </span>
              <span>
                <strong>{n.name}</strong>
                <small>{n.description || "尚未添加说明"}</small>
              </span>
              <span className="muted">{kindNames[n.kind]}</span>
            </button>
          ))}
          {!nodes.length && (
            <p className="empty">从添加一个状态开始，逐步定义行动和目标。</p>
          )}
        </div>
      ) : (
        <div className="lab-graph-scroll">
          <div
            className="lab-graph"
            style={{ minWidth: `${Math.round(640 * zoom)}px` }}
          >
            <div className="graph-columns">
              {Object.values(kindNames).map((name) => (
                <span key={name}>{name}</span>
              ))}
            </div>
            <svg
              className="graph-edges"
              viewBox="0 0 1000 640"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <defs>
                <marker
                  id="arrow-neutral"
                  markerWidth="7"
                  markerHeight="7"
                  refX="6"
                  refY="3.5"
                  orient="auto"
                >
                  <path d="M0,0 L7,3.5 L0,7" fill="var(--muted-foreground)" />
                </marker>
                <marker
                  id="arrow-selected"
                  markerWidth="7"
                  markerHeight="7"
                  refX="6"
                  refY="3.5"
                  orient="auto"
                >
                  <path d="M0,0 L7,3.5 L0,7" fill="var(--primary)" />
                </marker>
              </defs>
              {edges.map((e) => {
                const a = nodes.find((n) => n.id === e.from),
                  b = nodes.find((n) => n.id === e.to);
                if (!a || !b) return null;
                const direction = b.x > a.x ? 1 : -1;
                const x1 = a.x * 10 + direction * 70,
                  x2 = b.x * 10 - direction * 70,
                  y1 = a.y * 6.4,
                  y2 = b.y * 6.4;
                const active = e.from === selected || e.to === selected;
                const around = a.kind === "state" && b.kind === "goal";
                const path = around
                  ? `M ${x1} ${y1} L ${x1 + 12} ${y1} L ${x1 + 12} 580 L ${x2 + 10} 580 L ${x2 + 10} ${y2 + 38}`
                  : `M ${x1} ${y1} C ${x1 + direction * 85} ${y1}, ${x2 - direction * 85} ${y2}, ${x2} ${y2}`;
                return (
                  <g key={e.id} className={active ? "edge is-active" : "edge"}>
                    <path
                      d={path}
                      markerEnd={`url(#arrow-${active ? "selected" : "neutral"})`}
                    />
                    <text
                      x={(x1 + x2) / 2}
                      y={around ? 571 : (y1 + y2) / 2 - 8}
                      textAnchor="middle"
                    >
                      {e.label}
                    </text>
                  </g>
                );
              })}
            </svg>
            {nodes.map((n) => (
              <button
                key={n.id}
                data-node={n.id}
                className={`model-node kind-${n.kind} ${selected === n.id ? "is-selected" : ""}`}
                style={{ left: `${n.x}%`, top: `${n.y}%` }}
                onClick={() => select(n.id)}
                aria-pressed={selected === n.id}
                aria-label={`${kindNames[n.kind]}：${n.name}`}
              >
                <KindIcon kind={n.kind} size={18} />
                <span>
                  <strong>{n.name}</strong>
                  <small>{n.description || kindNames[n.kind]}</small>
                </span>
              </button>
            ))}
            {!nodes.length && (
              <p className="empty">
                还没有定义。添加状态、行动与目标来建立模型。
              </p>
            )}
          </div>
        </div>
      )}
      <footer className="graph-footer">
        <span>点击定义查看来源与影响</span>
        {!list && (
          <div>
            <button
              className="icon-button"
              aria-label="缩小关系图"
              disabled={zoom <= 1}
              onClick={() => setZoom(Math.max(1, zoom - 0.2))}
            >
              <Minus size={17} />
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button
              className="icon-button"
              aria-label="放大关系图"
              disabled={zoom >= 1.8}
              onClick={() => setZoom(Math.min(1.8, zoom + 0.2))}
            >
              <Plus size={17} />
            </button>
            <button
              className="icon-button"
              aria-label="重置关系图缩放"
              onClick={() => setZoom(1)}
            >
              <Maximize size={17} />
            </button>
          </div>
        )}
      </footer>
    </>
  );
}
