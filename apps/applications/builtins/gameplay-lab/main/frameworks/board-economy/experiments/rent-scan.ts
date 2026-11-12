import { copy } from "../../../shared/utils";
import type { BoardModel } from "../model";
import { validateBoard } from "../validation";
import type { BoardExperimentPlan, BoardVariant } from "./model";

export interface BoardRentScan {
  kind: "rent-multiplier";
  /** Integer hundredths: 50 means ×0.50, 100 means the unchanged baseline. */
  start: number;
  end: number;
  step: number;
}
export const MAX_BOARD_RENT_POINTS = 11;
export const boardRentMultiplierLabel = (percent: number) =>
  `×${(percent / 100).toFixed(2)}`;

export function parseBoardRentMultiplier(text: string): number | null {
  const value = text.trim();
  if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const percent = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return percent >= 1 && percent <= 10000 ? percent : null;
}
export function boardRentMultipliers(input: unknown): number[] {
  const scan = input as BoardRentScan;
  if (
    !scan ||
    typeof scan !== "object" ||
    Array.isArray(scan) ||
    Object.keys(scan).some(
      (key) => !["kind", "start", "end", "step"].includes(key),
    ) ||
    scan.kind !== "rent-multiplier" ||
    ![scan.start, scan.end, scan.step].every(
      (n) => Number.isSafeInteger(n) && n >= 1 && n <= 10000,
    )
  )
    throw new Error("租金倍率须为 0.01–100，最多两位小数，步长须为正数。");
  if (scan.start > scan.end || (scan.end - scan.start) % scan.step !== 0)
    throw new Error("倍率终点须不小于起点，且能由起点按步长到达。");
  const count = (scan.end - scan.start) / scan.step + 1;
  if (count > MAX_BOARD_RENT_POINTS)
    throw new Error("租金扫描最多 11 个倍率点，包含 1 倍基准。");
  const points = [
    ...new Set([
      100,
      ...Array.from({ length: count }, (_, i) => scan.start + i * scan.step),
    ]),
  ].sort((a, b) => a - b);
  if (points.length > MAX_BOARD_RENT_POINTS)
    throw new Error("租金扫描最多 11 个倍率点，包含 1 倍基准。");
  if (points.length < 2) throw new Error("请至少选择一个不同于 1 倍的倍率点。");
  return points;
}
const rentKey = (model: BoardModel) =>
  JSON.stringify(model.tiles.map((t) => t.rent));
function scaledModel(base: BoardModel, percent: number): BoardModel {
  const model = copy(base);
  for (const tile of model.tiles) {
    if (tile.type !== "property") continue;
    // Integer arithmetic makes round-half-up independent of floating-point input.
    tile.rent = Math.max(1, Math.floor((tile.rent * percent + 50) / 100));
    if (tile.rent > 1_000_000)
      throw new Error(
        `${boardRentMultiplierLabel(percent)} 下「${tile.name}」租金超过 1,000,000，请缩小倍率范围。`,
      );
  }
  return model;
}
export function boardRentScanVariants(
  base: BoardVariant,
  scan: BoardRentScan,
): BoardVariant[] {
  const points = boardRentMultipliers(scan);
  if (
    base.id !== "baseline" ||
    !["draft", "version"].includes(base.source.kind)
  )
    throw new Error("扫描基准须为当前草稿或命名版本。");
  const issues = validateBoard(base.model);
  if (issues.length) throw new Error(issues.map((i) => i.message).join(" "));
  const variants = [copy(base)],
    keys = new Set([rentKey(base.model)]);
  for (const percent of points) {
    const model = scaledModel(base.model, percent),
      key = rentKey(model);
    if (keys.has(key)) continue;
    keys.add(key);
    variants.push({
      id: `rent-${percent}`,
      name: `租金 ${boardRentMultiplierLabel(percent)}`,
      source: { kind: "rent-multiplier", percent },
      model,
    });
  }
  return variants;
}
export function createBoardRentScanPlan(
  base: BoardVariant,
  scan: BoardRentScan,
  seedStart: number,
  seedCount: number,
): BoardExperimentPlan {
  return {
    variants: boardRentScanVariants(base, scan),
    scan: copy(scan),
    seedStart,
    seedCount,
  };
}
export function boardRentScanPoints(plan: BoardExperimentPlan) {
  if (!plan.scan) return [];
  const base = plan.variants[0];
  return boardRentMultipliers(plan.scan).map((percent) => {
    const model = scaledModel(base.model, percent),
      key = rentKey(model);
    const variant = plan.variants.find((v) => rentKey(v.model) === key);
    if (!variant) throw new Error("扫描倍率缺少对应的冻结规则。");
    const primary =
      variant.source.kind === "rent-multiplier" ? variant.source.percent : 100;
    const rents = model.tiles
      .filter((t) => t.type === "property")
      .map((t) => t.rent);
    return {
      percent,
      variant: variant.id,
      primary,
      reused: percent !== primary,
      minRent: Math.min(...rents),
      maxRent: Math.max(...rents),
    };
  });
}
export function boardRentVariantLabel(
  points: ReturnType<typeof boardRentScanPoints>,
  id: BoardVariant["id"],
) {
  return (
    points
      .filter((p) => p.variant === id)
      .map((p) => boardRentMultiplierLabel(p.percent))
      .join(" / ") + (id === "baseline" ? " · 基准" : "")
  );
}
