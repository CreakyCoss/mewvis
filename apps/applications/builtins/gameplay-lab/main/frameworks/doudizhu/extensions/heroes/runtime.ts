import type { DoudizhuModel } from "../../model";
import type { DoudizhuView } from "../../runtime/contracts";
import { heroAbilityCommands } from "../../../modules/heroes/runtime";
export {
  revealHeroCards,
  type HeroCommand,
} from "../../../modules/heroes/runtime";
export const heroCommands = (model: DoudizhuModel, view: DoudizhuView) =>
  heroAbilityCommands(model.extensions.heroes, {
    ...view,
    timing: view.phase === "playing" ? "before-play" : null,
  });
