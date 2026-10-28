import { copy, uid, type Effect, type Model } from "./model";
const groups = [
  "fields",
  "capabilities",
  "actions",
  "goals",
  "collections",
] as const;
/** Only inbound references block deletion. An action's own effects disappear with it. */
export function referencesTo(model: Model, id: string): string[] {
  const refs = new Set<string>();
  const effects = (items: Effect[], owner: string) => {
    for (const e of items) {
      if (
        (e.type === "add" && (e.field === id || e.from === id)) ||
        (e.type === "grant" && e.capability === id) ||
        (e.type === "combination" &&
          [e.field, e.multiplier, e.collection].includes(id))
      )
        refs.add(owner);
    }
  };
  for (const a of model.actions) {
    if (a.id === id) continue;
    if (a.costs.some((c) => c.field === id) || a.requires.includes(id))
      refs.add(`行动「${a.name}」`);
    effects(a.effects, `行动「${a.name}」`);
  }
  for (const g of model.goals)
    if (g.id !== id && g.field === id) refs.add(`目标「${g.name}」`);
  effects(model.flow.income, "周期结算");
  return [...refs];
}
export function duplicateDefinition(model: Model, id: string): string {
  for (const key of groups) {
    const item = model[key].find((item) => item.id === id);
    if (!item) continue;
    if (model[key].length >= 80) throw new Error("同类定义最多 80 项。");
    const clone = {
      ...copy(item),
      id: uid(key),
      name: `${item.name.slice(0, 55)} 副本`,
    };
    // The corresponding group was selected above; its element type is unchanged.
    (model[key] as (typeof clone)[]).push(clone);
    return clone.id;
  }
  throw new Error("定义已不存在。");
}
export function removeDefinition(model: Model, id: string) {
  const refs = referencesTo(model, id);
  if (refs.length) throw new Error(`请先解除引用：${refs.join("、")}`);
  for (const key of groups) {
    const at = model[key].findIndex((item) => item.id === id);
    if (at >= 0) {
      model[key].splice(at, 1);
      return;
    }
  }
  throw new Error("定义已不存在。");
}
