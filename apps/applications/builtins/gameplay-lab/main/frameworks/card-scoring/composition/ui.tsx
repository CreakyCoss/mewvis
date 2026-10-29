import type { CardModel } from "../../../domains/card/model";
import { assembledModuleEditors, renderModuleSlot } from "../../composition/ui";
import { cardHeroesPresentation } from "../extensions/heroes/ui";
import { pairRewardPresentation } from "../extensions/pair-reward/ui";
import { CardTable } from "../play/CardTable";
import type { NumericSceneProps } from "../../numeric-ui-contracts";
import { resolveCardScoringComposition } from "./catalog";
import { cardScoringRunAtStep, cardScoringRuntime } from "./runtime";
export const cardScoringPresentations = [
  pairRewardPresentation,
  cardHeroesPresentation,
] as const;
export const cardScoringModuleEditors = (model: CardModel) =>
  assembledModuleEditors(
    resolveCardScoringComposition(model, true),
    cardScoringPresentations,
  );
export function ComposedCardTable(props: NumericSceneProps) {
  const run = props.trial.run;
  if (run.model.format !== "gameplay-card-v1") return null;
  const model = run.model,
    composition = resolveCardScoringComposition(model);
  const index =
    props.cursor >= 0
      ? Math.min(props.cursor, run.entries.length - 1)
      : run.entries.length - 1;
  const prefix = cardScoringRunAtStep(run, index),
    player = prefix.entries.at(-1)!.state.actor;
  const view = cardScoringRuntime.observe(model, prefix, player);
  return (
    <CardTable
      {...props}
      slots={{
        beforeHand: renderModuleSlot(
          composition,
          cardScoringPresentations,
          "before-hand",
          {
            model,
            view,
            busy: props.busy,
            readOnly: props.readOnly || props.cursor >= 0,
            execute: (command) =>
              command.type === "action"
                ? props.executeChoice(command.choice)
                : props.executeChoice({ action: "__module", command }),
          },
        ),
        opponent: (seat) =>
          renderModuleSlot(composition, cardScoringPresentations, "opponent", {
            model,
            view,
            seat,
            busy: props.busy,
            readOnly: props.readOnly || props.cursor >= 0,
            execute: () => {},
          }),
        scoreDetail: (actionId) => {
          const nodes = renderModuleSlot(
            composition,
            cardScoringPresentations,
            "score-detail",
            {
              model,
              view,
              actionId,
              selected: props.cards,
              busy: props.busy,
              readOnly: props.readOnly || props.cursor >= 0,
              execute: (command) => {
                if (command.type === "action")
                  props.execute(command.choice.action);
              },
            },
          );
          return nodes.length ? nodes : null;
        },
      }}
    />
  );
}
