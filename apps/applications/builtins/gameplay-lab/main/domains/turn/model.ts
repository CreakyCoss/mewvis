import type { Issue } from "../../shared/contracts";
import type { CardModel } from "../card/model";
import { validateCardModel } from "../card/validation";
import { validateNumericModel } from "./validation";
export { isNumber } from "../../shared/utils";
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
export interface NumericModel {
  format: "gameplay-model-v1";
  id: string;
  name: string;
  description: string;
  fields: Field[];
  capabilities: Capability[];
  actions: Action[];
  goals: Goal[];
  collections: [];
  flow: { actionsPerTurn: number; maxRounds: number; income: Effect[] };
}
export type Model = NumericModel | CardModel;
export function validateModel(input: unknown, draft = false): Issue[] {
  return (input as { format?: string })?.format === "gameplay-card-v1"
    ? validateCardModel(input, draft)
    : validateNumericModel(input, draft);
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
export const fieldName = (model: Model, id: string) =>
  model.fields.find((f) => f.id === id)?.name ?? "缺失的状态";
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
