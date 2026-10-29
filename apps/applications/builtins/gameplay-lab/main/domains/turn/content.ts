import {
  contentItem,
  contentKey,
  type ContentIndex,
  type ContentKind,
} from "../../shared/content";
import type { Effect, Model } from "./model";

export function turnContent(model: Model): ContentIndex {
  const index: ContentIndex = { items: [], references: [] };
  for (const [kind, items] of [
    ["state", model.fields],
    ["capability", model.capabilities],
    ["action", model.actions],
    ["goal", model.goals],
  ] as const)
    for (const item of items)
      index.items.push(
        contentItem(kind, item.id, item.name, item.description, "model"),
      );
  index.items.push(
    contentItem(
      "flow",
      "flow",
      "回合与周期结算",
      `每阶段 ${model.flow.actionsPerTurn} 次行动，最多 ${model.flow.maxRounds} 轮。`,
      "rules",
    ),
  );
  const link = (from: string, kind: ContentKind, id: string, label: string) =>
    index.references.push({ from, to: contentKey(kind, id), label });
  const effects = (from: string, effects: Effect[]) =>
    effects.forEach((effect, i) => {
      const prefix = `效果 ${i + 1}`;
      if (effect.type === "add") {
        link(from, "state", effect.field, `${prefix} · 变化状态`);
        if (effect.from !== undefined)
          link(from, "state", effect.from, `${prefix} · 数值来源`);
      } else if (effect.type === "grant")
        link(from, "capability", effect.capability, `${prefix} · 获得能力`);
      else {
        link(from, "deck", effect.collection, `${prefix} · 计分牌库`);
        link(from, "state", effect.field, `${prefix} · 得分状态`);
        if (effect.multiplier !== undefined)
          link(from, "state", effect.multiplier, `${prefix} · 倍率状态`);
      }
    });
  for (const action of model.actions) {
    const from = contentKey("action", action.id);
    action.costs.forEach((cost, i) =>
      link(from, "state", cost.field, `消耗 ${i + 1}`),
    );
    action.requires.forEach((id) => link(from, "capability", id, "前置能力"));
    effects(from, action.effects);
  }
  for (const goal of model.goals)
    link(contentKey("goal", goal.id), "state", goal.field, "目标指标");
  effects(contentKey("flow", "flow"), model.flow.income);
  return index;
}
