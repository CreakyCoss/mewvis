import { cardSimulator } from "../../domains/card/model";
import { startRun, step } from "../../domains/turn/engine";
import type { SimulatorDefinition } from "../numeric-runtime";
export const cardScoringSimulator: SimulatorDefinition = {
  ref: cardSimulator,
  name: "卡牌组合",
  description: "独立卡牌定义、按数量构建牌库、实体牌与可配置抽补牌规则。",
  validate(model) {
    if (model.format !== "gameplay-card-v1")
      return [
        {
          path: "卡牌模型",
          message: "该模拟器需要独立卡牌模型，请选择卡牌类型的项目。",
          view: "simulator",
        },
      ];
    return model.actions.some((action) =>
      action.effects.some((effect) => effect.type === "combination"),
    )
      ? []
      : [
          {
            path: "计分行动",
            message: "为一个行动添加组合计分效果，选择牌库和得分状态。",
            view: "model",
            nodeId: model.actions[0]?.id,
          },
        ];
  },
  initialize: startRun,
  advance: step,
};
