import type { CardModel } from "../../../../domains/card/model";
import { current, type Run, type Entry } from "../../../../domains/turn/engine";
import { copy } from "../../../../shared/utils";
import type { ModuleRuntime } from "../../../composition/contracts";
import type {
  CardScoringCommand,
  CardScoringView,
} from "../../composition/contracts";
import {
  cardAbilitiesConfig,
  createCardAbilitiesConfig,
  validateCardAbilities,
  type CardAbilitiesConfig,
  type CardAbilitiesState,
} from "./model";
import {
  cardAbilityCommands,
  executeCardAbility,
  expireCardFocus,
  type CardAbilityCommand,
} from "./runtime";

declare module "../../composition/contracts" {
  interface CardScoringModuleCommands {
    cardAbilities: CardAbilityCommand;
  }
  interface CardScoringView {
    "card-abilities"?: CardAbilitiesState;
  }
}
export const cardAbilitiesModule: ModuleRuntime<
  CardModel,
  Run,
  CardScoringCommand,
  Entry,
  CardScoringView
> = {
  definition: {
    id: "card-abilities",
    version: 1,
    name: "卡牌能力",
    description:
      "配置自己的抽牌、选牌弃牌、资源费用和限时专注；每项能力独立限制次数。",
    skeleton: { id: "card-scoring", version: 1 },
    requires: [
      "turns",
      "player-observation",
      "hand-zones",
      "draw-piles",
      "deterministic-random",
      "resource-values",
      "turn-end",
    ],
    dependsOn: [],
    timings: ["before-play", "after-command"],
    slots: ["before-hand"],
  },
  stateKey: "card-abilities",
  commandTypes: ["card-ability"],
  createConfig: createCardAbilitiesConfig,
  validate: validateCardAbilities,
  references: (config) =>
    (config as CardAbilitiesConfig).abilities.flatMap((a) => [
      ...(a.draw || a.discard
        ? [{ target: a.deck, owner: `卡牌能力「${a.name}」` }]
        : []),
      ...(a.cost
        ? [{ target: a.cost.field, owner: `卡牌能力「${a.name}」费用` }]
        : []),
    ]),
  initialize: ({ state, config }) =>
    ({
      used: current(state).players.map(() =>
        Object.fromEntries(
          (config as CardAbilitiesConfig).abilities.map((a) => [a.id, 0]),
        ),
      ),
      focus: current(state).players.map(() => null),
    }) satisfies CardAbilitiesState,
  observe: ({ value }) => copy(value),
  commands: ({ model, view, config }) =>
    cardAbilityCommands(model, view, (config as CardAbilitiesConfig).abilities),
  advance: ({ model, state, value, config, command }) => {
    if (command.type !== "card-ability")
      throw new Error("卡牌能力不支持该命令。");
    const ability = (config as CardAbilitiesConfig).abilities.find(
      (a) => a.id === command.skillId,
    );
    if (!ability) throw new Error("能力不存在。");
    return executeCardAbility(
      model,
      state,
      value as CardAbilitiesState,
      ability,
      command,
    );
  },
  afterAdvance: ({ before, state, value, command, events }) => {
    const endsTurn =
      command.type === "action" &&
      (command.choice.action === "__end_turn" ||
        current(before).remaining === 1);
    const result = expireCardFocus(
      current(before),
      current(state),
      value as CardAbilitiesState,
      endsTurn,
    );
    if (!result.text) return { state, value: result.value, events };
    const entry = {
      ...state.entries.at(-1)!,
      notes: [...state.entries.at(-1)!.notes, result.text],
    };
    return {
      state: { ...state, entries: [...state.entries.slice(0, -1), entry] },
      value: result.value,
      events: [entry],
    };
  },
  choose: ({ model, view, commands }) => {
    const config = cardAbilitiesConfig(model)!;
    const hand = Object.values(
      view.state.players[view.player].collections,
    ).flatMap((p) => p.hand);
    const rank = (command: CardAbilityCommand) => {
      const ability = config.abilities.find((a) => a.id === command.skillId)!;
      return (
        (ability.focus ? 1000 : 0) +
        ability.draw * 10 -
        command.cards.reduce(
          (sum, id) => sum + (hand.find((c) => c.id === id)?.value ?? 0),
          0,
        )
      );
    };
    return commands
      .filter((c): c is CardAbilityCommand => c.type === "card-ability")
      .sort((a, b) => rank(b) - rank(a))[0];
  },
  describeCommand: (command) =>
    command.type === "card-ability"
      ? "使用卡牌能力，弃牌 " + command.cards.length + " 张"
      : "卡牌能力操作",
};
