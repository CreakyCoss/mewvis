import type { UIContributionFor, UISlotDefinition } from "@isle/extension-sdk/ui";
import { ExtensionSlot, type ExtensionSlotProps, type SlotItem } from ".";

type SidebarDefinition = Extract<UISlotDefinition, { type: "sidebar" }>;
export type SidebarSlotItem = SlotItem<UIContributionFor<SidebarDefinition>>;
export type SidebarSlotProps<D extends SidebarDefinition = SidebarDefinition> = ExtensionSlotProps<D>;

/** Sidebar metadata + lazy plugin view; layout and selection belong to the caller. */
export function SidebarSlot<D extends SidebarDefinition>(props: SidebarSlotProps<D>) {
  return <ExtensionSlot<D> {...props} />;
}
