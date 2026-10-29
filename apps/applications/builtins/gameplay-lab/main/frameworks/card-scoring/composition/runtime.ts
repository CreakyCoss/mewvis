import type { CardModel } from "../../../domains/card/model";
import {
  actionReason,
  choose,
  current,
  startRun,
  step,
  type Entry,
  type Run,
  type State,
} from "../../../domains/turn/engine";
import { validateModel } from "../../../domains/turn/model";
import { copy } from "../../../shared/utils";
import type { InitialPlayer } from "../../../validation/playtest/config";
import { assembleGameRuntime } from "../../composition/runtime";
import { sameJson } from "../../composition/resolve";
import {
  cardScoringConfigs,
  cardScoringModules,
  resolveCardScoringComposition,
} from "./catalog";
import type { CardScoringCommand, CardScoringView } from "./contracts";

export function cardScoringPlayerView(state: State, player: number): State {
  if (!Number.isInteger(player) || !state.players[player])
    throw new Error("玩家视角无效。");
  const view = copy(state);
  view.players.forEach((p, seat) =>
    Object.values(p.collections).forEach((pile) => {
      pile.draw = [];
      if (seat !== player) pile.hand = [];
    }),
  );
  return view;
}
export function createCardScoringRuntime(
  players = 1,
  initial?: InitialPlayer[],
) {
  return assembleGameRuntime<
    CardModel,
    Run,
    CardScoringCommand,
    Entry,
    CardScoringView
  >({
    core: {
      validate: validateModel,
      initialize: (model, seed) => startRun(model, seed, players, initial),
      advance: (model, run, command) => {
        if (command.type !== "action") throw new Error("操作未启用。");
        const state = step({ ...run, model }, command.choice);
        return { state, events: [state.entries.at(-1)!] };
      },
      observe: (_model, run, player) => {
        const state = current(run);
        return {
          player,
          step: run.entries.length - 1,
          state: cardScoringPlayerView(state, player),
          counts: state.players.map((p) =>
            Object.fromEntries(
              Object.entries(p.collections).map(([id, pile]) => [
                id,
                {
                  draw: pile.draw.length,
                  hand: pile.hand.length,
                  discard: pile.discard.length,
                },
              ]),
            ),
          ),
        };
      },
      commands: (model, view) => {
        if (view.state.actor !== view.player || view.state.outcome) return [];
        const commands: CardScoringCommand[] = [
          {
            type: "action",
            player: view.player,
            choice: { action: "__end_turn" },
          },
        ];
        for (const action of model.actions.filter(
          (action) => !actionReason(model, view.state, action),
        )) {
          const effect = action.effects.find((e) => e.type === "combination"),
            deck =
              effect && model.decks.find((d) => d.id === effect.collection);
          if (!deck) {
            commands.push({
              type: "action",
              player: view.player,
              choice: { action: action.id },
            });
            continue;
          }
          const hand =
            view.state.players[view.player].collections[deck.id].hand;
          function visit(at: number, ids: string[]) {
            if (ids.length >= deck!.minSelect)
              commands.push({
                type: "action",
                player: view.player,
                choice: { action: action.id, cards: [...ids] },
              });
            if (ids.length >= deck!.maxSelect) return;
            for (let i = at; i < hand.length; i++)
              visit(i + 1, [...ids, hand[i].id]);
          }
          visit(0, []);
        }
        return commands;
      },
      choose: (model, view) => {
        if (view.state.actor !== view.player || view.state.outcome)
          throw new Error("当前玩家不能行动。");
        const entry: Entry = {
          choice: null,
          actor: "",
          title: "",
          notes: [],
          state: view.state,
        };
        return {
          type: "action",
          player: view.player,
          choice: choose(
            {
              model,
              seed: 0,
              simulator: { id: "card-combination", version: 2 },
              entries: Array.from({ length: view.step + 1 }, () => entry),
            },
            "goal",
          ),
        };
      },
    },
    registry: cardScoringModules,
    resolve: resolveCardScoringComposition,
    configs: cardScoringConfigs,
    prepareCoreRules: (model) => {
      for (const action of model.actions)
        for (const effect of action.effects)
          if (effect.type === "combination") effect.pairBonus = 0;
      return model;
    },
    commandPlayer: (command) => command.player,
    timings: (view) =>
      !view.state.outcome && view.state.actor === view.player
        ? ["before-play"]
        : [],
    assertCommand: (run, command) => {
      if (
        !command ||
        command.player !== current(run).actor ||
        current(run).outcome
      )
        throw new Error("当前玩家不能执行操作。");
    },
    resetModules: () => false,
    completeModuleCommand: (run, events) => ({
      ...run,
      entries: [...run.entries, ...events],
    }),
  });
}
export const cardScoringRuntime = createCardScoringRuntime();
export const effectiveCardScoringRules = (model: CardModel) =>
  model.composition ? cardScoringRuntime.projectRules(model) : model;
export function cardScoringDecisionRun(run: Run): Run {
  if (run.model.format !== "gameplay-card-v1" || !run.model.composition)
    return run;
  const player = current(run).actor;
  return {
    ...run,
    model: effectiveCardScoringRules(run.model),
    entries: run.entries.map((entry) => ({
      ...entry,
      notes: [],
      choice: null,
      state: cardScoringPlayerView(entry.state, player),
    })),
  };
}
export function cardScoringRunSnapshot(run: Run) {
  if (run.model.format !== "gameplay-card-v1" || !run.model.composition)
    return {};
  const resolved = resolveCardScoringComposition(run.model);
  if (
    resolved.issues.length ||
    !sameJson(run.composition, resolved.snapshot) ||
    resolved.modules.some((module) => !Object.hasOwn(run, module.stateKey))
  )
    throw new Error("组合计分对局缺少有效的冻结组合或模块状态。");
  return {
    composition: copy(resolved.snapshot),
    moduleStates: Object.fromEntries(
      resolved.modules.map((module) => [
        module.stateKey,
        copy((run as unknown as Record<string, unknown>)[module.stateKey]),
      ]),
    ),
  };
}
