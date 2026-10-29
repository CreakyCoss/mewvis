import type {
  ModulePlayProps,
  ModulePresentation,
} from "../../../composition/ui";
import type { DoudizhuModel } from "../../model";
import type { DoudizhuCommand, DoudizhuView } from "../../runtime/contracts";
import { HeroesEditor } from "./Editor";
import { HeroesPanel } from "./Panel";

function HeroesSeat({
  model,
  view,
  seat,
}: ModulePlayProps<DoudizhuModel, DoudizhuCommand, DoudizhuView>) {
  const config = model.extensions.heroes;
  if (!config?.enabled || !view.heroes || seat === undefined) return null;
  return (
    <small className="poker-opponent-hero">
      {config.seats[seat].name} · 技能剩余{" "}
      {config.seats[seat].skill.uses - view.heroes.used[seat]} 次
    </small>
  );
}
export const heroesPresentation: ModulePresentation<
  DoudizhuModel,
  DoudizhuCommand,
  DoudizhuView
> = {
  id: "heroes",
  Editor: HeroesEditor,
  slots: { "before-hand": HeroesPanel, opponent: HeroesSeat },
};
