import type { CardScoringCommand } from "./composition/contracts";
import { cardSimulator } from "../../domains/card/model";
import { startRun, step } from "../../domains/turn/engine";
import type { SimulatorDefinition } from "../numeric-runtime";
import { copy } from "../../shared/utils";
import { sameJson } from "../composition/resolve";
import { resolveCardScoringComposition } from "./composition/catalog";
import {
  cardScoringDecisionRun,
  checkpointCardScoringRun,
  cardScoringModuleChoice,
  createCardScoringRuntime,
} from "./composition/runtime";
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
    const compositionIssues = resolveCardScoringComposition(model).issues.map(
      (issue) => ({ ...issue, view: "rules" as const }),
    );
    return [
      ...compositionIssues,
      ...(model.actions.some((action) =>
        action.effects.some((effect) => effect.type === "combination"),
      )
        ? []
        : [
            {
              path: "计分行动",
              message: "为一个行动添加组合计分效果，选择牌库和得分状态。",
              view: "model" as const,
              nodeId: model.actions[0]?.id,
            },
          ]),
    ];
  },
  initialize: (model, seed = 42, players = 1, initial) => {
    if (model.format !== "gameplay-card-v1" || !model.composition)
      return startRun(model, seed, players, initial);
    const run = createCardScoringRuntime(players, initial).initialize(
      model,
      seed,
    );
    return checkpointCardScoringRun({
      ...run,
      model: copy(model),
      composition: copy(resolveCardScoringComposition(model).snapshot),
    });
  },
  advance: (run, choice) => {
    if (run.model.format !== "gameplay-card-v1" || !run.model.composition)
      return step(run, choice);
    const expected = resolveCardScoringComposition(run.model).snapshot;
    if (!sameJson(run.composition, expected))
      throw new Error("对局组合快照与冻结规则不一致。");
    if (
      (choice.command && choice.action !== "__module") ||
      (choice.command && choice.cards !== undefined)
    )
      throw new Error("模块命令格式无效。");
    const command = choice.command
      ? (choice.command as CardScoringCommand)
      : {
          type: "action" as const,
          player: run.entries.at(-1)!.state.actor,
          choice,
        };
    if (choice.command && command.type === "action")
      throw new Error("模块命令不能代替普通行动。");
    const next = createCardScoringRuntime().advance(
      run.model,
      run,
      command,
    ).state;
    return checkpointCardScoringRun({
      ...next,
      model: copy(run.model),
      composition: copy(expected),
    });
  },
  prepareDecision: cardScoringDecisionRun,
  chooseModule: cardScoringModuleChoice,
};
