import type { CardModel } from "../../../domains/card/model";
import type {
  SkeletonDefinition,
  LayoutDefinition,
} from "../../composition/contracts";
import { resolveGameComposition } from "../../composition/resolve";
import { cardHeroesModule } from "../extensions/heroes/module";
import { pairRewardModule } from "../extensions/pair-reward/module";
export const cardScoringSkeleton: SkeletonDefinition = {
  id: "card-scoring",
  version: 1,
  name: "组合计分",
  capabilities: [
    "combination-scoring",
    "turns",
    "player-observation",
    "deterministic-random",
    "hand-zones",
    "opponent-target",
  ],
  timings: ["rule-compile", "before-play"],
  commandTypes: ["action"],
  stateKeys: [
    "model",
    "seed",
    "simulator",
    "composition",
    "initial",
    "entries",
  ],
};
export const cardScoringLayout: LayoutDefinition = {
  id: "scoring-table",
  version: 1,
  name: "组合计分牌桌",
  skeleton: { id: "card-scoring", version: 1 },
  slots: ["score-detail", "before-hand", "opponent"],
};
export const cardScoringModules = [pairRewardModule, cardHeroesModule] as const;
export function cardScoringConfigs(model: CardModel): Record<string, unknown> {
  if (model.extensions !== undefined) return model.extensions;
  if (model.composition !== undefined) return {};
  const enabled = model.actions?.some((a) =>
    a.effects?.some((e) => e.type === "combination" && (e.pairBonus ?? 15) > 0),
  );
  return enabled ? { "pair-reward": pairRewardModule.createConfig() } : {};
}
export const resolveCardScoringComposition = (
  model: CardModel,
  draft = false,
) =>
  resolveGameComposition(
    model?.composition,
    model ? cardScoringConfigs(model) : undefined,
    cardScoringSkeleton,
    cardScoringLayout,
    cardScoringModules,
    draft,
  );
