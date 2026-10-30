import type { CardModel } from "../../../../domains/card/model";
import type { Issue } from "../../../../shared/contracts";
import { uid } from "../../../../shared/utils";

export interface CardAbility {
  id: string;
  name: string;
  uses: number;
  deck: string;
  discard: number;
  draw: number;
  cost: { field: string; amount: number } | null;
  focus: { discount: number; turns: number } | null;
}
export interface CardAbilitiesConfig {
  version: 1;
  enabled: boolean;
  abilities: CardAbility[];
}
export interface CardAbilitiesState {
  used: Record<string, number>[];
  focus: CardAbility["focus"][];
}
export function newCardAbility(
  kind: "draw" | "discard" | "exchange" | "focus",
  model?: CardModel,
): CardAbility {
  return {
    id: uid("ability"),
    name: {
      draw: "补充手牌",
      discard: "整理手牌",
      exchange: "换牌",
      focus: "专注",
    }[kind],
    uses: 1,
    deck: kind === "focus" ? "" : (model?.decks[0]?.id ?? ""),
    discard: kind === "discard" || kind === "exchange" ? 1 : 0,
    draw: kind === "draw" || kind === "exchange" ? 1 : 0,
    cost: null,
    focus: kind === "focus" ? { discount: 1, turns: 2 } : null,
  };
}
export const createCardAbilitiesConfig = (
  model?: CardModel,
): CardAbilitiesConfig => ({
  version: 1,
  enabled: true,
  abilities: [newCardAbility("exchange", model)],
});
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, allowed: string[]) =>
  Object.keys(v).every((k) => allowed.includes(k));
const integer = (v: unknown, low: number, high: number): v is number =>
  Number.isInteger(v) && Number(v) >= low && Number(v) <= high;
const reference = (v: unknown): v is string =>
  typeof v === "string" && v.length <= 300;

export function validateCardAbilities(
  input: unknown,
  draft = false,
  model?: CardModel,
): Issue[] {
  const errors: Issue[] = [],
    add = (message: string) => errors.push({ path: "卡牌能力", message });
  if (
    !object(input) ||
    input.version !== 1 ||
    typeof input.enabled !== "boolean" ||
    !keys(input, ["version", "enabled", "abilities"]) ||
    !Array.isArray(input.abilities) ||
    input.abilities.length > 8
  )
    return [
      {
        path: "卡牌能力",
        message: "卡牌能力需要受支持的版本及最多 8 项能力配置。",
      },
    ];
  if (!draft && input.enabled && !input.abilities.length)
    add("添加至少一项卡牌能力。");
  const ids = new Set<string>();
  for (const item of input.abilities) {
    if (
      !object(item) ||
      !keys(item, [
        "id",
        "name",
        "uses",
        "deck",
        "discard",
        "draw",
        "cost",
        "focus",
      ]) ||
      typeof item.id !== "string" ||
      !/^[\w-]{1,100}$/.test(item.id) ||
      ["__proto__", "prototype", "constructor"].includes(item.id) ||
      ids.has(item.id) ||
      typeof item.name !== "string" ||
      item.name.length > 40 ||
      (!draft && !item.name.trim()) ||
      !integer(item.uses, 1, 3) ||
      !reference(item.deck) ||
      !integer(item.discard, 0, 10) ||
      !integer(item.draw, 0, 10)
    ) {
      add("能力须有唯一标识、1–40 字名称、1–3 次使用次数及 0–10 张抽弃牌数。");
      continue;
    }
    ids.add(item.id);
    const cost = item.cost,
      focus = item.focus;
    if (
      cost !== null &&
      (!object(cost) ||
        !keys(cost, ["field", "amount"]) ||
        !reference(cost.field) ||
        !integer(cost.amount, 1, 1_000_000))
    )
      add("费用须引用一种资源，金额为 1–1,000,000。");
    if (
      focus !== null &&
      (!object(focus) ||
        !keys(focus, ["discount", "turns"]) ||
        !integer(focus.discount, 1, 3) ||
        !integer(focus.turns, 1, 3))
    )
      add("专注状态的技能费用减免及持续行动阶段均为 1–3。");
    if (
      !draft &&
      input.enabled &&
      !item.draw &&
      !item.discard &&
      focus === null
    )
      add("能力至少包含抽牌、弃牌或专注效果。");
    if (!draft && input.enabled && model) {
      const deck = model.decks.find((d) => d.id === item.deck);
      if ((item.draw || item.discard) && !deck)
        add(`能力「${item.name}」需要选择有效牌库。`);
      if (deck && Number(item.discard) > deck.handSize)
        add(`能力「${item.name}」的弃牌数不能超过手牌容量。`);
      if (object(cost) && !model.fields.some((f) => f?.id === cost.field))
        add(`能力「${item.name}」引用的费用资源不存在。`);
    }
  }
  return errors;
}
export const cardAbilitiesConfig = (model: CardModel) =>
  model.extensions?.["card-abilities"] as CardAbilitiesConfig | undefined;
