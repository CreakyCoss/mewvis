import type { Issue } from "../shared/contracts";
import { isNumber } from "../shared/utils";
import type { NumericModel } from "./model";

/** Validate untrusted imported/persisted content before using references or executing effects. */
export function validateTurnRules(
  input: unknown,
  draft = false,
  decks: { id: string }[] = [],
): Issue[] {
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
  if (
    !identifier(input.id) ||
    !name(input.name) ||
    typeof input.description !== "string" ||
    input.description.length > 2000
  )
    add("模型", "请填写有效的标识和名称。");
  const groups = ["fields", "capabilities", "actions", "goals"] as const;
  for (const key of groups)
    if (!Array.isArray(input[key]) || input[key].length > 80)
      add(key, "定义需要是最多 80 项的列表。");
  if (issues.length) return issues;
  const m = input as unknown as NumericModel;
  const ids = new Set<string>();
  for (const key of groups)
    for (const item of m[key]) {
      if (
        !object(item) ||
        !identifier(item.id) ||
        !name(item.name) ||
        typeof item.description !== "string" ||
        item.description.length > 2000
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
  const collections = new Set(decks.map((f) => f.id));
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

export function validateNumericModel(input: unknown, draft = false): Issue[] {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    (input as NumericModel).format !== "gameplay-model-v1"
  )
    return [{ path: "格式", message: "不支持的数值模型格式。" }];
  const model = input as NumericModel;
  if (!Array.isArray(model.collections) || model.collections.length)
    return [
      { path: "模型", message: "资源经营模型不包含卡牌；请使用独立卡牌模型。" },
    ];
  return validateTurnRules(input, draft);
}
