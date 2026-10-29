import type { CardModel } from "../../../../domains/card/model";
import type { Entry, Run } from "../../../../domains/turn/engine";
import type { ModuleRuntime } from "../../../composition/contracts";
import type {
  CardScoringCommand,
  CardScoringView,
} from "../../composition/contracts";
export const pairRewardModule: ModuleRuntime<
  CardModel,
  Run,
  CardScoringCommand,
  Entry,
  CardScoringView
> = {
  definition: {
    id: "pair-reward",
    version: 1,
    name: "配对奖励",
    description: "按每次提交的同组配对数增加奖励，再与基础分一起计算倍率。",
    skeleton: { id: "card-scoring", version: 1 },
    requires: ["combination-scoring"],
    dependsOn: [],
    timings: ["rule-compile"],
    slots: ["score-detail"],
  },
  stateKey: "pair-reward",
  commandTypes: [],
  createConfig: () => ({ version: 1, enabled: true }),
  validate: (input) => {
    const config = input as { version?: unknown; enabled?: unknown };
    return !config ||
      typeof config !== "object" ||
      Array.isArray(config) ||
      config.version !== 1 ||
      typeof config.enabled !== "boolean" ||
      Object.keys(config).some((key) => !["version", "enabled"].includes(key))
      ? [{ path: "配对奖励", message: "配对奖励模块配置或版本不受支持。" }]
      : [];
  },
  projectRules: ({ model, rules }) => {
    for (const action of rules.actions)
      for (const effect of action.effects)
        if (effect.type === "combination") {
          const source = model.actions
            .find((item) => item.id === action.id)
            ?.effects.find((item) => item.type === "combination");
          effect.pairBonus =
            source?.type === "combination" ? (source.pairBonus ?? 15) : 0;
        }
    return rules;
  },
  initialize: () => null,
  observe: () => ({ enabled: true }),
  commands: () => [],
  advance: () => {
    throw new Error("配对奖励随计分结算，不接受独立操作。");
  },
};
