import type { GameComposition } from "../../composition/contracts";
import { componentRef, sameJson } from "../../composition/resolve";
import type { DoudizhuModel } from "../model";
import {
  doudizhuLayout,
  doudizhuModules,
  doudizhuSkeleton,
  resolveDoudizhuComposition,
} from "./catalog";

export const doudizhuDefaultRules: DoudizhuModel["rules"] = {
  enabled: [
    "single",
    "pair",
    "triple",
    "tripleSingle",
    "triplePair",
    "straight",
    "pairChain",
    "tripleChain",
    "planeSingle",
    "planePair",
    "fourSingle",
    "fourPair",
    "bomb",
    "rocket",
  ],
  straightMin: 5,
  pairChainMin: 3,
  tripleChainMin: 2,
  distinctSingles: true,
  bombFactor: 2,
  baseScore: 1,
};
export const doudizhuPresets = [
  {
    id: "classic-doudizhu",
    version: 1,
    name: "经典斗地主",
    description: "标准叫分、跟牌与阵营结算，使用三人牌桌。",
    modules: [] as string[],
  },
  {
    id: "hero-doudizhu",
    version: 1,
    name: "英雄斗地主",
    description: "在经典斗地主基础上启用英雄洞察，使用相同的组合与装配流程。",
    modules: ["heroes"],
  },
] as const;
export function compositionForModules(ids: readonly string[]): GameComposition {
  return {
    version: 1,
    skeleton: componentRef(doudizhuSkeleton),
    layout: componentRef(doudizhuLayout),
    modules: ids.map((id) => {
      const module = doudizhuModules.find((item) => item.definition.id === id);
      if (!module) throw new Error("模块不受支持：" + id);
      return componentRef(module.definition);
    }),
  };
}
export function applyDoudizhuPreset(model: DoudizhuModel, id: string) {
  const preset = doudizhuPresets.find((item) => item.id === id);
  if (!preset) throw new Error("斗地主预设不受支持。");
  model.rules = structuredClone(doudizhuDefaultRules);
  model.composition = compositionForModules(preset.modules);
  // Preserve inactive content so selecting a different preset does not erase it.
  for (const module of doudizhuModules) {
    const enabled = preset.modules.some((id) => id === module.definition.id);
    if (enabled) model.extensions[module.definition.id] = module.createConfig();
    else if (model.extensions[module.definition.id])
      Object.assign(model.extensions[module.definition.id]!, {
        enabled: false,
      });
  }
}
export function setDoudizhuModuleEnabled(
  model: DoudizhuModel,
  id: string,
  enabled: boolean,
) {
  const module = doudizhuModules.find((item) => item.definition.id === id);
  if (!module) throw new Error("模块不受支持：" + id);
  const resolved = resolveDoudizhuComposition(model, true);
  if (resolved.issues.length)
    throw new Error(resolved.issues.map((i) => i.message).join(" "));
  model.composition = structuredClone(resolved.snapshot);
  model.extensions[id] ??= module.createConfig();
  Object.assign(model.extensions[id]!, { enabled });
  model.composition.modules = enabled
    ? [
        ...model.composition.modules.filter((ref) => ref.id !== id),
        componentRef(module.definition),
      ]
    : model.composition.modules.filter((ref) => ref.id !== id);
}
export function matchingDoudizhuPreset(model: DoudizhuModel): string {
  const resolved = resolveDoudizhuComposition(model);
  if (resolved.issues.length || !sameJson(model.rules, doudizhuDefaultRules))
    return "custom";
  return (
    doudizhuPresets.find(
      (preset) =>
        sameJson(compositionForModules(preset.modules), resolved.snapshot) &&
        resolved.modules.every((module) =>
          sameJson(
            model.extensions[module.definition.id],
            module.createConfig(),
          ),
        ),
    )?.id ?? "custom"
  );
}
