import { assembleGameRuntime } from "../../composition/runtime";
import { chooseDoudizhuCore } from "../bots/core";
import {
  doudizhuModules,
  resolveDoudizhuComposition,
} from "../composition/catalog";
import type { DoudizhuModel } from "../model";
import { doudizhuCoreCommands } from "../rules/core-commands";
import { validateDoudizhuCore } from "../validation-core";
import type {
  DoudizhuCommand,
  DoudizhuEvent,
  DoudizhuState,
  DoudizhuView,
} from "./contracts";
import {
  advanceDoudizhuCore,
  observeDoudizhuCore,
  startDoudizhuCore,
} from "./core";
export type {
  DoudizhuCommand,
  DoudizhuEvent,
  DoudizhuState,
  DoudizhuView,
} from "./contracts";

export const doudizhuRuntime = assembleGameRuntime<
  DoudizhuModel,
  DoudizhuState,
  DoudizhuCommand,
  DoudizhuEvent,
  DoudizhuView
>({
  core: {
    validate: validateDoudizhuCore,
    initialize: startDoudizhuCore,
    advance: advanceDoudizhuCore,
    observe: observeDoudizhuCore,
    commands: doudizhuCoreCommands,
    choose: chooseDoudizhuCore,
  },
  registry: doudizhuModules,
  resolve: resolveDoudizhuComposition,
  configs: (model) => model.extensions,
  commandPlayer: (command) => command.player,
  timings: (view) =>
    view.phase === "playing" && view.actor === view.player
      ? ["before-play"]
      : [],
  assertCommand: (state, command) => {
    if (
      !command ||
      command.player !== state.actor ||
      state.phase === "finished"
    )
      throw new Error("当前不能执行该玩家的操作。");
    if (state.steps >= 1000) throw new Error("本局超过 1000 步，请新开一局。");
  },
  resetModules: (before, after) => before.deal !== after.deal,
  completeModuleCommand: (state, events) => ({
    ...state,
    steps: state.steps + 1,
    message: events.map((event) => event.text).join(" "),
  }),
});
export const startDoudizhu = doudizhuRuntime.initialize;
export const advanceDoudizhu = doudizhuRuntime.advance;
export const observeDoudizhu = doudizhuRuntime.observe;
