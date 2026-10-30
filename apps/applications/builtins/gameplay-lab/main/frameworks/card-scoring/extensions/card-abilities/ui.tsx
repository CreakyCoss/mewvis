import type { CardModel } from "../../../../domains/card/model";
import type { ModulePresentation } from "../../../composition/ui";
import type {
  CardScoringCommand,
  CardScoringView,
} from "../../composition/contracts";
import { CardAbilitiesEditor } from "./Editor";
import { CardAbilitiesPanel } from "./Panel";
export const cardAbilitiesPresentation: ModulePresentation<
  CardModel,
  CardScoringCommand,
  CardScoringView
> = {
  id: "card-abilities",
  Editor: CardAbilitiesEditor,
  slots: { "before-hand": CardAbilitiesPanel },
};
