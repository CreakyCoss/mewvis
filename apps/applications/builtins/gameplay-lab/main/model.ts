export type FieldRole = "stock" | "rate" | "progress";
export interface Field {
  id: string;
  name: string;
  description: string;
  initial: number;
  role: FieldRole;
}
export interface Capability {
  id: string;
  name: string;
  description: string;
  initial: boolean;
}
export interface Amount {
  field: string;
  value: number;
}
export type Effect =
  | { type: "add"; field: string; value: number; from?: string }
  | { type: "grant"; capability: string }
  | {
      type: "combination";
      collection: string;
      field: string;
      multiplier?: string;
      multiplierValue?: number;
      pairBonus?: number;
    };
export interface Action {
  id: string;
  name: string;
  description: string;
  costs: Amount[];
  requires: string[];
  effects: Effect[];
}
export interface Goal {
  id: string;
  name: string;
  description: string;
  field: string;
  threshold: number;
}
export interface Card {
  id: string;
  name: string;
  group: string;
  value: number;
}
export interface Collection {
  id: string;
  name: string;
  handSize: number;
  maxSelect: number;
  cards: Card[];
}
export interface Model {
  format: "gameplay-model-v1";
  id: string;
  name: string;
  description: string;
  fields: Field[];
  capabilities: Capability[];
  actions: Action[];
  goals: Goal[];
  collections: Collection[];
  flow: { actionsPerTurn: number; maxRounds: number; income: Effect[] };
}
export type NodeKind = "state" | "capability" | "action" | "goal";
export interface ModelNode {
  id: string;
  name: string;
  description: string;
  kind: NodeKind;
  x: number;
  y: number;
}
export interface ModelEdge {
  id: string;
  from: string;
  to: string;
  label: string;
}
export interface Issue {
  path: string;
  message: string;
}
export const uid = (prefix = "item") => `${prefix}-${crypto.randomUUID()}`;
export const copy = <T>(value: T): T => structuredClone(value);
export const fieldName = (model: Model, id: string) =>
  model.fields.find((f) => f.id === id)?.name ?? "缺失的状态";
export const isNumber = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  Math.abs(value) <= 1_000_000;

