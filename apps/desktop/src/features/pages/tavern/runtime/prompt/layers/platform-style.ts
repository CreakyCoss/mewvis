import type { TavernPlatformStyle } from "../../../prompt-registry/rule-layers/types";
import type { TavernPromptSection } from "../shared/sections";

export const buildPlatformStyleSection = ({
  platformStyle,
  target,
}: {
  platformStyle: TavernPlatformStyle;
  target: "bridge" | "character";
}): TavernPromptSection => ({
  id: "platform-style",
  layer: "tavern",
  tag: "platform_style",
  attributes: target === "character"
    ? {
        id: platformStyle.id,
        label: platformStyle.label,
        target,
      }
    : {
        id: platformStyle.id,
        label: platformStyle.label,
      },
  content: target === "bridge"
    ? platformStyle.bridgeAddendum
    : platformStyle.characterAddendum,
});
