import type { CardModel } from "../../../domains/card/model";
import type { GameComposition } from "../../composition/contracts";
import { componentRef } from "../../composition/resolve";
import {
  cardScoringConfigs,
  cardScoringLayout,
  cardScoringModules,
  cardScoringSkeleton,
  resolveCardScoringComposition,
} from "./catalog";
export const cardScoringPresets = [
  {
    id: "paired-scoring",
    version: 1,
    name: "配对计分",
    description:
      "选牌后结算基础分与配对奖励；保留空牌库，填写自己的卡牌即可试玩。",
    modules: ["pair-reward"],
  },
  {
    id: "base-scoring",
    version: 1,
    name: "基础计分",
    description: "只按卡牌基础分与倍率计分，可在玩法组合中加入配对奖励。",
    modules: [] as string[],
  },
] as const;
export function applyCardScoringPreset(model: CardModel, id: string) {
  const preset = cardScoringPresets.find((item) => item.id === id);
  if (!preset) throw new Error("组合计分预设不受支持。");
  model.extensions = structuredClone(cardScoringConfigs(model));
  const composition: GameComposition = {
    version: 1,
    skeleton: componentRef(cardScoringSkeleton),
    layout: componentRef(cardScoringLayout),
    modules: [],
  };
  for (const module of cardScoringModules) {
    const enabled = preset.modules.some((id) => id === module.definition.id);
    if (enabled) {
      model.extensions[module.definition.id] ??= module.createConfig();
      composition.modules.push(componentRef(module.definition));
    }
    if (model.extensions[module.definition.id])
      Object.assign(model.extensions[module.definition.id]!, { enabled });
  }
  model.composition = composition;
}
export function setCardScoringModuleEnabled(
  model: CardModel,
  id: string,
  enabled: boolean,
) {
  const module = cardScoringModules.find((item) => item.definition.id === id);
  if (!module) throw new Error("模块不受支持：" + id);
  const resolved = resolveCardScoringComposition(model, true);
  if (resolved.issues.length)
    throw new Error(resolved.issues.map((issue) => issue.message).join(" "));
  model.extensions = structuredClone(cardScoringConfigs(model));
  model.extensions[id] ??= module.createConfig();
  Object.assign(model.extensions[id]!, { enabled });
  model.composition = structuredClone(resolved.snapshot);
  model.composition.modules = enabled
    ? [
        ...model.composition.modules.filter((ref) => ref.id !== id),
        componentRef(module.definition),
      ]
    : model.composition.modules.filter((ref) => ref.id !== id);
}
export function matchingCardScoringPreset(model: CardModel): string {
  const resolved = resolveCardScoringComposition(model, true);
  if (
    resolved.issues.length ||
    resolved.snapshot.modules.some((m) => m.id !== "pair-reward")
  )
    return "custom";
  // A preset is only a mechanism starting point; authored content always remains the user's.
  if (
    resolved.modules.length &&
    model.actions.some((a) =>
      a.effects.some(
        (e) => e.type === "combination" && (e.pairBonus ?? 15) !== 15,
      ),
    )
  )
    return "custom";
  return resolved.modules.length ? "paired-scoring" : "base-scoring";
}
