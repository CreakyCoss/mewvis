import { startRun, step } from "../../domains/turn/engine";
import type { ReadinessIssue } from "../../shared/contracts";
import type { SimulatorDefinition } from "../numeric-runtime";
export const resourceSimulator: SimulatorDefinition = {
  ref: { id: "resource-turns", version: 1 },
  name: "回合发展",
  description: "通过资源投入、周期产出、能力解锁和目标竞速验证回合玩法。",
  validate(model) {
    const issues: ReadinessIssue[] = [];
    if (model.format === "gameplay-card-v1" || model.collections.length)
      issues.push({
        path: "集合",
        message: "回合发展不支持牌池，请选择卡牌组合模拟器，或移除集合。",
        view: "rules",
      });
    for (const a of model.actions)
      if (a.effects.some((e) => e.type === "combination"))
        issues.push({
          path: a.id,
          message: "组合计分需要卡牌组合模拟器。",
          view: "model",
          nodeId: a.id,
        });
    return issues;
  },
  initialize: startRun,
  advance: step,
};
