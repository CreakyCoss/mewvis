import type { BoardExperimentPlan } from "./model";
import { boardRentMultiplierLabel, boardRentScanPoints } from "./rent-scan";

export interface RentScanInput {
  start: string;
  end: string;
  step: string;
}
export function RentScanFields({
  value,
  change,
}: {
  value: RentScanInput;
  change(value: RentScanInput): void;
}) {
  return (
    <>
      {(
        [
          ["start", "倍率起点"],
          ["end", "倍率终点"],
          ["step", "倍率步长"],
        ] as const
      ).map(([key, label]) => (
        <label className="form-field" key={key}>
          {label}
          <input
            aria-label={`租金${label}`}
            type="number"
            min={0.01}
            max={100}
            step={0.01}
            value={value[key]}
            onChange={(e) => change({ ...value, [key]: e.target.value })}
          />
        </label>
      ))}
    </>
  );
}
export function RentScanPreview({ plan }: { plan: BoardExperimentPlan }) {
  const points = boardRentScanPoints(plan);
  return (
    <details className="board-rent-preview">
      <summary>
        倍率与实际租金 · {points.length} 个点 / {plan.variants.length} 份规则
      </summary>
      <div className="board-experiment-table-scroll">
        <table>
          <caption>
            租金四舍五入为整数、最低 1；换算相同的规则复用同一批样本。
          </caption>
          <thead>
            <tr>
              <th>租金倍率</th>
              <th>实际租金范围</th>
              <th>使用规则</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.percent}>
                <th scope="row">
                  {boardRentMultiplierLabel(point.percent)}
                  {point.percent === 100 ? " · 基准" : ""}
                </th>
                <td>
                  {point.minRent === point.maxRent
                    ? point.minRent.toLocaleString("zh-CN")
                    : `${point.minRent.toLocaleString("zh-CN")}–${point.maxRent.toLocaleString("zh-CN")}`}
                </td>
                <td>
                  {point.reused
                    ? `复用 ${boardRentMultiplierLabel(point.primary)}`
                    : point.variant === "baseline"
                      ? "原值基准"
                      : "扫描规则"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
