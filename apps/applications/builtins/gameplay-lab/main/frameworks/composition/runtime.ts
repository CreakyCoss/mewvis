import { copy } from "../../shared/utils";
import type { GameRuntime } from "../runtime-contracts";
import type { ModuleRuntime, ResolvedComposition } from "./contracts";
import { sameJson } from "./resolve";

export function moduleValue(value: object, key: string): unknown {
  return (value as Record<string, unknown>)[key];
}
function withModuleValue<T extends object>(
  state: T,
  key: string,
  value: unknown,
): T {
  return Object.assign(state, { [key]: value });
}

export function assembleGameRuntime<
  M,
  S extends object,
  C extends { type: string },
  E,
  V extends object,
>(options: {
  core: GameRuntime<M, S, C, E, V>;
  registry: readonly ModuleRuntime<M, S, C, E, V>[];
  resolve(model: M, draft?: boolean): ResolvedComposition<M, S, C, E, V>;
  configs(model: M): Record<string, unknown>;
  commandPlayer(command: C): number;
  timings(view: V): readonly string[];
  assertCommand(state: S, command: C): void;
  resetModules(before: S, after: S): boolean;
  completeModuleCommand(state: S, events: E[]): S;
}) {
  const { core, resolve, configs } = options;
  function resolved(model: M) {
    const result = resolve(model);
    if (result.issues.length)
      throw new Error(result.issues.map((i) => i.message).join(" "));
    return result;
  }
  const validate = (model: M, draft = false) => [
    ...core.validate(model, draft),
    ...resolve(model, draft).issues,
  ];
  function initialize(model: M, seed: number): S {
    const issues = validate(model);
    if (issues.length) throw new Error(issues.map((i) => i.message).join(" "));
    let state = core.initialize(model, seed);
    for (const module of resolved(model).modules)
      state = withModuleValue(
        state,
        module.stateKey,
        module.initialize({
          model,
          state,
          config: configs(model)[module.definition.id],
        }),
      );
    return state;
  }
  function observe(model: M, state: S, player: number): V {
    const base = copy(state);
    for (const module of options.registry)
      delete (base as Record<string, unknown>)[module.stateKey];
    let view = core.observe(model, base, player);
    for (const module of resolved(model).modules)
      view = withModuleValue(
        view,
        module.stateKey,
        module.observe({
          model,
          state: copy(state),
          player,
          config: configs(model)[module.definition.id],
          value: copy(moduleValue(state, module.stateKey)),
        }),
      );
    return view;
  }
  function moduleCommands(
    module: ModuleRuntime<M, S, C, E, V>,
    model: M,
    view: V,
  ): C[] {
    if (
      !module.definition.timings.some((t) => options.timings(view).includes(t))
    )
      return [];
    return module.commands({
      model,
      view,
      config: configs(model)[module.definition.id],
      value: moduleValue(view, module.stateKey),
    });
  }
  function commands(model: M, view: V): C[] {
    return [
      ...resolved(model).modules.flatMap((m) => moduleCommands(m, model, view)),
      ...core.commands(model, view),
    ];
  }
  function advance(model: M, state: S, command: C): { state: S; events: E[] } {
    options.assertCommand(state, command);
    const modules = resolved(model).modules,
      module = modules.find((m) => m.commandTypes.includes(command.type));
    if (module) {
      const view = observe(model, state, options.commandPlayer(command));
      if (
        !moduleCommands(module, model, view).some((candidate) =>
          sameJson(candidate, command),
        )
      )
        throw new Error("模块操作未启用、次数已用完、时机或目标无效。");
      const result = module.advance({
        model,
        state: copy(state),
        command,
        config: configs(model)[module.definition.id],
        value: copy(moduleValue(state, module.stateKey)),
      });
      return {
        state: options.completeModuleCommand(
          withModuleValue(result.state, module.stateKey, result.value),
          result.events,
        ),
        events: result.events,
      };
    }
    const result = core.advance(model, state, command);
    if (options.resetModules(state, result.state))
      for (const item of modules)
        withModuleValue(
          result.state,
          item.stateKey,
          item.initialize({
            model,
            state: result.state,
            config: configs(model)[item.definition.id],
          }),
        );
    return result;
  }
  function choose(model: M, view: V, useModules = true): C {
    if (useModules)
      for (const module of resolved(model).modules) {
        const legal = moduleCommands(module, model, view),
          command = module.choose?.({
            model,
            view,
            config: configs(model)[module.definition.id],
            value: moduleValue(view, module.stateKey),
            commands: legal,
          });
        if (command) {
          if (!legal.some((candidate) => sameJson(candidate, command)))
            throw new Error("模块自动玩家返回了非法命令。");
          return command;
        }
      }
    return core.choose(model, view);
  }
  return { validate, initialize, observe, advance, commands, choose };
}
