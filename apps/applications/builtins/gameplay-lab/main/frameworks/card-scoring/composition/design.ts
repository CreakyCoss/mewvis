import type { CardModel } from "../../../domains/card/model";
import type { CompositionDesign } from "../../composition/design";
import {
  cardScoringLayout,
  cardScoringModules,
  cardScoringSkeleton,
  resolveCardScoringComposition,
} from "./catalog";
import {
  applyCardScoringPreset,
  cardScoringPresets,
  matchingCardScoringPreset,
  setCardScoringModuleEnabled,
} from "./presets";
export const cardScoringDesign: CompositionDesign<CardModel> = {
  skeletonName: cardScoringSkeleton.name,
  layoutName: cardScoringLayout.name,
  description:
    "卡牌、牌库、选牌、基础计分与回合由骨架提供。模块统一参与规则、编辑与牌桌反馈，所有方案使用相同的保存和回放流程。",
  presetEffect:
    "应用预设仅切换计分模块，保留已有卡牌、牌库、奖励数值与回合配置。",
  presets: cardScoringPresets,
  modules: cardScoringModules,
  resolve: resolveCardScoringComposition,
  matchingPreset: matchingCardScoringPreset,
  applyPreset: applyCardScoringPreset,
  setModuleEnabled: setCardScoringModuleEnabled,
};
