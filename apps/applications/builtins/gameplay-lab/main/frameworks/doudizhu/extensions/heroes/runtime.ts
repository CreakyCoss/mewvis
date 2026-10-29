import type { DoudizhuModel, PokerCard } from "../../model";
import type { DoudizhuView } from "../../runtime/contracts";

export interface HeroCommand {
  type: "skill";
  player: number;
  skillId: string;
  target: number;
}

export function heroCommands(
  model: DoudizhuModel,
  view: DoudizhuView,
): HeroCommand[] {
  const config = model.extensions.heroes,
    hero = config?.seats[view.player];
  if (
    !config?.enabled ||
    !hero ||
    !view.heroes ||
    view.phase !== "playing" ||
    view.actor !== view.player ||
    view.heroes.used[view.player] >= hero.skill.uses
  )
    return [];
  return [0, 1, 2]
    .filter((target) => target !== view.player && view.counts[target] > 0)
    .map((target) => ({
      type: "skill",
      player: view.player,
      skillId: hero.skill.id,
      target,
    }));
}

// Uses only the frozen seed and command position; replay needs no external RNG.
export function revealHeroCards(
  hand: PokerCard[],
  count: number,
  seed: number,
): PokerCard[] {
  const cards = [...hand].sort((a, b) => a.id.localeCompare(b.id));
  let random = seed >>> 0;
  for (let i = cards.length - 1; i > 0; i--) {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    const j = Math.floor((random / 4294967296) * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards.slice(0, count);
}
