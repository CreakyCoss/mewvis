import type { UIContributionFor, UISlotDefinition } from "../index.js";
import { ExtensionSlot, type ExtensionSlotProps, type SlotItem } from "./index";

type TextDefinition = Extract<UISlotDefinition, { type: "text" }>;
export type TextSlotItem = SlotItem<UIContributionFor<TextDefinition>>;
export type TextSlotProps<D extends TextDefinition = TextDefinition> =
  ExtensionSlotProps<D>;

/** Structured text/tone data: the page draws it directly, without an iframe. */
export function TextSlot<D extends TextDefinition>(props: TextSlotProps<D>) {
  return <ExtensionSlot<D> {...props} />;
}
