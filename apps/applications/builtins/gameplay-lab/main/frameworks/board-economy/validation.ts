import type { Issue } from "../../shared/contracts";
import type { BoardModel } from "./model";
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, allowed: string[]) =>
  Object.keys(v).every((k) => allowed.includes(k));
const id = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[\w-]{1,100}$/.test(v) &&
  !["__proto__", "prototype", "constructor"].includes(v);
const number = (v: unknown, low: number, high: number): v is number =>
  Number.isSafeInteger(v) && Number(v) >= low && Number(v) <= high;
export function validateBoard(input: unknown, draft = false): Issue[] {
  const issues: Issue[] = [],
    add = (path: string, message: string) => issues.push({ path, message });
  const name = (v: unknown, max: number) =>
    typeof v === "string" && v.length <= max && (draft || !!v.trim());
  if (
    !object(input) ||
    input.format !== "gameplay-board-economy-v1" ||
    !keys(input, ["format", "id", "name", "description", "tiles", "rules"]) ||
    !id(input.id) ||
    !name(input.name, 60) ||
    typeof input.description !== "string" ||
    input.description.length > 2000
  )
    return [
      {
        path: "棋盘模型",
        message: "棋盘模型的格式、版本、名称或字段不受支持。",
      },
    ];
  const r = input.rules;
  if (
    !object(r) ||
    !keys(r, ["players", "initialCash", "salary", "diceSides", "maxTurns"]) ||
    !Array.isArray(r.players) ||
    r.players.length !== 2 ||
    !r.players.every((p) => name(p, 40)) ||
    !number(r.initialCash, 1, 1_000_000) ||
    !number(r.salary, 0, 1_000_000) ||
    !number(r.diceSides, 2, 6) ||
    !number(r.maxTurns, 1, 200)
  )
    add(
      "棋盘规则",
      "需要两位玩家，初始资金 1–1,000,000、起点收入 0–1,000,000、骰子 2–6 面及回合上限 1–200。",
    );
  else if (!draft && r.players[0].trim() === r.players[1].trim())
    add("棋盘规则", "请为两位玩家使用不同名称。");
  if (!Array.isArray(input.tiles) || input.tiles.length > 20)
    return [...issues, { path: "棋盘", message: "棋盘最多包含 20 个地块。" }];
  const ids = new Set<string>();
  for (const t of input.tiles) {
    if (
      !object(t) ||
      !keys(t, ["id", "name", "type", "price", "rent"]) ||
      !id(t.id) ||
      ids.has(t.id) ||
      !name(t.name, 40) ||
      !["start", "property", "rest"].includes(String(t.type)) ||
      !number(t.price, 0, 1_000_000) ||
      !number(t.rent, 0, 1_000_000)
    ) {
      add(
        "棋盘",
        "每个地块须有唯一标识、有效名称、受支持的类型及整数价格和租金。",
      );
      continue;
    }
    ids.add(t.id);
    if (t.type !== "property" && (t.price !== 0 || t.rent !== 0))
      add(t.id, "起点和休息地的价格与租金须为 0。");
    if (!draft && t.type === "property" && (!t.price || !t.rent))
      add(t.id, "地产的价格和租金须为 1–1,000,000。");
  }
  if (!draft) {
    const m = input as unknown as BoardModel;
    if (m.tiles.length < 4)
      add("棋盘", "添加至少 4 个地块，按顺序组成环形棋盘。");
    if (
      m.tiles[0]?.type !== "start" ||
      m.tiles.filter((t) => t?.type === "start").length !== 1
    )
      add("棋盘", "棋盘首格须为唯一的起点。");
    if (!m.tiles.some((t) => t?.type === "property"))
      add("棋盘", "至少配置一处地产，以提供购买和收租规则。");
  }
  return issues;
}
