import type { PokerCard } from "../../model";
import type {
  HeroReveal as Reveal,
  HeroesState as State,
  HeroesView as View,
} from "../../../modules/heroes/model";
export {
  createHeroesConfig,
  validateHeroes,
  type HeroesConfig,
  type HeroDefinition,
} from "../../../modules/heroes/model";
export type HeroReveal = Reveal<PokerCard>;
export type HeroesState = State<PokerCard>;
export type HeroesView = View<PokerCard>;
