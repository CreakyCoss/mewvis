import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  NativeSelect,
  NativeSelectOption,
} from "design-system/components/ui/native-select";
import type { BoardExperiment } from "./model";
import { boardRentScanResults } from "./statistics";
import { boardRentMultiplierLabel } from "./rent-scan";

type Metric = "turns" | "limit" | "wins";
export function RentScanTrend({ experiment }: { experiment: BoardExperiment }) {
  const [metric, setMetric] = useState<Metric>("turns"),
    [width, setWidth] = useState(640);
  const host = useRef<HTMLDivElement>(null),
    description = useId();
  const points = useMemo(() => boardRentScanResults(experiment), [experiment]);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const measure = () =>
      setWidth(Math.max(180, Math.floor(element.clientWidth)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const label =
    metric === "turns"
      ? "平均局长"
      : metric === "limit"
        ? "上限率"
        : "先后手胜率";
  const names = experiment.variants[0].model.rules.players;
  const series =
    metric === "wins"
      ? [
          { name: `先手 · ${names[0]}`, color: "var(--info)", seat: 0 },
          { name: `后手 · ${names[1]}`, color: "var(--warning)", seat: 1 },
        ]
      : [
          {
            name: label,
            color: metric === "turns" ? "var(--primary)" : "var(--warning)",
            seat: 0,
          },
        ];
  const value = (point: (typeof points)[number], seat: number) =>
    !point.row.finished
      ? null
      : metric === "turns"
        ? point.row.averageTurns
        : metric === "limit"
          ? point.row.limitRate
          : point.row.winRates[seat];
  const ceiling =
    metric === "turns"
      ? Math.max(
          1,
          Math.ceil(Math.max(0, ...points.map((p) => p.row.averageTurns ?? 0))),
        )
      : 100;
  const min = points[0].percent,
    max = points.at(-1)!.percent;
  const x = (percent: number) =>
    52 + ((percent - min) / (max - min)) * (width - 76);
  const y = (n: number) => 194 - (n / ceiling) * 174;
  const ticks = [points[0]];
  for (const point of points.slice(1, -1))
    if (
      x(point.percent) - x(ticks.at(-1)!.percent) >= 76 &&
      x(max) - x(point.percent) >= 76
    )
      ticks.push(point);
  ticks.push(points.at(-1)!);
  return (
    <section className="board-rent-trend" aria-label="租金扫描趋势">
      <div className="board-rent-trend-heading">
        <h3>租金倍率与结果</h3>
        <label>
          查看指标
          <NativeSelect
            size="sm"
            aria-label="租金扫描趋势指标"
            value={metric}
            onChange={(e) => setMetric(e.target.value as Metric)}
          >
            <NativeSelectOption value="turns">平均局长</NativeSelectOption>
            <NativeSelectOption value="limit">上限率</NativeSelectOption>
            <NativeSelectOption value="wins">先后手胜率</NativeSelectOption>
          </NativeSelect>
        </label>
      </div>
      <div ref={host} className="board-rent-chart">
        <svg
          width="100%"
          height="238"
          viewBox={`0 0 ${width} 238`}
          role="img"
          aria-label={`租金倍率扫描：${label}`}
          aria-describedby={description}
        >
          {[0, ceiling / 2, ceiling].map((tick) => (
            <g key={tick}>
              <line
                x1={52}
                x2={width - 24}
                y1={y(tick)}
                y2={y(tick)}
                className="board-rent-grid"
              />
              <text x={44} y={y(tick) + 4} textAnchor="end">
                {Number(tick.toFixed(1))}
                {metric === "turns" ? "" : "%"}
              </text>
            </g>
          ))}
          <line
            x1={x(100)}
            x2={x(100)}
            y1={12}
            y2={194}
            className="board-rent-baseline"
          >
            <title>1 倍原值基准</title>
          </line>
          {series.map((line, i) => {
            let path = "",
              connected = false;
            const marks = points
              .map((point) => {
                const n = value(point, line.seat);
                if (n === null) {
                  connected = false;
                  return null;
                }
                path += `${connected ? " L" : "M"}${x(point.percent)} ${y(n)}`;
                connected = true;
                return { point, n };
              })
              .filter((mark) => mark !== null);
            return (
              <g key={line.name} style={{ color: line.color }}>
                <path
                  d={path || undefined}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeDasharray={i === 1 ? "5 4" : undefined}
                />
                {marks.map(({ point, n }) => {
                  const title = `${boardRentMultiplierLabel(point.percent)} · ${line.name} ${n.toFixed(1)}${metric === "turns" ? " 回合" : "%"} · 成功 ${point.row.finished}/${point.row.planned}${point.reused ? ` · 复用 ${boardRentMultiplierLabel(point.primary)} 规则` : ""}`;
                  return i === 1 ? (
                    <rect
                      key={point.percent}
                      x={x(point.percent) - 3}
                      y={y(n) - 3}
                      width={6}
                      height={6}
                      fill="currentColor"
                    >
                      <title>{title}</title>
                    </rect>
                  ) : (
                    <circle
                      key={point.percent}
                      cx={x(point.percent)}
                      cy={y(n)}
                      r={point.percent === 100 ? 5.5 : 4.5}
                      fill="currentColor"
                    >
                      <title>{title}</title>
                    </circle>
                  );
                })}
              </g>
            );
          })}
          {ticks.map((point, i) => (
            <text
              key={point.percent}
              x={x(point.percent)}
              y={218}
              textAnchor={
                i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle"
              }
            >
              {boardRentMultiplierLabel(point.percent)}
            </text>
          ))}
        </svg>
      </div>
      <div className="board-rent-legend">
        {series.map((line, i) => (
          <span key={line.name}>
            <i
              aria-hidden="true"
              className={i === 1 ? "square" : ""}
              style={{ background: line.color }}
            />
            {line.name}
          </span>
        ))}
        <span>竖向虚线：1 倍基准 · 横轴：租金倍率</span>
      </div>
      <p className="hint" id={description}>
        仅绘制成功完成的样本，缺少数据的点留空；达到上限仍计入胜率分母。换算相同的倍率点复用同一批结果，不是额外样本。
      </p>
      <p className="hint">
        上限率较高时，双方胜率下降不能单独说明先手优势减小。逐组数据与同种子配对差异见下表。
      </p>
    </section>
  );
}
