import type { ModuleRuntime } from "../../../composition/contracts";
import type { DoudizhuModel } from "../../model";
import type {
  DoudizhuCommand,
  DoudizhuEvent,
  DoudizhuState,
  DoudizhuView,
} from "../../runtime/contracts";
import {
  createHeroesConfig,
  validateHeroes,
  type HeroesConfig,
  type HeroesState,
  type HeroesView,
} from "./model";
import { heroCommands, revealHeroCards, type HeroCommand } from "./runtime";

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

export const heroesModule: ModuleRuntime<
  DoudizhuModel,
  DoudizhuState,
  DoudizhuCommand,
  DoudizhuEvent,
  DoudizhuView
> = {
  definition: {
    id: "heroes",
    version: 1,
    name: "英雄与技能",
    description: "为三位玩家配置英雄，在自己的出牌回合洞察另一名玩家的手牌。",
    skeleton: { id: "doudizhu", version: 1 },
    requires: [
      "turns",
      "player-observation",
      "opponent-target",
      "deterministic-random",
    ],
    dependsOn: [],
    timings: ["before-play"],
    slots: ["before-hand", "opponent"],
  },
  stateKey: "heroes",
  commandTypes: ["skill"],
  createConfig: createHeroesConfig,
  validate: validateHeroes,
  initialize: () =>
    ({ used: [0, 0, 0], reveals: [[], [], []] }) satisfies HeroesState,
  observe: ({ value, player }) => {
    const state = value as HeroesState;
    return {
      used: state.used,
      reveals: state.reveals[player],
    } satisfies HeroesView;
  },
  commands: ({ model, view }) => heroCommands(model, view),
  advance: ({ state, config, value, command }) => {
    if (command.type !== "skill") throw new Error("英雄模块不支持该命令。");
    const heroes = value as HeroesState,
      skill = (config as HeroesConfig).seats[command.player].skill;
    const cards = revealHeroCards(
      state.hands[command.target],
      skill.count,
      state.seed +
        Math.imul(state.deal + 1, 2654435761) +
        Math.imul(state.steps + 1, 2246822519) +
        command.player * 31 +
        command.target,
    );
    heroes.used[command.player]++;
    heroes.reveals[command.player].push({
      target: command.target,
      step: state.steps + 1,
      cards,
    });
    return {
      state,
      value: heroes,
      events: [
        {
          type: "skill",
          player: command.player,
          text:
            "玩家 " +
            (command.player + 1) +
            " 使用「" +
            skill.name +
            "」，查看了玩家 " +
            (command.target + 1) +
            " 的 " +
            cards.length +
            " 张手牌。",
        },
      ],
    };
  },
  choose: ({ view, commands }) =>
    commands
      .filter((c) => c.type === "skill")
      .filter(
        (c) => view.player === view.landlord || c.target === view.landlord,
      )
      .sort((a, b) => view.counts[a.target] - view.counts[b.target])[0],
  describeCommand: (command) =>
    command.type === "skill"
      ? "使用技能，目标玩家 " + (command.target + 1)
      : "英雄操作",
};
