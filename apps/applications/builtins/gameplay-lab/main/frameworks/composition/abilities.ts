import { sameJson } from "./resolve";

export interface AbilityCommand<Type extends string = "skill"> {
  type: Type;
  player: number;
  skillId: string;
  target: number;
}
export interface AbilityWindow {
  player: number;
  actor: number;
  timing: string | null;
  counts: readonly number[];
}
export interface ActiveAbility {
  id: string;
  timing: string;
  uses: number;
  target?: "self" | "opponent";
}

export function activeAbilityCommands<Type extends string = "skill">(
  ability: ActiveAbility | undefined,
  used: number | undefined,
  window: AbilityWindow,
  type: Type = "skill" as Type,
): AbilityCommand<Type>[] {
  if (
    !ability ||
    used === undefined ||
    !Number.isInteger(used) ||
    used < 0 ||
    used >= ability.uses ||
    window.actor !== window.player ||
    window.timing !== ability.timing
  )
    return [];
  return window.counts.flatMap((count, target) =>
    (
      ability.target === "self"
        ? target === window.player
        : target !== window.player && count > 0
    )
      ? [
          {
            type,
            player: window.player,
            skillId: ability.id,
            target,
          },
        ]
      : [],
  );
}

/** Resolve on copies. Usage is committed only after the complete effect succeeds. */
export function resolveActiveAbility<T, Type extends string = "skill">(
  ability: ActiveAbility,
  used: number,
  window: AbilityWindow,
  command: AbilityCommand<Type>,
  effect: () => T,
): { used: number; result: T } {
  if (
    !activeAbilityCommands(ability, used, window, command.type).some((c) =>
      sameJson(c, command),
    )
  )
    throw new Error("技能的时机、目标或剩余次数无效。");
  const result = effect();
  return { used: used + 1, result };
}