/** Validate untrusted imported/persisted content before using references or executing effects. */
export function validateModel(input: unknown, draft = false): Issue[] {
  const issues: Issue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });
  const object = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === "object" && !Array.isArray(v);
  if (!object(input))
    return [{ path: "模型", message: "模型需要是一个对象。" }];
  const text = (v: unknown) =>
    typeof v === "string" && v.trim().length > 0 && v.length <= 300;
  const identifier = (v: unknown) =>
    text(v) && !["__proto__", "prototype", "constructor"].includes(String(v));
  const name = (v: unknown) =>
    typeof v === "string" && v.length <= 300 && (draft || !!v.trim());
  if (input.format !== "gameplay-model-v1") add("格式", "不支持的模型格式。");
  if (
    !identifier(input.id) ||
    !name(input.name) ||
    typeof input.description !== "string" ||
    input.description.length > 2000
  )
    add("模型", "请填写有效的标识和名称。");
  const groups = [
    "fields",
    "capabilities",
    "actions",
    "goals",
    "collections",
  ] as const;
  for (const key of groups)
    if (!Array.isArray(input[key]) || input[key].length > 80)
      add(key, "定义需要是最多 80 项的列表。");
  if (issues.length) return issues;
  const m = input as unknown as Model;
  const ids = new Set<string>();
  for (const key of groups)
    for (const item of m[key]) {
      if (
        !object(item) ||
        !identifier(item.id) ||
        !name(item.name) ||
        (key !== "collections" &&
          (typeof item.description !== "string" ||
            item.description.length > 2000))
      ) {
        add(key, "每项定义都需要有效的标识、名称和说明。");
        continue;
      }
      if (ids.has(item.id)) add(item.id, "标识重复，请使用不同的内部标识。");
      ids.add(item.id);
    }
  if (issues.length) return issues;
  const fields = new Set(m.fields.map((f) => f.id));
  const capabilities = new Set(m.capabilities.map((f) => f.id));
  const collections = new Set(m.collections.map((f) => f.id));
  const ref = (id: unknown, values: Set<string>, path: string) => {
    if (typeof id !== "string" || (!draft && !values.has(id)))
      add(path, "引用的定义不存在。");
  };
  for (const f of m.fields) {
    if (!isNumber(f.initial) || (!draft && f.initial < 0))
      add(f.id, "初始值需为 0 到 1,000,000 的整数。");
    if (!["stock", "rate", "progress"].includes(f.role))
      add(f.id, "未知的状态用途。");
  }
  for (const c of m.capabilities)
    if (typeof c.initial !== "boolean") add(c.id, "请指定能力是否初始可用。");
  const effects = (list: unknown, path: string, scoring: boolean) => {
    if (!Array.isArray(list) || list.length > 30) {
      add(path, "效果需要是最多 30 项的列表。");
      return;
    }
    for (const e of list) {
      if (!object(e)) {
        add(path, "效果格式不完整。");
        continue;
      }
      if (e.type === "add") {
        ref(e.field, fields, path);
        if (!isNumber(e.value) || e.value < 0)
          add(path, "变化量需为非负整数。");
        if (e.from !== undefined) ref(e.from, fields, path);
      } else if (e.type === "grant") ref(e.capability, capabilities, path);
      else if (e.type === "combination" && scoring) {
        ref(e.collection, collections, path);
        ref(e.field, fields, path);
        if (e.multiplier !== undefined) ref(e.multiplier, fields, path);
        if (
          e.multiplierValue !== undefined &&
          (!isNumber(e.multiplierValue) ||
            e.multiplierValue < 0 ||
            e.multiplier !== undefined)
        )
          add(path, "固定倍率需为非负整数，并且只能选择一种倍率来源。");
        if (
          e.pairBonus !== undefined &&
          (!isNumber(e.pairBonus) || e.pairBonus < 0)
        )
          add(path, "同类配对奖励需为非负整数。");
      } else add(path, "此阶段不支持该效果类型。");
    }
  };
  for (const a of m.actions) {
    if (!Array.isArray(a.costs) || a.costs.length > 20)
      add(a.id, "成本格式不完整。");
    else
      for (const c of a.costs) {
        if (!object(c)) {
          add(a.id, "成本格式不完整。");
          continue;
        }
        ref(c.field, fields, a.id);
        if (!isNumber(c.value) || c.value < 0) add(a.id, "成本需为非负整数。");
      }
    if (!Array.isArray(a.requires) || a.requires.length > 20)
      add(a.id, "前置能力格式不完整。");
    else a.requires.forEach((id) => ref(id, capabilities, a.id));
    effects(a.effects, a.id, true);
    if (!draft && Array.isArray(a.effects) && a.effects.length === 0)
      add(a.id, "行动至少需要一项效果。");
    if (
      Array.isArray(a.effects) &&
      a.effects.filter((e) => e?.type === "combination").length > 1
    )
      add(a.id, "首版每次行动支持一个组合计分效果。");
  }
  for (const g of m.goals) {
    ref(g.field, fields, g.id);
    if (!isNumber(g.threshold) || (!draft && g.threshold <= 0))
      add(g.id, "目标门槛需为 1 到 1,000,000 的整数。");
  }
  for (const c of m.collections) {
    if (
      !isNumber(c.handSize) ||
      c.handSize < 1 ||
      c.handSize > 10 ||
      !isNumber(c.maxSelect) ||
      c.maxSelect < 1 ||
      c.maxSelect > 10 ||
      (!draft && c.maxSelect > c.handSize)
    )
      add(c.id, "集合容量需为 1–10，选择上限不能超过容量。");
    if (
      !Array.isArray(c.cards) ||
      (!draft && c.cards.length < c.handSize) ||
      c.cards.length > 100
    ) {
      add(c.id, "集合需要足够的初始对象，最多 100 个。");
      continue;
    }
    const cardIds = new Set();
    for (const card of c.cards) {
      if (
        !object(card) ||
        !text(card.id) ||
        !name(card.name) ||
        !name(card.group) ||
        !isNumber(card.value) ||
        card.value < 0
      )
        add(c.id, "集合对象格式不完整。");
      else if (cardIds.has(card.id)) add(c.id, "集合对象标识重复。");
      else cardIds.add(card.id);
    }
  }
  if (
    !object(m.flow) ||
    !isNumber(m.flow.actionsPerTurn) ||
    m.flow.actionsPerTurn < 1 ||
    m.flow.actionsPerTurn > 10 ||
    !isNumber(m.flow.maxRounds) ||
    m.flow.maxRounds < 1 ||
    m.flow.maxRounds > 100
  )
    add("流程", "每轮行动需为 1–10 次，轮数上限需为 1–100。");
  else effects(m.flow.income, "周期结算", false);
  if (!draft && m.fields.length === 0) add("状态", "至少定义一个状态。");
  if (!draft && m.actions.length === 0) add("行动", "至少定义一个行动。");
  if (!draft && m.goals.length === 0) add("目标", "至少定义一个目标。");
  return issues;
}

export function nodesOf(m: Model): ModelNode[] {
  const columns = [m.fields, m.capabilities, m.actions, m.goals];
  return columns.flatMap((items, column) =>
    items.map((item, i) => ({
      id: item.id,
      name: item.name,
      description: item.description ?? "",
      kind: (["state", "capability", "action", "goal"] as const)[column],
      x: [12, 39, 65, 89][column],
      y: items.length === 1 ? 72 : 22 + i * (54 / (items.length - 1)),
    })),
  );
}
export function edgesOf(m: Model): ModelEdge[] {
  const result: ModelEdge[] = [];
  const add = (from: string, to: string, label: string) =>
    result.push({ id: `${from}-${to}-${result.length}`, from, to, label });
  for (const a of m.actions) {
    a.costs.forEach((c) => add(c.field, a.id, `消耗 ${c.value}`));
    a.requires.forEach((id) => add(id, a.id, "允许"));
    a.effects.forEach((e) => {
      if (e.type === "add") {
        add(a.id, e.field, `增加 ${e.value}`);
        if (e.from) add(e.from, a.id, "按状态计算");
      }
      if (e.type === "grant") add(a.id, e.capability, "建立");
      if (e.type === "combination") add(a.id, e.field, "组合计分");
    });
  }
  m.goals.forEach((g) => add(g.field, g.id, "判定"));
  return result;
}
