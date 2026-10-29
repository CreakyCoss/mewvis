import type {
  LayoutDefinition,
  SkeletonDefinition,
} from "../../composition/contracts";
import { resolveGameComposition } from "../../composition/resolve";
import { heroesModule } from "../extensions/heroes/module";
import type { DoudizhuModel } from "../model";

export const doudizhuSkeleton: SkeletonDefinition = {
  id: "doudizhu",
  version: 1,
  name: "斗地主",
  capabilities: [
    "turns",
    "player-observation",
    "opponent-target",
    "deterministic-random",
    "hand-zones",
  ],
  timings: ["before-play"],
  commandTypes: ["bid", "play", "pass"],
  stateKeys: [
    "seed",
    "deal",
    "phase",
    "actor",
    "hands",
    "kitty",
    "landlord",
    "bid",
    "bidder",
    "bids",
    "last",
    "passes",
    "multiplier",
    "steps",
    "message",
    "actions",
    "outcome",
    "player",
    "hand",
    "counts",
  ],
};
export const doudizhuLayout: LayoutDefinition = {
  id: "three-player-table",
  version: 1,
  name: "三人牌桌",
  skeleton: { id: "doudizhu", version: 1 },
  slots: ["before-hand", "opponent"],
};
// The only framework-specific runtime registration point for optional modules.
export const doudizhuModules = [heroesModule] as const;
export const resolveDoudizhuComposition = (
  model: DoudizhuModel,
  draft = false,
) =>
  resolveGameComposition(
    model?.composition,
    model?.extensions,
    doudizhuSkeleton,
    doudizhuLayout,
    doudizhuModules,
    draft,
  );
