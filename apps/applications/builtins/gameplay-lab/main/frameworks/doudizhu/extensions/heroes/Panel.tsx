import { rankLabel, type DoudizhuModel } from "../../model";
import type { DoudizhuCommand, DoudizhuView } from "../../runtime/game";
import { HeroesPanel as SharedPanel } from "../../../modules/heroes/Panel";
export function HeroesPanel(props: {
  model: DoudizhuModel;
  view: DoudizhuView;
  busy: boolean;
  readOnly: boolean;
  execute(command: DoudizhuCommand): void;
}) {
  return (
    <SharedPanel
      {...props}
      config={props.model.extensions.heroes}
      view={{
        ...props.view,
        timing: props.view.phase === "playing" ? "before-play" : null,
      }}
      unavailableReason={
        props.view.phase === "bidding" ? "叫分结束后可用" : "本局已结束"
      }
      formatCard={(card) => rankLabel(card.rank) + card.suit}
    />
  );
}
