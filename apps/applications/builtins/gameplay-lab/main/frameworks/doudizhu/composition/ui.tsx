import { assembledModuleEditors, renderModuleSlot } from "../../composition/ui";
import { heroesPresentation } from "../extensions/heroes/ui";
import type { DoudizhuModel } from "../model";
import { DoudizhuTable, type DoudizhuTableProps } from "../play/Table";
import { resolveDoudizhuComposition } from "./catalog";

// UI registration is separate from deterministic runtime registration.
export const doudizhuPresentations = [heroesPresentation] as const;
export const doudizhuModuleEditors = (model: DoudizhuModel) =>
  assembledModuleEditors(
    resolveDoudizhuComposition(model, true),
    doudizhuPresentations,
  );
export function ComposedDoudizhuTable(
  props: Omit<DoudizhuTableProps, "slots">,
) {
  const composition = resolveDoudizhuComposition(props.model);
  return (
    <DoudizhuTable
      {...props}
      slots={{
        beforeHand: renderModuleSlot(
          composition,
          doudizhuPresentations,
          "before-hand",
          props,
        ),
        opponent: (seat) =>
          renderModuleSlot(composition, doudizhuPresentations, "opponent", {
            ...props,
            seat,
          }),
      }}
    />
  );
}
