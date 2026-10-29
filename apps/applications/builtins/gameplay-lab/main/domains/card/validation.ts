import type { Issue } from "../../shared/contracts";
import { isNumber } from "../../shared/utils";
import { validateTurnRules } from "../turn/validation";
import {
  MAX_CARD_DEFINITIONS,
  MAX_DECKS,
  MAX_DECK_SIZE,
  type CardModel,
} from "./model";

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const identifier = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 100 &&
  /^[a-zA-Z0-9_-]+$/.test(value) &&
  !["__proto__", "constructor", "prototype"].includes(value);
const integer = (value: unknown, low: number, high: number): value is number =>
  isNumber(value) && value >= low && value <= high;

export function validateCardModel(input: unknown, draft = false): Issue[] {
  const issues: Issue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });
  const keys = (
    value: Record<string, unknown>,
    allowed: string[],
    path: string,
  ) => {
    if (Object.keys(value).some((key) => !allowed.includes(key)))
      add(path, "包含当前卡牌规则不支持的字段，请移除或使用对应的模型格式。");
  };
  if (!object(input) || input.format !== "gameplay-card-v1")
    return [
      { path: "卡牌模型", message: "卡牌规则需要 gameplay-card-v1 格式。" },
    ];
  if ("collections" in input)
    add("卡牌模型", "卡牌模型使用卡牌定义与牌库，不接受旧集合字段。");
  keys(
    input,
    [
      "format",
      "id",
      "name",
      "description",
      "fields",
      "capabilities",
      "actions",
      "goals",
      "cards",
      "decks",
      "flow",
    ],
    "卡牌模型",
  );
  if (
    !Array.isArray(input.cards) ||
    input.cards.length > MAX_CARD_DEFINITIONS ||
    !Array.isArray(input.decks) ||
    input.decks.length > MAX_DECKS
  )
    return [
      {
        path: "卡牌与牌库",
        message: `最多 ${MAX_CARD_DEFINITIONS} 种卡牌、${MAX_DECKS} 个牌库。`,
      },
    ];
  const name = (value: unknown) =>
    typeof value === "string" &&
    value.length <= 300 &&
    (draft || !!value.trim());
  const ids = new Set<string>();
  for (const key of ["fields", "capabilities", "actions", "goals"] as const) {
    if (!Array.isArray(input[key]))
      return [{ path: key, message: "定义需要是列表。" }];
    for (const item of input[key])
      if (object(item) && typeof item.id === "string") ids.add(item.id);
  }
  const register = (id: unknown, path: string) => {
    if (!identifier(id)) add(path, "请使用有效的内部标识。");
    else if (ids.has(id)) add(path, "卡牌、牌库和规则标识不能重复。");
    else ids.add(id);
  };
  for (const card of input.cards) {
    if (!object(card)) {
      add("卡牌", "卡牌定义格式不完整。");
      continue;
    }
    keys(
      card,
      ["id", "name", "description", "group", "value"],
      String(card.id ?? "卡牌"),
    );
    register(card.id, String(card.id ?? "卡牌"));
    if (
      !name(card.name) ||
      !name(card.group) ||
      !integer(card.value, 0, 1_000_000) ||
      typeof card.description !== "string" ||
      card.description.length > 2000
    )
      add(
        String(card.id),
        "卡牌需要名称、分组、0–1,000,000 的基础值及有效说明。",
      );
  }
  const known = new Set(input.cards.filter(object).map((card) => card.id));
  for (const deck of input.decks) {
    if (!object(deck)) {
      add("牌库", "牌库格式不完整。");
      continue;
    }
    const path = String(deck.id ?? "牌库");
    keys(
      deck,
      [
        "id",
        "name",
        "entries",
        "handSize",
        "initialDraw",
        "minSelect",
        "maxSelect",
        "refill",
        "recycle",
      ],
      path,
    );
    register(deck.id, path);
    if (!name(deck.name)) add(path, "请填写牌库名称。");
    if (
      !integer(deck.handSize, 1, 10) ||
      !integer(deck.initialDraw, 0, 10) ||
      !integer(deck.minSelect, 1, 10) ||
      !integer(deck.maxSelect, 1, 10)
    )
      add(path, "手牌容量与出牌数量需为 1–10，开局抽牌数需为 0–10。");
    else if (
      !draft &&
      (deck.initialDraw > deck.handSize ||
        deck.minSelect > deck.maxSelect ||
        deck.maxSelect > deck.handSize)
    )
      add(path, "开局抽牌不能超过容量，最少出牌不能超过最多出牌或容量。");
    if (
      !["after-play", "turn-start", "none"].includes(String(deck.refill)) ||
      !["shuffle-discard", "stop"].includes(String(deck.recycle))
    )
      add(path, "请选择支持的补牌时机与牌库回收规则。");
    if (
      !Array.isArray(deck.entries) ||
      deck.entries.length > MAX_CARD_DEFINITIONS
    ) {
      add(path, "牌库组成需要是有效的卡牌数量列表。");
      continue;
    }
    const entries = new Set<string>();
    let total = 0;
    for (const entry of deck.entries) {
      if (
        !object(entry) ||
        !identifier(entry.card) ||
        !integer(entry.count, 1, 100)
      ) {
        add(path, "牌库每种卡牌需引用有效标识，数量为 1–100。");
        continue;
      }
      keys(entry, ["card", "count"], path);
      if (entries.has(entry.card))
        add(path, "同一种卡牌只添加一行，通过数量设置副本。");
      entries.add(entry.card);
      total += entry.count;
      if (!draft && !known.has(entry.card))
        add(path, "牌库引用的卡牌定义不存在。");
    }
    if (total > MAX_DECK_SIZE)
      add(path, `单个牌库最多 ${MAX_DECK_SIZE} 张牌。`);
    if (
      !draft &&
      (!total ||
        total < Number(deck.initialDraw) ||
        total < Number(deck.minSelect))
    )
      add(path, "牌库数量不足以完成开局抽牌或最少出牌。");
  }
  // Do not allocate or follow untrusted deck references until their shapes are safe.
  if (issues.length) return issues;
  const model = input as unknown as CardModel;
  issues.push(...validateTurnRules(model, draft, model.decks));
  if (issues.length) return issues;
  if (!draft && !model.decks.length)
    add("牌库", "添加一个牌库并配置卡牌数量。");
  return issues;
}
