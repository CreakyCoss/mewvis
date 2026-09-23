import type { UIContributionFor, UISlotDefinition } from "../index.js";
import { ExtensionSlot, type SlotProps, type SlotItem } from "./index";

type TextDefinition = Extract<UISlotDefinition, { type: "text" }>;
export type TextSlotItem = SlotItem<UIContributionFor<TextDefinition>>;
export type TextSlotProps<D extends TextDefinition = TextDefinition> =
  SlotProps<D>;

function DefaultText({ item }: { item: TextSlotItem }) {
  const tones = {
    neutral: "text-muted-foreground",
    info: "text-info",
    warning: "text-warning",
  };
  return (
    <span
      className={`whitespace-pre-wrap text-sm ${tones[item.tone ?? "neutral"]}`}
    >
      {item.text}
    </span>
  );
}

/** Defaults to tone-aware text; override rendering to use structured fields in any layout. */
export function TextSlot<D extends TextDefinition>(props: TextSlotProps<D>) {
  if (props.renderAll)
    return <ExtensionSlot<D> {...props} renderAll={props.renderAll} />;
  // The constrained definition and ExtensionSlot filtering guarantee this contribution type.
  return (
    <ExtensionSlot<D>
      {...props}
      render={
        props.render ?? ((item) => <DefaultText item={item as TextSlotItem} />)
      }
    />
  );
}
