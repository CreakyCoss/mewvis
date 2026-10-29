import { sameJson } from "./resolve";

export interface AbilityCommand {
  type: "skill";
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
}

export function activeAbilityCommands(
  ability: ActiveAbility | undefined,
  used: number | undefined,
  window: AbilityWindow,
): AbilityCommand[] {
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
    target !== window.player && count > 0
      ? [
          {
            type: "skill" as const,
            player: window.player,
            skillId: ability.id,
            target,
          },
        ]
      : [],
  );
}

/** Resolve on copies. Usage is committed only after the complete effect succeeds. */
export function resolveActiveAbility<T>(
  ability: ActiveAbility,
  used: number,
  window: AbilityWindow,
  command: AbilityCommand,
  effect: () => T,
): { used: number; result: T } {
  if (
    !activeAbilityCommands(ability, used, window).some((c) =>
      sameJson(c, command),
    )
  )
    throw new Error("技能的时机、目标或剩余次数无效。");
  const result = effect();
  return { used: used + 1, result };
}
