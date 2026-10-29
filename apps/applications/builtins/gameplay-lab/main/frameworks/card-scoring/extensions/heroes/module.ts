import { queryHandCards } from "../../../../domains/card/primitives";
import { current, type Entry, type Run } from "../../../../domains/turn/engine";
import type { Card } from "../../../../domains/turn/model";
import type { CardModel } from "../../../../domains/card/model";
import { copy } from "../../../../shared/utils";
import {
  createHeroesModule,
  type HeroCommand,
} from "../../../modules/heroes/runtime";
import type { HeroesConfig, HeroesView } from "../../../modules/heroes/model";
import type {
  CardActionCommand,
  CardScoringView,
} from "../../composition/contracts";

declare module "../../composition/contracts" {
  interface CardScoringModuleCommands {
    heroes: HeroCommand;
  }
  interface CardScoringView {
    heroes?: HeroesView<Card>;
  }
}
export const cardHeroesConfig = (model: CardModel) =>
  model.extensions?.heroes as HeroesConfig | undefined;
export const cardHeroesWindow = (view: CardScoringView) => ({
  player: view.player,
  actor: view.state.actor,
  timing: view.state.outcome ? null : "before-play",
  heroes: view.heroes,
  counts: view.counts.map((decks) =>
    Object.values(decks).reduce((sum, pile) => sum + pile.hand, 0),
  ),
});
export const cardHeroesModule = createHeroesModule<
  CardModel,
  Run,
  CardActionCommand,
  Entry,
  CardScoringView,
  Card
>({
  seats: 2,
  config: cardHeroesConfig,
  window: cardHeroesWindow,
  context: (run, player) => ({
    player,
    actor: current(run).actor,
    timing: current(run).outcome ? null : "before-play",
    counts: current(run).players.map((p) =>
      Object.values(p.collections).reduce(
        (sum, pile) => sum + pile.hand.length,
        0,
      ),
    ),
  }),
  hand: (run, player) =>
    queryHandCards(Object.values(current(run).players[player].collections)),
  position: (run, command) => ({
    step: run.entries.length,
    seed:
      run.seed +
      Math.imul(current(run).round, 2654435761) +
      Math.imul(run.entries.length, 2246822519) +
      command.player * 31 +
      command.target,
  }),
  event: (run, command, text) => ({
    choice: { action: "__module", command: copy(command) },
    actor: current(run).players[command.player].name,
    title: "使用技能",
    notes: [text],
    state: {
      ...copy(current(run)),
      ...(run.entries.length >= 200
        ? {
            outcome: {
              kind: "limit" as const,
              winners: [],
              reason: "达到 200 步计算预算。",
            },
          }
        : {}),
    },
  }),
});
