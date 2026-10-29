import {
  nextCardRandom,
  shuffleCardItems,
} from "../../../domains/card/primitives";
import {
  activeAbilityCommands,
  resolveActiveAbility,
  type AbilityCommand,
  type AbilityWindow,
} from "../../composition/abilities";
import type {
  ModuleRuntime,
  ModuleDefinition,
} from "../../composition/contracts";
import {
  createHeroesConfig,
  validateHeroes,
  type HeroesConfig,
  type HeroesState,
  type HeroesView,
} from "./model";

export type HeroCommand = AbilityCommand;
export interface HeroesWindow<Card> extends AbilityWindow {
  heroes?: HeroesView<Card>;
}

export function heroAbilityCommands<Card>(
  config: HeroesConfig | undefined,
  window: HeroesWindow<Card>,
): HeroCommand[] {
  return config?.enabled
    ? activeAbilityCommands(
        config.seats[window.player]?.skill,
        window.heroes?.used[window.player],
        window,
      )
    : [];
}

// Keep the original seeded order so previously saved Doudizhu games replay exactly.
export function revealHeroCards<Card extends { id: string }>(
  hand: readonly Card[],
  count: number,
  seed: number,
): Card[] {
  let random = seed >>> 0;
  return shuffleCardItems(
    [...hand].sort((a, b) => a.id.localeCompare(b.id)),
    () => {
      random = nextCardRandom(random);
      return random / 4294967296;
    },
  ).slice(0, count);
}

export const heroesDefinition: ModuleDefinition = {
  id: "heroes",
  version: 1,
  name: "英雄与技能",
  description: "为玩家配置英雄，在自己的行动前洞察另一名玩家的手牌。",
  requires: [
    "turns",
    "player-observation",
    "opponent-target",
    "deterministic-random",
    "hand-zones",
  ],
  dependsOn: [],
  timings: ["before-play"],
  slots: ["before-hand", "opponent"],
};

/** Each skeleton supplies card access and public events; skill rules have one implementation. */
export function createHeroesModule<
  M,
  S,
  C extends { type: string },
  E,
  V,
  Card extends { id: string },
>(adapter: {
  seats: number;
  config(model: M): HeroesConfig | undefined;
  window(view: V): HeroesWindow<Card>;
  context(state: S, player: number): AbilityWindow;
  hand(state: S, player: number): readonly Card[];
  position(state: S, command: HeroCommand): { seed: number; step: number };
  event(state: S, command: HeroCommand, text: string): E;
  choose?(view: V, commands: HeroCommand[]): HeroCommand | undefined;
}): ModuleRuntime<M, S, C | HeroCommand, E, V> {
  return {
    definition: heroesDefinition,
    stateKey: "heroes",
    commandTypes: ["skill"],
    createConfig: () => createHeroesConfig(adapter.seats),
    validate: (config, draft) => validateHeroes(config, draft, adapter.seats),
    initialize: ({ state }) => {
      const players = adapter.context(state, 0).counts.length;
      return {
        used: Array(players).fill(0),
        reveals: Array.from({ length: players }, () => []),
      } satisfies HeroesState<Card>;
    },
    observe: ({ value, player }) => {
      const heroes = value as HeroesState<Card>;
      return {
        used: heroes.used,
        reveals: heroes.reveals[player],
      } satisfies HeroesView<Card>;
    },
    commands: ({ model, view }) =>
      heroAbilityCommands(adapter.config(model), adapter.window(view)),
    advance: ({ state, config, value, command }) => {
      if (command.type !== "skill") throw new Error("英雄模块不支持该命令。");
      const skillCommand = command as HeroCommand;
      const heroes = value as HeroesState<Card>,
        skill = (config as HeroesConfig).seats[skillCommand.player].skill;
      const position = adapter.position(state, skillCommand);
      const resolved = resolveActiveAbility(
        skill,
        heroes.used[skillCommand.player],
        adapter.context(state, skillCommand.player),
        skillCommand,
        () =>
          revealHeroCards(
            adapter.hand(state, skillCommand.target),
            skill.count,
            position.seed,
          ),
      );
      heroes.used[skillCommand.player] = resolved.used;
      heroes.reveals[skillCommand.player].push({
        target: skillCommand.target,
        step: position.step,
        cards: resolved.result,
      });
      const text =
        "玩家 " +
        (skillCommand.player + 1) +
        " 使用「" +
        skill.name +
        "」，查看了玩家 " +
        (skillCommand.target + 1) +
        " 的 " +
        resolved.result.length +
        " 张手牌。";
      return {
        state,
        value: heroes,
        events: [adapter.event(state, skillCommand, text)],
      };
    },
    choose: ({ view, commands }) => {
      const legal = commands.filter(
        (c): c is HeroCommand => c.type === "skill",
      );
      return adapter.choose
        ? adapter.choose(view, legal)
        : legal.sort(
            (a, b) =>
              adapter.window(view).counts[a.target] -
              adapter.window(view).counts[b.target],
          )[0];
    },
    describeCommand: (command) =>
      command.type === "skill"
        ? "使用技能，目标玩家 " + ((command as HeroCommand).target + 1)
        : "英雄操作",
  };
}
