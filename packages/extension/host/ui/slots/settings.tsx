import { ExtensionSlot, type SlotProps } from "./index";
import { uiSlotDefinitions } from "../index.js";

type WithoutTarget<P> = P extends unknown
  ? Omit<P, "definition" | "context">
  : never;
export type SettingsSlotProps = WithoutTarget<
  SlotProps<typeof uiSlotDefinitions.pluginSettings>
>;
/** Plugin-owned editor. Management pages supply only the selected plugin identity. */
export function SettingsSlot(props: SettingsSlotProps) {
  if (props.renderAll)
    return (
      <ExtensionSlot
        {...props}
        definition={uiSlotDefinitions.pluginSettings}
        context={{}}
        renderAll={props.renderAll}
      />
    );
  return (
    <ExtensionSlot
      {...props}
      definition={uiSlotDefinitions.pluginSettings}
      context={{}}
      render={props.render ?? ((item) => item.renderView())}
    />
  );
}
