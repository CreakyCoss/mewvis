import { UIIcon } from "./icons";
import type { UIContributionFor, UISlotDefinition } from "../index.js";
import { ExtensionSlot, type SlotProps, type SlotItem } from "./index";

type SidebarDefinition = Extract<UISlotDefinition, { type: "sidebar" }>;
export type SidebarSlotItem = SlotItem<UIContributionFor<SidebarDefinition>>;
export type SidebarSlotProps<D extends SidebarDefinition = SidebarDefinition> =
  SlotProps<D>;

function DefaultSidebar({ item }: { item: SidebarSlotItem }) {
  return (
    <section
      aria-label={item.title}
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-surface"
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3 text-sm font-medium">
        <UIIcon name={item.icon} className="size-4 shrink-0" />
        <h2>{item.title}</h2>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        {item.renderView()}
      </div>
    </section>
  );
}

/** Defaults to a titled panel; override rendering for page-specific layout and selection. */
export function SidebarSlot<D extends SidebarDefinition>(
  props: SidebarSlotProps<D>,
) {
  if (props.renderAll)
    return <ExtensionSlot<D> {...props} renderAll={props.renderAll} />;
  // The constrained definition and ExtensionSlot filtering guarantee this contribution type.
  return (
    <ExtensionSlot<D>
      {...props}
      render={
        props.render ??
        ((item) => <DefaultSidebar item={item as SidebarSlotItem} />)
      }
    />
  );
}
