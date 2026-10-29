import type { CardModel } from "../../../../domains/card/model";
import { instanceLabel } from "../../../../domains/card/collections";
import type {
  ModulePresentation,
  ModulePlayProps,
  ModuleEditorProps,
} from "../../../composition/ui";
import { HeroesEditor } from "../../../modules/heroes/Editor";
import { HeroesPanel } from "../../../modules/heroes/Panel";
import type { HeroesConfig } from "../../../modules/heroes/model";
import type {
  CardScoringCommand,
  CardScoringView,
} from "../../composition/contracts";
import { cardHeroesConfig, cardHeroesWindow } from "./module";
function Editor({ model, update }: ModuleEditorProps<CardModel>) {
  return (
    <HeroesEditor
      config={cardHeroesConfig(model)}
      update={(change) =>
        update((m) => change(m.extensions!.heroes as HeroesConfig))
      }
    />
  );
}
function Panel(
  props: ModulePlayProps<CardModel, CardScoringCommand, CardScoringView>,
) {
  return (
    <HeroesPanel
      {...props}
      config={cardHeroesConfig(props.model)}
      view={cardHeroesWindow(props.view)}
      unavailableReason="本局已结束"
      formatCard={instanceLabel}
    />
  );
}
function Seat({
  model,
  view,
  seat,
}: ModulePlayProps<CardModel, CardScoringCommand, CardScoringView>) {
  const config = cardHeroesConfig(model);
  if (!config || !view.heroes || seat === undefined) return null;
  return (
    <small className="ability-opponent-hero">
      {config.seats[seat].name} · 技能剩余{" "}
      {config.seats[seat].skill.uses - view.heroes.used[seat]} 次
    </small>
  );
}
export const cardHeroesPresentation: ModulePresentation<
  CardModel,
  CardScoringCommand,
  CardScoringView
> = {
  id: "heroes",
  Editor,
  slots: { "before-hand": Panel, opponent: Seat },
};
