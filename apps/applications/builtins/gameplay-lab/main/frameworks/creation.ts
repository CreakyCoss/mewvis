import type { DesignModel } from "../app/projects/model";
import type { CardModel } from "../domains/card/model";
import { blankNarrative } from "./branching-story/model";
import {
  cardScoringPresets,
  applyCardScoringPreset,
} from "./card-scoring/composition/presets";
import { createCardScoringModel } from "./card-scoring/structure";
import type { PresetSummary } from "./composition/contracts";
import type { FrameworkId } from "./contracts";
import { doudizhuPresets } from "./doudizhu/composition/presets";
import { createDoudizhuModel } from "./doudizhu/model";
import { blankModel } from "./numeric-runtime";

export interface FrameworkCreation {
  presets: readonly PresetSummary[];
  hint: string;
  create(name: string, presetId?: string): DesignModel;
  prepareExample?(model: DesignModel): DesignModel;
}
const registrations: Record<FrameworkId, FrameworkCreation> = {
  doudizhu: {
    presets: doudizhuPresets,
    hint: "保留固定 54 张牌和叫分流程，直接调整自己的出牌及结算规则。",
    create: createDoudizhuModel,
  },
  "card-scoring": {
    presets: cardScoringPresets,
    hint: "准备计分结构与空牌库，填写自己的卡牌，按需启用兼容模块。",
    create: (name, preset = "paired-scoring") => {
      const model = createCardScoringModel(name);
      applyCardScoringPreset(model, preset);
      return model;
    },
    prepareExample: (input) => {
      const model = structuredClone(input) as CardModel;
      if (model.format !== "gameplay-card-v1")
        throw new Error("示例与玩法框架不兼容。");
      applyCardScoringPreset(model, "paired-scoring");
      return model;
    },
  },
  "resource-development": {
    presets: [],
    hint: "保留框架所需结构，从自己的内容开始设计。",
    create: blankModel,
  },
  "branching-story": {
    presets: [],
    hint: "保留叙事结构，从自己的场景、选项与人物开始设计。",
    create: blankNarrative,
  },
};
export const frameworkCreation = (id: FrameworkId | null | undefined) =>
  id ? registrations[id] : undefined;
