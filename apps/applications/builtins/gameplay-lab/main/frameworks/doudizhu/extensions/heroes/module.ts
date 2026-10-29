import { queryHandCards } from "../../../../domains/card/primitives";
import { createHeroesModule } from "../../../modules/heroes/runtime";
import type { DoudizhuModel } from "../../model";
import type {
  DoudizhuCommand,
  DoudizhuEvent,
  DoudizhuState,
  DoudizhuView,
} from "../../runtime/contracts";
import { type HeroesConfig, type HeroesState, type HeroesView } from "./model";
import type { HeroCommand } from "./runtime";

declare module "../../model" {
  interface DoudizhuModuleConfigs {
    heroes: HeroesConfig;
  }
}
declare module "../../runtime/contracts" {
  interface DoudizhuModuleCommands {
    heroes: HeroCommand;
  }
  interface DoudizhuModuleEvents {
    heroes: {
      type: "skill";
      text: string;
      player?: number;
      cards?: import("../../model").PokerCard[];
    };
  }
  interface DoudizhuState {
    heroes?: HeroesState;
  }
  interface DoudizhuView {
    heroes?: HeroesView;
  }
}

export const heroesModule = createHeroesModule<
  DoudizhuModel,
  DoudizhuState,
  Exclude<DoudizhuCommand, HeroCommand>,
  DoudizhuEvent,
  DoudizhuView,
  import("../../model").PokerCard
>({
  seats: 3,
  config: (model) => model.extensions.heroes,
  window: (view) => ({
    ...view,
    timing: view.phase === "playing" ? "before-play" : null,
  }),
  context: (state, player) => ({
    player,
    actor: state.actor,
    timing: state.phase === "playing" ? "before-play" : null,
    counts: state.hands.map((hand) => hand.length),
  }),
  hand: (state, player) => queryHandCards([{ hand: state.hands[player] }]),
  position: (state, command) => ({
    seed:
      state.seed +
      Math.imul(state.deal + 1, 2654435761) +
      Math.imul(state.steps + 1, 2246822519) +
      command.player * 31 +
      command.target,
    step: state.steps + 1,
  }),
  event: (_state, command, text) => ({
    type: "skill",
    player: command.player,
    text,
  }),
  choose: (view, commands) =>
    commands
      .filter(
        (c) => view.player === view.landlord || c.target === view.landlord,
      )
      .sort((a, b) => view.counts[a.target] - view.counts[b.target])[0],
});
